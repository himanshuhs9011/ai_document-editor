"""Postgres connection pool and query helpers (tables are created by Prisma migrations)."""
import asyncio
import json
import logging
from datetime import datetime
from typing import Any, List, Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

CONNECT_ATTEMPTS = 4


async def _init_connection(connection: asyncpg.Connection) -> None:
    await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def _is_pooled(url: str) -> bool:
    """Neon's "-pooler" hosts (PgBouncer) can't reuse prepared statements across transactions."""
    return "-pooler." in url


async def connect(url: str) -> None:
    global _pool
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
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database is not connected")
    return _pool


async def fetch(query: str, *args: Any) -> List[asyncpg.Record]:
    return await pool().fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> Optional[asyncpg.Record]:
    return await pool().fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    return await pool().fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    return await pool().execute(query, *args)


def iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None
