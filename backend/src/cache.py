"""Small key-value cache and rate limiter on Redis, with an in-memory fallback for local runs."""
import json
import logging
import time
from typing import Any, Dict, Optional, Tuple

import redis.asyncio as redis

logger = logging.getLogger(__name__)

_client: Optional[redis.Redis] = None
_memory: Dict[str, Tuple[float, Any]] = {}


async def connect(url: Optional[str]) -> None:
    global _client
    if not url:
        logger.info("REDIS_URL not set; using in-memory cache")
        return
    _client = redis.from_url(url, decode_responses=True)
    await _client.ping()


async def close() -> None:
    if _client:
        await _client.aclose()


def _memory_get(key: str) -> Any:
    expires, value = _memory.get(key, (0, None))
    return value if expires > time.time() else None


async def get_json(key: str) -> Any:
    if _client:
        raw = await _client.get(key)
        return json.loads(raw) if raw else None
    return _memory_get(key)


async def set_json(key: str, value: Any, ttl_seconds: int) -> None:
    if _client:
        await _client.set(key, json.dumps(value), ex=ttl_seconds)
    else:
        _memory[key] = (time.time() + ttl_seconds, value)


async def allow(key: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window rate limit: True while fewer than `limit` hits happened in this window."""
    bucket = f"rate:{key}:{int(time.time() // window_seconds)}"
    if _client:
        count = await _client.incr(bucket)
        if count == 1:
            await _client.expire(bucket, window_seconds)
    else:
        count = (_memory_get(bucket) or 0) + 1
        _memory[bucket] = (time.time() + window_seconds, count)
    return count <= limit
