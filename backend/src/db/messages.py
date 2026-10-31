"""Queries for the messages table."""
import uuid
from typing import List

from .database import execute, fetch, iso, pool


async def add(session_id: str, role: str, content: str) -> None:
    async with pool().acquire() as connection, connection.transaction():
        await connection.execute(
            "INSERT INTO messages (id, session_id, role, content) VALUES ($1, $2, $3, $4)",
            str(uuid.uuid4()), session_id, role, content,
        )
        await connection.execute("UPDATE sessions SET updated_at = now() WHERE id = $1", session_id)


async def list_for_session(session_id: str) -> List[dict]:
    rows = await fetch(
        "SELECT id, role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at, id",
        session_id,
    )
    return [{"id": r["id"], "role": r["role"], "content": r["content"], "timestamp": iso(r["created_at"])} for r in rows]
