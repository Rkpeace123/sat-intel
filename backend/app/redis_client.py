"""
Redis asyncio client — Phase 13.

Provides:
  publish(event, payload)         — append to durable stream + pub/sub channel
  read_since(last_id, block_ms)   — long-poll the stream (WebSocket consumer)
  incr_metric(key, by)            — increment a dashboard counter
  get_metrics()                   — read dashboard counters
"""
from __future__ import annotations

import json

import redis.asyncio as aioredis

from app.config import settings

# Single connection pool — shared across the process
_pool: aioredis.Redis = aioredis.from_url(
    settings.redis_url,
    encoding="utf-8",
    decode_responses=True,
)

STREAM = "satark:events"


async def publish(event: str, payload: dict) -> None:
    """
    Append event to the durable stream (cap 5000) AND the pub/sub channel.
    The dashboard WebSocket consumer reads the stream; real-time subscribers
    use the pub/sub channel.
    """
    body = {"event": event, "data": json.dumps(payload)}
    await _pool.xadd(STREAM, body, maxlen=5000, approximate=True)
    await _pool.publish(f"satark:channel:{event}", json.dumps(payload))


async def read_since(last_id: str = "$", block_ms: int = 3000) -> list[dict]:
    """
    Long-poll the stream.  Returns at most 50 entries since last_id.
    block_ms=3000: WebSocket consumer cadence; also the polling fallback interval.
    """
    res = await _pool.xread({STREAM: last_id}, block=block_ms, count=50)
    out: list[dict] = []
    if res:
        for _stream, entries in res:
            for eid, fields in entries:
                out.append({
                    "id":    eid,
                    "event": fields["event"],
                    "data":  json.loads(fields["data"]),
                })
    return out


async def incr_metric(key: str, by: int = 1) -> int:
    return int(await _pool.incr(f"satark:metric:{key}", by))


async def get_metrics() -> dict:
    keys = ["responses_today", "flagged", "active_enumerators"]
    vals = await _pool.mget(*[f"satark:metric:{k}" for k in keys])
    return {k: int(v or 0) for k, v in zip(keys, vals)}


async def close() -> None:
    await _pool.aclose()
