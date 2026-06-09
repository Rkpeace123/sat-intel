"""
Districts of All States PDF → PostgreSQL (kg_entities, etype='district').

Extracts: district_lgd_code, district_name, state_code, state_name
Stores in kg_entities with a KGRelation linking district → state.

Run:
    cd database
    python parse_districts.py
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

PDF_PATH = Path(__file__).parent / "Districts of All States of India.pdf"

_SKIP = {
    "S", "No", "State", "Code", "State Name", "District",
    "LGD", "District Name (In", "English)", "District Name (In Local",
    "language)", "Hierarchy", "Short", "Name of", "District",
    "Census", "2001", "Code", "Census2011", "Pesa", "Status",
    "View", "Details", "History", "Government", "Order", "Map",
    "Districts of All States of India", "Not", "Covered",
    "Partially", "2001\nCode",
}
_PESA = {"Not Covered", "Partially Covered", "Covered"}


def _clean(s: str) -> str:
    return re.sub(r"[\x00\r]+", "", s).strip()


def extract_text(path: Path) -> str:
    pdf = fitz.open(str(path))
    return "".join(page.get_text() for page in pdf)


def parse_districts(text: str) -> list[dict]:
    rows: list[dict] = []
    lines = [_clean(l) for l in text.splitlines()]
    lines = [l for l in lines if l and l not in _SKIP]

    i = 0
    while i < len(lines):
        # Serial number
        if not re.match(r"^\d{1,4}$", lines[i]):
            i += 1
            continue
        i += 1  # skip serial

        # State code (2 digits)
        if i >= len(lines) or not re.match(r"^\d{2}$", lines[i]):
            continue
        state_code = lines[i].zfill(2)
        i += 1

        # State name (ends with "(State)" or "(UT)")
        state_name_parts = []
        while i < len(lines):
            l = lines[i]
            if re.match(r"^\d{2,4}$", l):  # district LGD code coming
                break
            state_name_parts.append(l)
            i += 1
            if l.endswith("(State)") or l.endswith("(UT)"):
                break
        state_name = _clean(" ".join(state_name_parts))
        state_name = re.sub(r"\s*\(State\)|\s*\(UT\)", "", state_name).strip()

        # District LGD code (3 digits)
        if i >= len(lines) or not re.match(r"^\d{3,4}$", lines[i]):
            continue
        dist_code = lines[i]
        i += 1

        # District name English (1-2 lines, before local name or next pattern)
        dist_name_parts = []
        while i < len(lines):
            l = lines[i]
            if re.match(r"^\d{1,4}$", l):  # next serial or code
                break
            if l.isupper() and len(l) > 3:  # local name (ALL CAPS)
                break
            if l.endswith("(State)") or l.endswith("(UT)"):
                break
            dist_name_parts.append(l)
            i += 1
            if len(dist_name_parts) >= 2:
                break
        dist_name = _clean(" ".join(dist_name_parts))
        # Fix doubled names: "Anakapalli Anakapalli" → "Anakapalli"
        words = dist_name.split()
        half = len(words) // 2
        if half > 0 and words[:half] == words[half:]:
            dist_name = " ".join(words[:half])

        if dist_code and dist_name and state_name:
            rows.append({
                "district_lgd": dist_code,
                "district_name": dist_name,
                "state_code":   state_code,
                "state_name":   state_name,
            })

    # Deduplicate by district LGD code
    seen: set[str] = set()
    unique = []
    for r in rows:
        if r["district_lgd"] not in seen:
            seen.add(r["district_lgd"])
            unique.append(r)
    return unique


# ── PostgreSQL ────────────────────────────────────────────────────────────────

async def insert_to_postgres(rows: list[dict]) -> tuple[int, int]:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.models.knowledge import KGEntity, KGRelation

    db_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://satark:satark@localhost:5432/satark"
    )
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = skipped = 0
    async with Session() as db:
        # Build state lookup: state_name → id
        state_rows = (await db.execute(
            select(KGEntity).where(KGEntity.etype == "state")
        )).scalars().all()
        state_map: dict[str, uuid.UUID] = {}
        for s in state_rows:
            # Match on partial name (states stored without "(State)" suffix)
            state_map[s.name.lower()] = s.id

        for row in rows:
            exists = (await db.execute(
                select(KGEntity).where(
                    KGEntity.etype == "district",
                    KGEntity.name  == row["district_name"],
                )
            )).scalar_one_or_none()

            if not exists:
                dist = KGEntity(
                    id=uuid.uuid4(),
                    etype="district",
                    name=row["district_name"],
                    attributes={
                        "lgd_code":   row["district_lgd"],
                        "state_code": row["state_code"],
                        "state_name": row["state_name"],
                    },
                )
                db.add(dist)
                await db.flush()  # get the id

                # Add relation: district belongs_to state
                state_id = state_map.get(row["state_name"].lower())
                if state_id:
                    db.add(KGRelation(
                        id=uuid.uuid4(),
                        src_id=dist.id,
                        dst_id=state_id,
                        relation="belongs_to",
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
    print(sep); print("  SATARK Districts Ingest"); print(sep)

    print(f"\n[1/3] Extracting {PDF_PATH.name} ...")
    text = extract_text(PDF_PATH)
    print(f"      {len(text):,} chars, {text.count(chr(10))} lines")

    print("\n[2/3] Parsing districts ...")
    rows = parse_districts(text)
    states = len(set(r["state_name"] for r in rows))
    print(f"      {len(rows)} districts across {states} states/UTs")

    # Save CSV
    csv_path = PDF_PATH.parent / "districts_parsed.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("district_lgd,district_name,state_code,state_name\n")
        for r in rows:
            dn = r["district_name"].replace(",", ";")
            sn = r["state_name"].replace(",", ";")
            f.write(f'{r["district_lgd"]},{dn},{r["state_code"]},{sn}\n')
    print(f"      Saved: {csv_path.name}")

    # Sample
    print("\n      Sample (first 15):")
    print(f"      {'LGD':<6} {'District':<35} State")
    print("      " + "-" * 65)
    for r in rows[:15]:
        print(f"      {r['district_lgd']:<6} {r['district_name']:<35} {r['state_name']}")

    print("\n[3/3] PostgreSQL (kg_entities + kg_relations) ...")
    try:
        ins, skip = await insert_to_postgres(rows)
        print(f"      ✓ {ins} districts inserted, {skip} already existed")
        print(f"      ✓ district → state relations created")
    except Exception as e:
        print(f"      ✗ Error: {e}")

    print(f"\n{sep}")
    print(f"  Done — {len(rows)} districts in kg_entities (etype='district')")
    print(sep)


if __name__ == "__main__":
    asyncio.run(main())
