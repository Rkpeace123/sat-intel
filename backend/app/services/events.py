"""
Typed event helpers — thin wrappers over redis_client.publish.
Phase 13: collection_service and routes call these instead of raw publish().
"""
from __future__ import annotations

from app.redis_client import publish


async def response_scored(response_id: str, confidence: float, risk_level: str) -> None:
    await publish("response.scored", {
        "response_id": response_id,
        "confidence":  confidence,
        "risk_level":  risk_level,
    })


async def flag_created(response_id: str, enumerator_id: str | None, reasons: list[str]) -> None:
    await publish("flag.created", {
        "response_id":   response_id,
        "enumerator_id": enumerator_id,
        "reasons":       reasons[:3],
    })


async def trust_updated(enumerator_id: str, score: float, level: str) -> None:
    await publish("trust.updated", {
        "enumerator_id": enumerator_id,
        "score":         score,
        "level":         level,
    })
