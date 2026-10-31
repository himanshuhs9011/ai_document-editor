"""One-time copy of the old local SQLite data (data/sessions.db) into Postgres.

Usage (from backend/, after `npm run db:deploy`):  python scripts/import_sqlite.py [path/to/sessions.db]
Rows that already exist in Postgres are skipped, so it is safe to run twice.
"""
import asyncio
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import settings  # noqa: E402
from src.db import database  # noqa: E402


def _time(value):
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _rows(connection, query):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(query)]


async def main(path: Path) -> None:
    old = sqlite3.connect(path)
    users = _rows(old, "SELECT * FROM users")
    sessions = [s for s in _rows(old, "SELECT * FROM sessions") if s.get("user_id")]
    messages = _rows(old, "SELECT * FROM messages")
    documents = {d["id"]: d for d in _rows(old, "SELECT * FROM documents")}
    owner_of_document = {s["document_id"]: s["user_id"] for s in sessions if s.get("document_id")}

    await database.connect(settings.database_url)
    async with database.pool().acquire() as db, db.transaction():
        for u in users:
            await db.execute(
                """INSERT INTO users (id, email, username, full_name, password_hash, is_active, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING""",
                u["id"], u["email"], u["username"], u["full_name"], u["password_hash"],
                bool(u["is_active"]), _time(u["created_at"]),
            )
        for document_id, user_id in owner_of_document.items():
            d = documents.get(document_id)
            if not d:
                continue
            metadata = json.loads(d["metadata"]) if d["metadata"] else {}
            await db.execute(
                """INSERT INTO documents (id, user_id, filename, file_type, page_count, text, html, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING""",
                d["id"], user_id, d["filename"] or "Document", d["file_type"] or "html", d["page_count"] or 1,
                d["extracted_text"] or metadata.get("plain_text") or "", metadata.get("html_content"),
                _time(d["created_at"]),
            )
        session_ids = set()
        for s in sessions:
            document_id = s["document_id"] if s.get("document_id") in documents else None
            await db.execute(
                """INSERT INTO sessions (id, user_id, name, document_id, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING""",
                s["id"], s["user_id"], s.get("name") or f"Session {str(s['created_at'])[:10]}", document_id,
                _time(s["created_at"]), _time(s.get("updated_at") or s["created_at"]),
            )
            session_ids.add(s["id"])
        imported = 0
        for m in messages:
            if m["session_id"] in session_ids:
                await db.execute(
                    """INSERT INTO messages (id, session_id, role, content, created_at)
                       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING""",
                    m["id"], m["session_id"], m["role"], m["content"] or "", _time(m["timestamp"]),
                )
                imported += 1
    await database.close()
    print(f"Imported {len(users)} users, {len(session_ids)} sessions, {imported} messages, "
          f"{len(owner_of_document)} documents (sessions without an owner were skipped).")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/sessions.db")))
