"""
Dashboard route — SCD live command center feed.

WebSocket /live: long-poll Redis stream, push events to connected clients.
GET /metrics: response/flag/enumerator counters.
GET /flags: recent flagged responses.

WebSocket uses 3s block on xread; if WS drops, frontend can poll /flags
on the same 3s cadence with zero server-side change — venue-wifi resilience.
"""
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.intelligence import TrustScore
from app.models.response import Response
from app.redis_client import get_metrics, read_since

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics")
async def metrics(user=Depends(require("dashboard:view"))):
    return await get_metrics()


@router.get("/flags")
async def flags(
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("dashboard:view")),
):
    rows = (
        await db.execute(
            select(Response)
            .where(Response.trust_level == "Red")
            .order_by(desc(Response.created_at))
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id":            str(r.id),
            "enumerator_id": str(r.enumerator_id) if r.enumerator_id else None,
            "confidence":    r.confidence_score,
            "trust_level":   r.trust_level,
            "status":        r.status,
        }
        for r in rows
    ]


@router.get("/trust-scores")
async def trust_scores(
    response_id: str,
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("dashboard:view")),
):
    rows = (
        await db.execute(
            select(TrustScore)
            .where(TrustScore.response_id == response_id)
            .order_by(desc(TrustScore.created_at))
        )
    ).scalars().all()
    return [
        {
            "id":             str(r.id),
            "confidence":     r.confidence,
            "risk_level":     r.risk_level,
            "breakdown":      r.breakdown,
            "fraud_signals":  r.fraud_signals,
            "recommendation": r.recommendation,
        }
        for r in rows
    ]


@router.websocket("/live")
async def live(ws: WebSocket):
    """
    Push live events to the SCD command center.
    No auth on the WebSocket itself — the dashboard page is auth-gated at the
    HTTP layer.  For production, pass token as query param and validate here.
    """
    await ws.accept()
    last_id = "$"
    try:
        while True:
            events = await read_since(last_id, block_ms=3000)
            for e in events:
                last_id = e["id"]
                await ws.send_json(e)
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001
        return
