"""
NCO PDF → PostgreSQL + ChromaDB RAG pipeline.

Parses the SATARK NCO PDF and inserts into:
  - classification_codes table (PostgreSQL, Phase 2 schema)
  - ChromaDB 'coding' collection (RAG coding engine)

Run:
    cd database
    python parse_nco.py
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import uuid
from pathlib import Path

import fitz

# ── Path setup ────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

# Load .env
env_file = REPO_ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

PDF_PATH = Path(__file__).parent / "dc256e06-7977-4b01-9cef-832b9b9b8f14.pdf"

# Known two-line sectors in this PDF
_SECTOR_MAP = {
    "capital goods &": "Capital Goods & Manufacturing",
    "capital goods &\nmanufacturing": "Capital Goods & Manufacturing",
}
_SINGLE_SECTORS = {
    "agriculture", "construction", "education", "finance", "healthcare",
    "hospitality", "it", "legal", "manufacturing", "media", "mining",
    "public administration", "retail", "services", "sports", "telecom",
    "transport", "utilities", "electronics", "food processing",
    "gems", "logistics", "textile", "tourism", "infrastructure",
    "capital goods & manufacturing",
}


def _is_sector_line(s: str) -> bool:
    return s.strip().lower() in _SINGLE_SECTORS or s.strip().lower().startswith("capital goods")


def _is_code(s: str) -> bool:
    return bool(re.match(r"^\d{4}\.\d{4,}", s.strip()))


def _is_sno(s: str) -> bool:
    return bool(re.match(r"^\d{1,4}\s*$", s.strip()))


def _clean_label(s: str) -> str:
    """Remove leading sector/family noise that leaked into job role."""
    # Strip "Capital Goods & Manufacturing" prefix if it leaked
    s = re.sub(r"^(Capital Goods & Manufacturing\s*)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^(Manufacturing\s+)", "", s, flags=re.IGNORECASE)
    return s.strip()


def extract_text(pdf_path: Path) -> str:
    pdf = fitz.open(str(pdf_path))
    pages = []
    for page in pdf:
        pages.append(page.get_text())
    return "\n".join(pages)


def parse_nco_rows(text: str) -> list[dict]:
    """
    The PDF columns in order: S.No | Code | Family Name | Sector | Job Role
    Each column may wrap to the next line in the raw text stream.

    Algorithm:
      - Split into clean lines
      - Find each code line
      - Read backwards (lines before code are S.No)
      - Read forwards: family (until sector), sector, job role (until next S.No or code)
    """
    lines = [l.strip() for l in text.splitlines()]
    # Remove empty lines and header
    lines = [l for l in lines if l and l not in
             ("S.No", "Occupation Code", "Sector Name", "Family Name", "Job Role/Occupation")]

    rows: list[dict] = []

    i = 0
    while i < len(lines):
        if not _is_code(lines[i]):
            i += 1
            continue

        code = lines[i].strip()
        i += 1

        # ── Family name: one or two non-sector, non-code, non-sno lines ──
        family_parts: list[str] = []
        while i < len(lines):
            l = lines[i]
            if _is_code(l) or _is_sno(l) or _is_sector_line(l):
                break
            family_parts.append(l)
            i += 1
            # Family names are at most 2 continuation lines
            if len(family_parts) >= 3:
                break
        family = " ".join(family_parts).strip()

        # ── Sector: one or two lines ──
        sector_parts: list[str] = []
        if i < len(lines) and _is_sector_line(lines[i]):
            sector_parts.append(lines[i])
            i += 1
            # "Capital Goods &" is always followed by "Manufacturing"
            if (sector_parts and sector_parts[0].lower().startswith("capital goods &")
                    and i < len(lines) and lines[i].lower() == "manufacturing"):
                sector_parts.append(lines[i])
                i += 1
        sector = " ".join(sector_parts).strip() or "Unclassified"
        if sector.lower() == "capital goods & manufacturing":
            sector = "Capital Goods & Manufacturing"

        # ── Job role: one or two lines until next S.No / code ──
        job_parts: list[str] = []
        while i < len(lines):
            l = lines[i]
            if _is_code(l) or _is_sno(l):
                break
            # Don't absorb a stray sector line into the job role
            if _is_sector_line(l) and not job_parts:
                break
            job_parts.append(l)
            i += 1
            if len(job_parts) >= 3:
                break
        job_role = _clean_label(" ".join(job_parts).strip())

        if code and job_role:
            rows.append({
                "code":      code,
                "code_type": "NCO",
                "label":     job_role,
                "family":    family,
                "sector":    sector,
                "synonyms":  _make_synonyms(job_role, family),
            })

    return rows


def _make_synonyms(label: str, family: str) -> list[str]:
    syns: set[str] = set()
    # Slash / dash alternatives in label
    for part in re.split(r"[/\-–]", label):
        p = part.strip()
        if len(p) > 3:
            syns.add(p.lower())
    # Key words from family
    stop = {"and", "the", "for", "of", "in", "other", "related", "workers",
            "operators", "makers", "fitters", "growers", "not", "elsewhere",
            "classified", "persons"}
    for word in re.split(r"[\s,]+", family):
        w = word.lower()
        if len(w) > 4 and w not in stop:
            syns.add(w)
    syns.discard(label.lower())
    return sorted(syns)[:8]


# ── PostgreSQL ────────────────────────────────────────────────────────────────

async def insert_to_postgres(rows: list[dict]) -> int:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.models.knowledge import ClassificationCode

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://satark:satark@localhost:5432/satark",
    )
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = 0
    async with Session() as db:
        for row in rows:
            existing = (await db.execute(
                select(ClassificationCode).where(
                    ClassificationCode.code == row["code"],
                    ClassificationCode.code_type == "NCO",
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(ClassificationCode(
                    id=uuid.uuid4(),
                    code=row["code"],
                    code_type="NCO",
                    label=row["label"],
                    synonyms=row["synonyms"],
                    external_source=None,
                ))
                inserted += 1
        await db.commit()
    await engine.dispose()
    return inserted


# ── ChromaDB ──────────────────────────────────────────────────────────────────

def insert_to_chroma(rows: list[dict]) -> int:
    os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
    # Always write to backend/data/chroma — the path the app reads from
    correct_chroma = str(REPO_ROOT / "backend" / "data" / "chroma")
    os.environ["CHROMA_DIR"] = correct_chroma

    from app.intelligence.assist.rag.chunking import chunk_records
    from app.intelligence.assist.rag.config import Bucket
    from app.intelligence.assist.rag.embeddings import embed
    from app.intelligence.assist.rag.retrieval import invalidate
    from app.intelligence.assist.rag.store import upsert

    records = [{"code": r["code"], "code_type": "NCO", "label": r["label"],
                "synonyms": r["synonyms"], "external_source": None} for r in rows]
    chunks = chunk_records(records, Bucket.CODING.value)
    if not chunks:
        return 0

    texts = [c["text"] for c in chunks]
    embs = embed(texts)
    upsert(Bucket.CODING,
           ids=[c["id"] for c in chunks],
           embeddings=embs,
           documents=texts,
           metadatas=[c["metadata"] for c in chunks])
    invalidate(Bucket.CODING)
    return len(chunks)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    sep = "═" * 62
    print(sep)
    print("  SATARK NCO Ingest Pipeline")
    print(sep)

    print(f"\n[1/4] Extracting PDF ...")
    text = extract_text(PDF_PATH)
    print(f"      {len(text):,} chars  |  {PDF_PATH.name}")
    (PDF_PATH.parent / "nco_extracted.txt").write_text(text, encoding="utf-8")

    print("\n[2/4] Parsing rows ...")
    rows = parse_nco_rows(text)
    print(f"      {len(rows)} NCO entries parsed")

    # Save CSV
    csv_path = PDF_PATH.parent / "nco_parsed.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("code,code_type,label,family,sector,synonyms\n")
        for r in rows:
            label  = r["label"].replace(",", ";")
            family = r["family"].replace(",", ";")
            sector = r["sector"].replace(",", ";")
            syns   = "|".join(r["synonyms"])
            f.write(f'{r["code"]},NCO,{label},{family},{sector},{syns}\n')
    print(f"      Saved: {csv_path.name}")

    print("\n      Sample (first 15):")
    print(f"      {'Code':<16} {'Label':<45} Sector")
    print("      " + "-" * 75)
    for r in rows[:15]:
        print(f"      {r['code']:<16} {r['label']:<45} {r['sector']}")

    print("\n[3/4] PostgreSQL ...")
    try:
        n = await insert_to_postgres(rows)
        print(f"      ✓ {n} inserted  ({len(rows)-n} already existed)")
    except Exception as e:
        print(f"      ✗ Skipped (postgres not running): {e}")
        print("        → docker compose up postgres -d")

    print("\n[4/4] ChromaDB (coding collection) ...")
    try:
        n = insert_to_chroma(rows)
        print(f"      ✓ {n} chunks embedded")
    except Exception as e:
        print(f"      ✗ ChromaDB error: {e}")

    print(f"\n{sep}")
    print(f"  Done — {len(rows)} NCO codes ready in ChromaDB")
    print(f"  CSV:  database/nco_parsed.csv")
    print(f"  Text: database/nco_extracted.txt")
    print(sep)


if __name__ == "__main__":
    asyncio.run(main())
