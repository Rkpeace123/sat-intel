"""
Enumerator management routes.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.field import Enumerator

router = APIRouter(prefix="/enumerators", tags=["enumerators"])


class EnumCreate(BaseModel):
    name:   str
    region: str


@router.get("/")
async def list_enumerators(
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("enumerator:manage")),
):
    rows = (await db.execute(select(Enumerator))).scalars().all()
    return [
        {
            "id":          str(r.id),
            "name":        r.name,
            "region":      r.region,
            "trust_score": r.trust_score,
            "trust_level": r.trust_level,
            "status":      r.status,
        }
        for r in rows
    ]


@router.post("/", status_code=201)
async def create_enumerator(
    body: EnumCreate,
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("enumerator:manage")),
):
    enumerator = Enumerator(id=uuid.uuid4(), name=body.name, region=body.region)
    db.add(enumerator)
    await db.commit()
    await db.refresh(enumerator)
    return {"id": str(enumerator.id), "name": enumerator.name, "trust_score": enumerator.trust_score}


@router.get("/{enumerator_id}/trust")
async def enumerator_trust(
    enumerator_id: str,
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("dashboard:view")),
):
    enumerator = await db.get(Enumerator, enumerator_id)
    if not enumerator:
        raise HTTPException(404, "enumerator not found")
    return {
        "id":          str(enumerator.id),
        "trust_score": enumerator.trust_score,
        "trust_level": enumerator.trust_level,
        "trust_trend": enumerator.trust_trend,
    }
