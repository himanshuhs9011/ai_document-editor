"""Database connection and query helpers: Postgres online (tables built by Prisma), SQLite in the desktop app.

The query modules are written once, in Postgres SQL. With a sqlite:/// URL the same helpers translate the few
Postgres-only pieces they use ($n parameters, now(), = ANY(list), left()) and return rows the same way: dicts with
timestamps as UTC datetimes and JSON columns decoded.
"""
import asyncio
import json
import logging
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, List, Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None
_sqlite: Optional["SQLiteDatabase"] = None

CONNECT_ATTEMPTS = 4
SQLITE_PREFIX = "sqlite:///"
SQLITE_SCHEMA = Path(__file__).with_name("sqlite_schema.sql")
SQLITE_NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')"
JSON_COLUMNS = frozenset({"metadata"})
BOOL_COLUMNS = frozenset({"is_active"})  # SQLite stores booleans as 0/1

_ANY = re.compile(r"=\s*ANY\(\$(\d+)::text\[\]\)")
_LEFT = re.compile(r"\bleft\(([^,()]+),\s*")
_NOW = re.compile(r"\bnow\(\)")
_PARAM = re.compile(r"\$(\d+)")


def is_sqlite(url: str) -> bool:
    return url.startswith(SQLITE_PREFIX)


def translate(query: str, args: tuple) -> tuple:
    """Postgres SQL and arguments as SQLite runs them."""
    lists = {int(number) for number in _ANY.findall(query)}
    query = _ANY.sub(lambda match: f"IN (SELECT value FROM json_each(?{match.group(1)}))", query)
    query = _LEFT.sub(r"substr(\1, 1, ", query)
    query = _NOW.sub(SQLITE_NOW, query)
    query = _PARAM.sub(r"?\1", query)
    params = []
    for position, value in enumerate(args, start=1):
        if position in lists or isinstance(value, (list, tuple, dict)):
            value = json.dumps(list(value) if isinstance(value, tuple) else value)
        elif isinstance(value, datetime):
            value = value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        params.append(value)
    return query, params


def _row(row: sqlite3.Row) -> dict:
    """A SQLite row shaped like the asyncpg record the query modules expect."""
    record = {}
    for key in row.keys():
        value = row[key]
        if isinstance(value, str) and key.endswith("_at"):
            parsed = datetime.fromisoformat(value)
            value = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        elif isinstance(value, str) and key in JSON_COLUMNS:
            value = json.loads(value or "{}")
        elif key in BOOL_COLUMNS and value is not None:
            value = bool(value)
        record[key] = value
    return record


class SQLiteDatabase:
    """One connection to the desktop app's database file; statements run one at a time off the event loop."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        # isolation_level=None: each statement commits itself; transactions are begun explicitly.
        self.connection = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.executescript(SQLITE_SCHEMA.read_text(encoding="utf-8"))
        self.lock = asyncio.Lock()

    def _run(self, query: str, args: tuple, mode: str) -> Any:
        sql, params = translate(query, args)
        if mode == "many":
            cursor = self.connection.executemany(sql, params)
            return f"INSERT {cursor.rowcount}"
        cursor = self.connection.execute(sql, params)
        if mode == "execute":
            rows = cursor.fetchall()  # finishes statements with RETURNING
            return f"{sql.split(None, 1)[0].upper()} {cursor.rowcount if cursor.rowcount >= 0 else len(rows)}"
        rows = [_row(row) for row in cursor.fetchall()]
        if mode == "fetch":
            return rows
        if mode == "fetchrow":
            return rows[0] if rows else None
        return next(iter(rows[0].values())) if rows else None

    async def run(self, query: str, args: tuple, mode: str, locked: bool = False) -> Any:
        if locked:
            return await asyncio.to_thread(self._run, query, args, mode)
        async with self.lock:
            return await asyncio.to_thread(self._run, query, args, mode)

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator["_SQLiteConnection"]:
        """Holds the database for a group of statements (used with .transaction())."""
        async with self.lock:
            yield _SQLiteConnection(self)

    def close(self) -> None:
        self.connection.close()


class _SQLiteConnection:
    """The asyncpg connection methods the query modules use, on the already-held SQLite database."""

    def __init__(self, database: SQLiteDatabase):
        self.database = database

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        await asyncio.to_thread(self.database.connection.execute, "BEGIN")
        try:
            yield
        except BaseException:
            await asyncio.to_thread(self.database.connection.execute, "ROLLBACK")
            raise
        await asyncio.to_thread(self.database.connection.execute, "COMMIT")

    async def execute(self, query: str, *args: Any) -> str:
        return await self.database.run(query, args, "execute", locked=True)

    async def executemany(self, query: str, rows: List[tuple]) -> None:
        sql = translate(query, ())[0]
        params = [translate(query, tuple(row))[1] for row in rows]
        await asyncio.to_thread(self.database.connection.executemany, sql, params)

    async def fetch(self, query: str, *args: Any) -> List[dict]:
        return await self.database.run(query, args, "fetch", locked=True)

    async def fetchrow(self, query: str, *args: Any) -> Optional[dict]:
        return await self.database.run(query, args, "fetchrow", locked=True)

    async def fetchval(self, query: str, *args: Any) -> Any:
        return await self.database.run(query, args, "fetchval", locked=True)


async def _init_connection(connection: asyncpg.Connection) -> None:
    await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def _is_pooled(url: str) -> bool:
    """Neon's "-pooler" hosts (PgBouncer) can't reuse prepared statements across transactions."""
    return "-pooler." in url


async def connect(url: str) -> None:
    global _pool, _sqlite
    if is_sqlite(url):
        _sqlite = SQLiteDatabase(Path(url[len(SQLITE_PREFIX):]))
        logger.info("Using the local database file")
        return
    options = {"statement_cache_size": 0} if _is_pooled(url) else {}
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            _pool = await asyncpg.create_pool(url, min_size=1, max_size=10, init=_init_connection, timeout=30, **options)
            return
        except (OSError, asyncpg.PostgresError) as error:
            # A scaled-to-zero Neon database takes a few seconds to wake up.
            if attempt == CONNECT_ATTEMPTS:
                raise
            logger.warning("Database not reachable yet (%s); retrying", error)
            await asyncio.sleep(2 * attempt)


async def close() -> None:
    global _sqlite
    if _pool:
        await _pool.close()
    if _sqlite:
        _sqlite.close()
        _sqlite = None


def pool() -> Any:
    if _sqlite:
        return _sqlite
    if _pool is None:
        raise RuntimeError("Database is not connected")
    return _pool


async def fetch(query: str, *args: Any) -> List[Any]:
    return await _sqlite.run(query, args, "fetch") if _sqlite else await pool().fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> Optional[Any]:
    return await _sqlite.run(query, args, "fetchrow") if _sqlite else await pool().fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    return await _sqlite.run(query, args, "fetchval") if _sqlite else await pool().fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    return await _sqlite.run(query, args, "execute") if _sqlite else await pool().execute(query, *args)


def iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None
