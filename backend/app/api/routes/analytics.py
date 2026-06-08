"""
Analytics routes — cross-tab, trust distribution, trends.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.intelligence import TrustScore
from app.models.response import Response

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/trust-distribution")
async def trust_distribution(
    survey_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require("analytics:read")),
):
    """Count of Green / Amber / Red responses, optionally filtered by survey."""
    q = select(Response.trust_level, func.count().label("count")).group_by(Response.trust_level)
    if survey_id:
        q = q.where(Response.survey_id == survey_id)
    rows = (await db.execute(q)).all()
    return {row.trust_level or "unscored": row.count for row in rows}


@router.get("/response-volume")
async def response_volume(
    db: AsyncSession = Depends(get_db),
    user = Depends(require("analytics:read")),
):
    """Total response count."""
    count = (await db.execute(select(func.count()).select_from(Response))).scalar()
    return {"total_responses": count}
