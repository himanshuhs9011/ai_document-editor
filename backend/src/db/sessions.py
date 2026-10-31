"""Queries for the sessions table."""
import uuid
from typing import List, Optional

import asyncpg

from .database import execute, fetch, fetchrow, fetchval, iso


def _to_dict(row: asyncpg.Record) -> dict:
    return {
        "id": row["id"],
        "document_id": row["document_id"],
        "created_at": iso(row["created_at"]),
        "last_accessed": iso(row["updated_at"]),
        "metadata": row["metadata"] or {},
        "name": row["name"],
        "updated_at": iso(row["updated_at"]),
        "user_id": row["user_id"],
    }


async def create(name: str, user_id: str) -> dict:
    row = await fetchrow(
        "INSERT INTO sessions (id, user_id, name) VALUES ($1, $2, $3) RETURNING *",
        str(uuid.uuid4()), user_id, name,
    )
    return _to_dict(row)


async def get_owned(session_id: str, user_id: str) -> Optional[dict]:
    row = await fetchrow("SELECT * FROM sessions WHERE id = $1 AND user_id = $2", session_id, user_id)
    return _to_dict(row) if row else None


async def list_for_user(user_id: str) -> List[dict]:
    rows = await fetch("SELECT * FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC", user_id)
    return [_to_dict(row) for row in rows]


async def rename(session_id: str, name: str) -> None:
    await execute("UPDATE sessions SET name = $2, updated_at = now() WHERE id = $1", session_id, name)


async def attach_document(session_id: str, document_id: str) -> None:
    await execute("UPDATE sessions SET document_id = $2, updated_at = now() WHERE id = $1", session_id, document_id)


async def delete(session_id: str) -> None:
    """Deletes the session, its messages, and its document when no other session uses it."""
    document_id = await fetchval("DELETE FROM sessions WHERE id = $1 RETURNING document_id", session_id)
    if document_id:
        await execute(
            "DELETE FROM documents WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM sessions WHERE document_id = $1)",
            document_id,
        )
