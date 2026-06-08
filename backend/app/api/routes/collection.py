"""
Collection routes — response submission and next-question logic.
"""
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.auth import User
from app.models.response import Paradata, Response

router = APIRouter(prefix="/collection", tags=["collection"])


class SubmitIn(BaseModel):
    survey_id:    str
    household_id: str | None = None
    channel:      str = "web"
    answers:      dict = {}
    paradata:     dict = {}


class NextQIn(BaseModel):
    survey_id:       str
    answers_so_far:  dict = {}
    paradata:        dict = {}


@router.post("/submit", status_code=201)
async def submit(
    body: SubmitIn,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(require("collect:write")),
):
    """
    Save a response and run the verdict pipeline via /intelligence/answer.
    Caller should follow up with POST /intelligence/answer to get trust scores.
    """
    response = Response(
        id=uuid.uuid4(),
        survey_id=body.survey_id,
        enumerator_id=user.id,
        household_id=body.household_id,
        channel=body.channel,
        answers=body.answers,
        status="captured",
    )
    db.add(response)

    # Persist paradata if timing data present
    if body.paradata:
        pd = body.paradata
        p = Paradata(
            id=uuid.uuid4(),
            response_id=response.id,
            started_at=datetime.now(UTC),
            ended_at=datetime.now(UTC),
            total_seconds=pd.get("total_seconds"),
            question_timings=pd.get("question_timings", {}),
            pauses=pd.get("pauses", 0),
            correction_count=pd.get("correction_count", 0),
            back_nav_count=pd.get("back_nav_count", 0),
            gps_lat=pd.get("gps_lat"),
            gps_lng=pd.get("gps_lng"),
            device=pd.get("device"),
            mode=pd.get("mode"),
            network=pd.get("network"),
        )
        db.add(p)

    await db.commit()
    return {"response_id": str(response.id), "status": "captured"}


@router.get("/{response_id}")
async def get_response(
    response_id: str,
    db: AsyncSession = Depends(get_db),
    user = Depends(require("response:read")),
):
    response = await db.get(Response, response_id)
    if not response:
        raise HTTPException(404, "response not found")
    return {
        "id":         str(response.id),
        "survey_id":  str(response.survey_id),
        "channel":    response.channel,
        "answers":    response.answers,
        "status":     response.status,
        "trust_level": response.trust_level,
        "confidence":  response.confidence_score,
    }
