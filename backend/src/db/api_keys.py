"""Queries for api_keys: users' own model-provider keys (stored encrypted)."""
import uuid
from typing import List, Optional

import asyncpg

from .database import execute, fetch, fetchrow, iso, pool

PUBLIC_COLUMNS = "id, provider, model, base_url, key_hint, is_active, created_at"


def _public(row: asyncpg.Record) -> dict:
    return {**dict(row), "created_at": iso(row["created_at"])}


async def list_for_user(user_id: str) -> List[dict]:
    rows = await fetch(f"SELECT {PUBLIC_COLUMNS} FROM api_keys WHERE user_id = $1 ORDER BY created_at", user_id)
    return [_public(row) for row in rows]


async def upsert_active(user_id: str, provider: str, model: str, base_url: Optional[str],
                        encrypted_key: str, key_hint: str) -> dict:
    """Save the key for this provider and make it the one in use."""
    async with pool().acquire() as connection, connection.transaction():
        await connection.execute("UPDATE api_keys SET is_active = false WHERE user_id = $1", user_id)
        row = await connection.fetchrow(
            f"""INSERT INTO api_keys (id, user_id, provider, model, base_url, encrypted_key, key_hint, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true)
                ON CONFLICT (user_id, provider) DO UPDATE SET model = $4, base_url = $5,
                    encrypted_key = $6, key_hint = $7, is_active = true
                RETURNING {PUBLIC_COLUMNS}""",
            str(uuid.uuid4()), user_id, provider, model, base_url, encrypted_key, key_hint,
        )
    return _public(row)


async def set_active(key_id: str, user_id: str, active: bool) -> bool:
    async with pool().acquire() as connection, connection.transaction():
        if active:
            await connection.execute("UPDATE api_keys SET is_active = false WHERE user_id = $1", user_id)
        result = await connection.execute(
            "UPDATE api_keys SET is_active = $3 WHERE id = $1 AND user_id = $2", key_id, user_id, active
        )
    return result.endswith(" 1")


async def delete(key_id: str, user_id: str) -> bool:
    result = await execute("DELETE FROM api_keys WHERE id = $1 AND user_id = $2", key_id, user_id)
    return result.endswith(" 1")


async def get_active(user_id: str) -> Optional[dict]:
    row = await fetchrow("SELECT * FROM api_keys WHERE user_id = $1 AND is_active", user_id)
    return dict(row) if row else None
