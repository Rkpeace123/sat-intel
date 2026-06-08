"""
Intelligence route — the single pipeline endpoint.

Every channel (web, WhatsApp, IVR, avatar) posts here.
Verdict is computed deterministically; events are published to Redis Streams.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.auth import User
from app.models.response import Response
from app.redis_client import incr_metric, publish
from app.services.collection_service import score_response

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


class AnswerIn(BaseModel):
    response_id:   str
    paradata:      dict = {}
    enumerator_id: str | None = None


@router.post("/answer")
async def answer(
    body: AnswerIn,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(require("collect:write")),
):
    """
    Run the deterministic verdict pipeline for a submitted response.
    Publishes Redis events: response.scored, flag.created, trust.updated.
    Returns the full IntelligenceOutput.
    """
    response = await db.get(Response, body.response_id)
    if not response:
        raise HTTPException(404, f"response {body.response_id!r} not found")

    enumerator_ctx = None
    if body.enumerator_id:
        from app.models.field import Enumerator
        enumerator = await db.get(Enumerator, body.enumerator_id)
        if enumerator:
            enumerator_ctx = {
                "score": enumerator.trust_score,
                "trend": enumerator.trust_trend or [],
                "level": enumerator.trust_level,
            }

    result = await score_response(db, response, body.paradata, enumerator_ctx)

    # Phase 13: publish events exactly where the orchestrator decided them
    await incr_metric("responses_today")
    base_payload = {
        "response_id":   body.response_id,
        "enumerator_id": body.enumerator_id,
        "confidence":    result["trust"]["confidence"],
        "risk_level":    result["trust"]["risk_level"],
        "reasons":       result["trust"]["reasons"][:3],
    }
    for event in result["events"]:
        await publish(event, base_payload)
        if event == "flag.created":
            await incr_metric("flagged")

    return result
