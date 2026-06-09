"""
NIC 2008 PDF → PostgreSQL (classification_codes) + ChromaDB (coding collection).

NIC format:
  Section A   Agriculture, forestry and fishing
  Division 01  Crop and animal production...
  Group  011   Growing of non-perennial crops
  Group  012   Growing of perennial crops

We extract Sections, Divisions, and Groups — each gets a row.
Groups are the most specific (3-digit codes) and most useful for coding.

Run:
    cd database
    python parse_nic.py
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import uuid
from pathlib import Path

import fitz

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

# Use only one of the two identical NIC PDFs
NIC_PDF = Path(__file__).parent / "90ef44e4-c77a-45b5-aff2-d5be5e7057b8.pdf"

SECTION_LABELS: dict[str, str] = {
    "A": "Agriculture, forestry and fishing",
    "B": "Mining and quarrying",
    "C": "Manufacturing",
    "D": "Electricity, gas, steam and air conditioning supply",
    "E": "Water supply; sewerage, waste management and remediation",
    "F": "Construction",
    "G": "Wholesale and retail trade; repair of motor vehicles",
    "H": "Transportation and storage",
    "I": "Accommodation and food service activities",
    "J": "Information and communication",
    "K": "Financial and insurance activities",
    "L": "Real estate activities",
    "M": "Professional, scientific and technical activities",
    "N": "Administrative and support service activities",
    "O": "Public administration and defence; compulsory social security",
    "P": "Education",
    "Q": "Human health and social work activities",
    "R": "Arts, entertainment and recreation",
    "S": "Other service activities",
    "T": "Activities of households as employers",
    "U": "Activities of extraterritorial organisations and bodies",
}


def extract_text(path: Path) -> str:
    pdf = fitz.open(str(path))
    return "".join(page.get_text() for page in pdf)


def parse_nic(text: str) -> list[dict]:
    rows: list[dict] = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    current_section = ""
    current_section_label = ""
    current_division = ""
    current_division_label = ""

    i = 0
    while i < len(lines):
        line = lines[i]

        # Section: "Section A" or "Section B" etc.
        m = re.match(r"^Section\s+([A-Z])$", line, re.IGNORECASE)
        if m:
            current_section = m.group(1).upper()
            # Next non-empty line is the section label
            if i + 1 < len(lines):
                current_section_label = lines[i + 1]
            else:
                current_section_label = SECTION_LABELS.get(current_section, "")
            rows.append({
                "code":     current_section,
                "level":    "section",
                "label":    current_section_label,
                "section":  current_section,
                "division": "",
                "synonyms": [],
            })
            i += 1
            continue

        # Division: "Division 01  Crop and animal production..."
        m = re.match(r"^Division\s+(\d{2})\s+(.*)", line)
        if m:
            current_division = m.group(1)
            current_division_label = m.group(2).strip()
            # Label may continue on the next line
            while i + 1 < len(lines) and not re.match(
                    r"^(Division|Group|Section)\s", lines[i + 1]):
                next_l = lines[i + 1]
                if re.match(r"^\d+$", next_l):  # page number
                    break
                current_division_label += " " + next_l
                i += 1
            current_division_label = current_division_label.strip()
            rows.append({
                "code":     current_division,
                "level":    "division",
                "label":    current_division_label,
                "section":  current_section,
                "division": current_division,
                "synonyms": _synonyms(current_division_label),
            })
            i += 1
            continue

        # Group: "Group  011  Growing of non-perennial crops"
        # or    "Group  011\nGrowing of non-perennial crops"
        m = re.match(r"^Group\s+(\d{3})\s*(.*)", line)
        if m:
            code = m.group(1)
            label = m.group(2).strip()
            # If label is on next line
            if not label and i + 1 < len(lines):
                label = lines[i + 1]
                i += 1
            # Label may continue
            while i + 1 < len(lines) and not re.match(
                    r"^(Division|Group|Section)\s", lines[i + 1]):
                next_l = lines[i + 1]
                if re.match(r"^\d+$", next_l):
                    break
                if len(next_l) < 3:
                    break
                label += " " + next_l
                i += 1
            label = label.strip()
            if label:
                rows.append({
                    "code":     code,
                    "level":    "group",
                    "label":    label,
                    "section":  current_section,
                    "division": current_division,
                    "synonyms": _synonyms(label, current_division_label),
                })
            i += 1
            continue

        i += 1

    return rows


def _synonyms(label: str, context: str = "") -> list[str]:
    stop = {"and", "the", "for", "of", "in", "other", "related", "service",
            "activities", "not", "elsewhere", "classified", "n.e.c.", "with"}
    syns: set[str] = set()
    for word in re.split(r"[\s,;/\-]+", (label + " " + context).lower()):
        w = word.strip("().")
        if len(w) > 4 and w not in stop:
            syns.add(w)
    return sorted(syns)[:8]


# ── PostgreSQL ────────────────────────────────────────────────────────────────

async def insert_to_postgres(rows: list[dict]) -> tuple[int, int]:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.models.knowledge import ClassificationCode

    db_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://satark:satark@localhost:5432/satark"
    )
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = skipped = 0
    async with Session() as db:
        for row in rows:
            exists = (await db.execute(
                select(ClassificationCode).where(
                    ClassificationCode.code      == row["code"],
                    ClassificationCode.code_type == "NIC",
                )
            )).scalar_one_or_none()
            if not exists:
                db.add(ClassificationCode(
                    id=uuid.uuid4(),
                    code=row["code"],
                    code_type="NIC",
                    label=row["label"],
                    synonyms=row["synonyms"],
                    external_source=None,
                ))
                inserted += 1
            else:
                skipped += 1
        await db.commit()
    await engine.dispose()
    return inserted, skipped


# ── ChromaDB ──────────────────────────────────────────────────────────────────

def insert_to_chroma(rows: list[dict]) -> int:
    os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
    chroma_dir = str(REPO_ROOT / "backend" / "data" / "chroma")
    os.environ["CHROMA_DIR"] = chroma_dir

    from app.intelligence.assist.rag.config import Bucket
    from app.intelligence.assist.rag.embeddings import embed
    from app.intelligence.assist.rag.retrieval import invalidate
    from app.intelligence.assist.rag.store import upsert

    # Format as RAG chunks — include level + context for better retrieval
    chunks = []
    for r in rows:
        text = f"NIC {r['code']} ({r['level']}) — {r['label']}."
        if r["division"] and r["level"] == "group":
            text += f" Industry: {r['division']}."
        meta = {
            "code":      r["code"],
            "code_type": "NIC",
            "label":     r["label"],
            "level":     r["level"],
            "section":   r["section"],
            "division":  r["division"],
        }
        # Only scalar values in ChromaDB metadata
        chunks.append({
            "id":       f"NIC:{r['code']}",
            "text":     text,
            "metadata": meta,
        })

    if not chunks:
        return 0

    texts = [c["text"] for c in chunks]
    embs  = embed(texts)
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
    print(sep); print("  SATARK NIC 2008 Ingest"); print(sep)

    print(f"\n[1/4] Extracting {NIC_PDF.name} ...")
    text = extract_text(NIC_PDF)
    print(f"      {len(text):,} chars extracted")

    print("\n[2/4] Parsing NIC hierarchy ...")
    rows = parse_nic(text)
    sections  = sum(1 for r in rows if r["level"] == "section")
    divisions = sum(1 for r in rows if r["level"] == "division")
    groups    = sum(1 for r in rows if r["level"] == "group")
    print(f"      {len(rows)} entries: {sections} sections, {divisions} divisions, {groups} groups")

    # Save CSV
    csv_path = NIC_PDF.parent / "nic_parsed.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("code,code_type,level,label,section,division,synonyms\n")
        for r in rows:
            label = r["label"].replace(",", ";")
            syns  = "|".join(r["synonyms"])
            f.write(f'{r["code"]},NIC,{r["level"]},{label},{r["section"]},{r["division"]},{syns}\n')
    print(f"      Saved: {csv_path.name}")

    print("\n      Sample groups (first 10):")
    print(f"      {'Code':<8} {'Label':<50}")
    print("      " + "-" * 60)
    for r in [x for x in rows if x["level"] == "group"][:10]:
        print(f"      {r['code']:<8} {r['label'][:50]}")

    print("\n[3/4] PostgreSQL ...")
    try:
        ins, skip = await insert_to_postgres(rows)
        print(f"      ✓ {ins} inserted, {skip} already existed")
    except Exception as e:
        print(f"      ✗ Skipped: {e}")

    print("\n[4/4] ChromaDB ...")
    try:
        n = insert_to_chroma(rows)
        print(f"      ✓ {n} chunks embedded")
    except Exception as e:
        print(f"      ✗ Error: {e}")

    print(f"\n{sep}")
    print(f"  Done — {len(rows)} NIC codes ready")
    print(sep)


if __name__ == "__main__":
    asyncio.run(main())
