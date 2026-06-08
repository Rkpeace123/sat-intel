"""
Coding + RAG + Survey-gen assist routes.
All return is_verdict:False — assist lane only.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import require
from app.intelligence.assist.rag import service as assist
from app.intelligence.assist.rag.config import Bucket
from app.intelligence.assist.survey_gen import survey_generator

router = APIRouter(tags=["assist"])


# ── Coding ────────────────────────────────────────────────────────────────────

@router.get("/coding")
def coding(
    text: str,
    user = Depends(require("coding:review")),
):
    """Retrieval-first NIC/NCO coding. is_verdict:False — suggestions only."""
    return assist.classify_code(text)


# ── RAG query ─────────────────────────────────────────────────────────────────

class RagQuery(BaseModel):
    bucket:   Bucket
    question: str


@router.post("/rag/query")
async def rag_query(
    q:    RagQuery,
    user  = Depends(require("survey:read")),
):
    """Grounded Q&A from the knowledge base. is_verdict:False."""
    return await assist.answer(q.bucket, q.question)


@router.post("/rag/ingest")
async def rag_ingest(
    bucket: Bucket,
    user   = Depends(require("rag:ingest")),
):
    """Ingest documents from data/kb/<bucket>/. Admins only."""
    from app.intelligence.assist.rag.ingest import ingest_folder
    count = ingest_folder(bucket)
    return {"bucket": bucket, "chunks_ingested": count}


# ── Survey generation ─────────────────────────────────────────────────────────

class GenIn(BaseModel):
    objective: str
    domain:    str | None = None


@router.post("/surveys/generate")
async def generate_survey(
    body: GenIn,
    user  = Depends(require("survey:write")),
):
    """
    RAG + Gemma survey draft. needs_review:True always — SDRD publishes.
    is_verdict:False.
    """
    draft = await survey_generator.generate(body.objective, body.domain)
    return draft.as_dict()
