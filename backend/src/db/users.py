"""Queries for the users table."""
from datetime import datetime
from typing import Optional

from .database import execute, fetch, fetchrow


async def get_by_email(email: str) -> Optional[dict]:
    row = await fetchrow("SELECT * FROM users WHERE email = $1", email)
    return dict(row) if row else None


async def get_by_id(user_id: str) -> Optional[dict]:
    row = await fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row) if row else None


async def find_conflict(email: str, username: str) -> Optional[str]:
    """Return which unique field ("email" or "username") is already taken."""
    rows = await fetch("SELECT email FROM users WHERE email = $1 OR username = $2", email, username)
    if any(row["email"] == email for row in rows):
        return "email"
    return "username" if rows else None


async def insert(user_id: str, email: str, username: str, full_name: Optional[str], password_hash: str) -> dict:
    row = await fetchrow(
        """INSERT INTO users (id, email, username, full_name, password_hash)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        user_id, email, username, full_name, password_hash,
    )
    return dict(row)


async def set_plan(user_id: str, plan: str, expires_at: Optional[datetime]) -> None:
    await execute(
        "UPDATE users SET plan = $2, plan_expires_at = $3, updated_at = now() WHERE id = $1",
        user_id, plan, expires_at,
    )
