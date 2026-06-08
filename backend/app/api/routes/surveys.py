"""
Survey routes — CRUD, publish, version.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require
from app.models.auth import User
from app.models.survey import Survey

router = APIRouter(prefix="/surveys", tags=["surveys"])


class SurveyCreate(BaseModel):
    name:          str
    region_id:     str | None = None
    languages:     list[str] = ["en", "hi", "ta"]
    question_graph: dict     = {}


class SurveyOut(BaseModel):
    id:     str
    name:   str
    status: str
    version: int


@router.get("/", response_model=list[SurveyOut])
async def list_surveys(
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("survey:read")),
):
    rows = (await db.execute(select(Survey).order_by(Survey.created_at.desc()))).scalars().all()
    return [SurveyOut(id=str(r.id), name=r.name, status=r.status, version=r.version) for r in rows]


@router.post("/", response_model=SurveyOut, status_code=201)
async def create_survey(
    body: SurveyCreate,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(require("survey:write")),
):
    survey = Survey(
        id=uuid.uuid4(),
        name=body.name,
        region_id=body.region_id,
        languages=body.languages,
        question_graph=body.question_graph,
        created_by=user.id,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return SurveyOut(id=str(survey.id), name=survey.name, status=survey.status, version=survey.version)


@router.get("/{survey_id}")
async def get_survey(
    survey_id: str,
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("survey:read")),
):
    survey = await db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    return {
        "id":             str(survey.id),
        "name":           survey.name,
        "status":         survey.status,
        "version":        survey.version,
        "languages":      survey.languages,
        "question_graph": survey.question_graph,
    }


@router.post("/{survey_id}/publish")
async def publish_survey(
    survey_id: str,
    db:   AsyncSession = Depends(get_db),
    user  = Depends(require("survey:publish")),
):
    survey = await db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    if survey.status == "published":
        raise HTTPException(400, "already published")
    survey.status = "published"
    await db.commit()
    return {"id": str(survey.id), "status": "published"}
