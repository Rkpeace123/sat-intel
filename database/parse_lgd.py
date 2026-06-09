"""
LGD States PDF → PostgreSQL (kg_entities table as state lookup).

Parses the "List of States" PDF with LGD codes for all 36 states/UTs.
Stores in kg_entities (etype='state') — used by context_engine for
regional plausibility checks and survey assignment.

Also exports to lgd_parsed.csv for reference.

Run:
    cd database
    python parse_lgd.py
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

env_file = REPO_ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

LGD_PDF = Path(__file__).parent / "List of States.pdf"


def extract_text(path: Path) -> str:
    pdf = fitz.open(str(path))
    return "".join(page.get_text() for page in pdf)


def _clean(s: str) -> str:
    """Remove null bytes and extra whitespace from PDF-extracted strings."""
    return re.sub(r"\x00+", "", s).strip()


def parse_lgd(text: str) -> list[dict]:
    """
    PDF rows repeat:
      S.No  LGD_Code  State_Name_English  State_Name_Local  State/UT  Census2001  Census2011  [links...]

    We extract: lgd_code, name_en, name_local, state_or_ut, census_2001, census_2011
    """
    rows: list[dict] = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Remove header lines
    skip_tokens = {
        "S", "No", "State", "LGD", "Code", "State Name (In English)",
        "State Name (In Local", "language)", "State", "or UT",
        "Census", "2001 Code", "Census2011", "Code",
        "View", "Details", "History", "Government", "Order", "Map",
        "List of States",
    }

    i = 0
    while i < len(lines):
        # Look for a serial number
        if not re.match(r"^\d{1,2}$", lines[i]):
            i += 1
            continue

        sno = int(lines[i])
        i += 1

        # LGD code (1-2 digits)
        if i >= len(lines) or not re.match(r"^\d{1,2}$", lines[i]):
            continue
        lgd_code = lines[i].strip().zfill(2)
        i += 1

        # State name in English (1-2 lines, title case or ALL CAPS)
        name_en_parts = []
        while i < len(lines):
            l = lines[i]
            if re.match(r"^\d{1,2}$", l):   # next serial number or LGD code
                break
            if l in ("State", "UT", "ANDAMAN AND NICOBAR ISLANDS") or l.isupper():
                break
            if l in skip_tokens:
                i += 1
                continue
            name_en_parts.append(l)
            i += 1
            if len(name_en_parts) >= 3:
                break
        name_en = " ".join(name_en_parts).strip()

        # Local name (ALL CAPS or next line)
        name_local = ""
        if i < len(lines) and (lines[i].isupper() or lines[i] in skip_tokens):
            name_local = lines[i]
            i += 1

        # State or UT
        state_or_ut = "State"
        if i < len(lines) and lines[i] in ("State", "UT"):
            state_or_ut = lines[i]
            i += 1

        # Census 2001 code
        census_2001 = ""
        if i < len(lines) and re.match(r"^\d{2}$", lines[i]):
            census_2001 = lines[i]
            i += 1

        # Census 2011 code
        census_2011 = ""
        if i < len(lines) and re.match(r"^\d{2}$", lines[i]):
            census_2011 = lines[i]
            i += 1

        if lgd_code and name_en:
            rows.append({
                "lgd_code":    lgd_code,
                "name_en":     _clean(name_en),
                "name_local":  _clean(name_local),
                "state_or_ut": state_or_ut,
                "census_2001": census_2001,
                "census_2011": census_2011,
            })

    return rows


# ── PostgreSQL ────────────────────────────────────────────────────────────────

async def insert_to_postgres(rows: list[dict]) -> tuple[int, int]:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.models.knowledge import KGEntity

    db_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://satark:satark@localhost:5432/satark"
    )
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = skipped = 0
    async with Session() as db:
        for row in rows:
            # Use lgd_code as the unique identifier in attributes
            exists = (await db.execute(
                select(KGEntity).where(
                    KGEntity.etype == "state",
                    KGEntity.name  == row["name_en"],
                )
            )).scalar_one_or_none()

            if not exists:
                db.add(KGEntity(
                    id=uuid.uuid4(),
                    etype="state",
                    name=row["name_en"],
                    attributes={
                        "lgd_code":    row["lgd_code"],
                        "name_local":  row["name_local"],
                        "state_or_ut": row["state_or_ut"],
                        "census_2001": row["census_2001"],
                        "census_2011": row["census_2011"],
                    },
                ))
                inserted += 1
            else:
                skipped += 1

        await db.commit()
    await engine.dispose()
    return inserted, skipped


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    sep = "═" * 62
    print(sep); print("  SATARK LGD States Ingest"); print(sep)

    print(f"\n[1/3] Extracting {LGD_PDF.name} ...")
    text = extract_text(LGD_PDF)
    print(f"      {len(text):,} chars")

    print("\n[2/3] Parsing states ...")
    rows = parse_lgd(text)
    print(f"      {len(rows)} states/UTs parsed")

    # Save CSV
    csv_path = LGD_PDF.parent / "lgd_parsed.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("lgd_code,name_en,name_local,state_or_ut,census_2001,census_2011\n")
        for r in rows:
            name_l = r["name_local"].replace(",", " ")
            f.write(f'{r["lgd_code"]},{r["name_en"]},{name_l},{r["state_or_ut"]},{r["census_2001"]},{r["census_2011"]}\n')
    print(f"      Saved: {csv_path.name}")

    print("\n      States parsed:")
    print(f"      {'LGD':<6} {'Type':<8} {'Name'}")
    print("      " + "-" * 45)
    for r in rows:
        print(f"      {r['lgd_code']:<6} {r['state_or_ut']:<8} {r['name_en']}")

    print("\n[3/3] PostgreSQL (kg_entities) ...")
    try:
        ins, skip = await insert_to_postgres(rows)
        print(f"      ✓ {ins} inserted, {skip} already existed")
    except Exception as e:
        print(f"      ✗ Skipped: {e}")

    print(f"\n{sep}")
    print(f"  Done — {len(rows)} states/UTs in kg_entities (etype='state')")
    print(sep)


if __name__ == "__main__":
    asyncio.run(main())
