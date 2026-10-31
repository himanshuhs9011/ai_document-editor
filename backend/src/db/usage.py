"""Queries for ai_usage: per-user daily AI request counts."""
from .database import fetchval


async def consume(user_id: str, daily_limit: int) -> bool:
    """Count one AI request for today; False (and nothing counted) when the limit is reached."""
    if daily_limit <= 0:
        return False
    count = await fetchval(
        """INSERT INTO ai_usage (user_id, day, count) VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
           WHERE ai_usage.count < $2
           RETURNING count""",
        user_id, daily_limit,
    )
    return count is not None


async def used_today(user_id: str) -> int:
    return await fetchval("SELECT count FROM ai_usage WHERE user_id = $1 AND day = CURRENT_DATE", user_id) or 0
