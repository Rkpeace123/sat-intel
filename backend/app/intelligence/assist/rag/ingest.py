"""
RAG corpus ingest.

ingest_codes(db)    — loads classification_codes from DB → Chroma coding bucket
ingest_folder(...)  — loads PDF/TXT/MD files from data/kb/<bucket>/ → Chroma
ingest_all(db)      — convenience wrapper; called from /rag/ingest route or seed

PUBLIC DOCS ONLY — data/kb/ must never contain citizen data.
"""
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.intelligence.assist.rag import retrieval, store
from app.intelligence.assist.rag.chunking import chunk_document, chunk_records
from app.intelligence.assist.rag.config import DOC_BUCKETS, Bucket
from app.intelligence.assist.rag.embeddings import embed
from app.models.knowledge import ClassificationCode


def _read_file(p: Path) -> str:
    if p.suffix.lower() == ".pdf":
        return "\n\n".join(
            (pg.extract_text() or "") for pg in PdfReader(str(p)).pages
        )
    return p.read_text(encoding="utf-8", errors="ignore")


async def ingest_codes(db: AsyncSession) -> int:
    """
    Embed all rows from classification_codes into the CODING bucket.
    Replaces any previous vectors for the same code IDs (upsert semantics).
    """
    rows = (await db.execute(select(ClassificationCode))).scalars().all()
    records = [
        {
            "code": r.code,
            "code_type": r.code_type,
            "label": r.label,
            "synonyms": r.synonyms or [],
            "external_source": r.external_source or "local",
        }
        for r in rows
    ]
    chunks = chunk_records(records, Bucket.CODING.value)
    if not chunks:
        return 0

    store.upsert(
        Bucket.CODING,
        ids=[c["id"] for c in chunks],
        embeddings=embed([c["text"] for c in chunks]),
        documents=[c["text"] for c in chunks],
        metadatas=[c["metadata"] for c in chunks],
    )
    retrieval.invalidate(Bucket.CODING)
    return len(chunks)


def ingest_folder(bucket: Bucket, kb_dir: str = "data/kb") -> int:
    """
    Walk data/kb/<bucket>/ and embed all PDF/TXT/MD files.
    Returns the number of chunks ingested.
    """
    folder = Path(kb_dir) / bucket.value
    if not folder.exists():
        return 0

    chunks: list[dict] = []
    for f in folder.glob("**/*"):
        if f.is_file() and f.suffix.lower() in (".pdf", ".txt", ".md"):
            text = _read_file(f)
            if text.strip():
                chunks += chunk_document(text, f.name, bucket.value)

    if not chunks:
        return 0

    store.upsert(
        bucket,
        ids=[c["id"] for c in chunks],
        embeddings=embed([c["text"] for c in chunks]),
        documents=[c["text"] for c in chunks],
        metadatas=[c["metadata"] for c in chunks],
    )
    retrieval.invalidate(bucket)
    return len(chunks)


async def ingest_all(db: AsyncSession) -> dict[str, int]:
    """
    Full corpus ingest: coding codes + all doc buckets.
    Returns counts per bucket.
    """
    out: dict[str, int] = {"coding": await ingest_codes(db)}
    for b in DOC_BUCKETS:
        out[b.value] = ingest_folder(b)
    return out
