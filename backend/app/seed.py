"""
Idempotent seed — run every boot via scripts/start.sh.

Seeds:
  - Permissions (all codes the RBAC matrix needs)
  - Roles with their permission sets
  - Demo users (admin, sdrd, fod, dpd, scd, enumerator)
  - Reference distributions (HCES/PLFS priors for the Bayesian engine)
  - Demo survey + validation rules

Run: python -m app.seed
"""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database import SessionLocal
from app.intelligence.assist.survey_gen import register_demo_draft
from app.models.auth import Permission, Role, User
from app.models.knowledge import ReferenceDistribution
from app.models.survey import Survey, ValidationRule

# ── Permissions ───────────────────────────────────────────────────────────────
PERMISSIONS = [
    "survey:read", "survey:write", "survey:publish",
    "collect:write", "response:read",
    "coding:review", "validation:review",
    "dashboard:view", "analytics:read",
    "enumerator:manage", "rag:ingest",
    "admin",
]

# ── Role → permission mapping ─────────────────────────────────────────────────
ROLES: dict[str, list[str]] = {
    "admin":       PERMISSIONS,
    "sdrd":        ["survey:read", "survey:write", "survey:publish",
                    "response:read", "analytics:read", "dashboard:view", "rag:ingest"],
    "fod":         ["dashboard:view", "collect:write", "enumerator:manage",
                    "response:read"],
    "dpd":         ["coding:review", "validation:review", "dashboard:view",
                    "response:read"],
    "scd":         ["dashboard:view", "analytics:read", "response:read"],
    "enumerator":  ["collect:write", "survey:read"],
    "leadership":  ["dashboard:view", "analytics:read"],
}

# ── Demo users ────────────────────────────────────────────────────────────────
USERS = [
    ("admin",       "admin123",   "admin"),
    ("sdrd",        "design123",  "sdrd"),
    ("fod",         "field123",   "fod"),
    ("dpd",         "process123", "dpd"),
    ("scd",         "coord123",   "scd"),
    ("enumerator1", "field123",   "enumerator"),
]

# ── Reference distributions (HCES/PLFS priors) ───────────────────────────────
REF_DISTRIBUTIONS = [
    # Income priors per occupation × urban/rural stratum
    {
        "key": "income", "stratum": "Salaried_urban_TN",
        "p05": 9000.0, "median": 28000.0, "p95": 95000.0,
        "params": {"dist": "lognormal", "mu": 10.24, "sigma": 0.55},
    },
    {
        "key": "income", "stratum": "Unemployed_urban_TN",
        "p05": 0.0, "median": 0.0, "p95": 8000.0,
        "params": {"dist": "lognormal", "mu": 6.5, "sigma": 0.9},
    },
    {
        "key": "income", "stratum": "Farmer_rural_TN",
        "p05": 4000.0, "median": 12000.0, "p95": 45000.0,
        "params": {"dist": "lognormal", "mu": 9.39, "sigma": 0.75},
    },
    {
        "key": "income", "stratum": "SelfEmployed_urban_TN",
        "p05": 6000.0, "median": 20000.0, "p95": 80000.0,
        "params": {"dist": "lognormal", "mu": 9.9, "sigma": 0.7},
    },
    # Age priors
    {
        "key": "age", "stratum": "all",
        "p05": 18.0, "median": 35.0, "p95": 65.0,
        "params": {"dist": "normal", "mu": 38.0, "sigma": 14.0},
    },
    # Household size priors
    {
        "key": "household", "stratum": "urban_TN",
        "p05": 2.0, "median": 4.0, "p95": 7.0,
        "params": {"dist": "normal", "mu": 4.0, "sigma": 1.5},
    },
]

# ── Demo survey ───────────────────────────────────────────────────────────────
DEMO_SURVEY_NAME = "Household Employment Survey — Tamil Nadu Demo"
DEMO_SURVEY_GRAPH = {
    "nodes": [
        {"id": "name",        "q": {"en": "Please confirm your name", "hi": "अपना नाम बताएं", "ta": "உங்கள் பெயர் உறுதிப்படுத்தவும்"}, "type": "text"},
        {"id": "age",         "q": {"en": "What is your age?", "hi": "आपकी आयु क्या है?", "ta": "உங்கள் வயது என்ன?"}, "type": "number"},
        {"id": "occupation",  "q": {"en": "What is your primary occupation?", "hi": "आपका मुख्य व्यवसाय क्या है?", "ta": "உங்கள் முதன்மை தொழில் என்ன?"}, "type": "choice",
         "options": ["Salaried", "Self-employed", "Farmer", "Unemployed", "Student", "Retired"], "code_type": "NCO"},
        {"id": "income",      "q": {"en": "Monthly household income (₹)?", "hi": "मासिक पारिवारिक आय (₹)?", "ta": "மாதாந்திர குடும்ப வருமானம் (₹)?"}, "type": "number"},
        {"id": "household",   "q": {"en": "Number of people in household?", "hi": "परिवार में कितने सदस्य हैं?", "ta": "குடும்பத்தில் உள்ளவர்களின் எண்ணிக்கை?"}, "type": "number"},
        {"id": "institution", "q": {"en": "Which institution are you studying at?", "hi": "आप किस संस्थान में पढ़ते हैं?", "ta": "எந்த நிறுவனத்தில் படிக்கிறீர்கள்?"}, "type": "text"},
        {"id": "unemp_dur",   "q": {"en": "How many months have you been unemployed?", "hi": "आप कितने महीनों से बेरोजगार हैं?", "ta": "எத்தனை மாதங்களாக வேலை இல்லை?"}, "type": "number"},
    ],
    "branches": {
        "Student":    "institution",
        "Unemployed": "unemp_dur",
    },
}
DEMO_ADAPTIVE_LOGIC = [
    {"action": "BRANCH", "trigger": {"field": "occupation", "value": "Student"},
     "target": {"branch": "Student", "qid": "institution"}},
    {"action": "BRANCH", "trigger": {"field": "occupation", "value": "Unemployed"},
     "target": {"branch": "Unemployed", "qid": "unemp_dur"}},
    {"action": "SKIP", "trigger": {"field": "occupation", "value": "Salaried"},
     "target": {"qid": "unemp_dur"}},
]
DEMO_VALIDATION_RULES = [
    {
        "field": "income", "rule_type": "cross_field", "severity": "error",
        "params": {
            "if_field": "occupation", "if_op": "eq", "if_value": "Unemployed",
            "then_field": "income", "then_op": "lte", "then_value": 50000,
        },
        "reason_template": "{income} contradicts occupation=Unemployed",
    },
    {
        "field": "age", "rule_type": "range", "severity": "error",
        "params": {"field": "age", "min": 0, "max": 120},
        "reason_template": "age must be between 0 and 120",
    },
    {
        "field": "name", "rule_type": "required", "severity": "error",
        "params": {"field": "name"},
        "reason_template": "name is required",
    },
    {
        "field": "income", "rule_type": "context", "severity": "warning",
        "params": {"field": "income", "ref_key": "income"},
        "reason_template": "income outside regional reference band",
    },
]


async def seed() -> None:
    async with SessionLocal() as db:
        await _seed_rbac(db)
        await _seed_reference_distributions(db)
        await _seed_demo_survey(db)
        await db.commit()
    _register_demo_cache()
    print("✓ seed complete")


async def _seed_rbac(db: AsyncSession) -> None:
    # Permissions
    perm_map: dict[str, Permission] = {}
    for code in PERMISSIONS:
        p = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one_or_none()
        if not p:
            p = Permission(id=uuid.uuid4(), code=code, description=code)
            db.add(p)
        perm_map[code] = p
    await db.flush()

    # Roles
    role_map: dict[str, Role] = {}
    for name, codes in ROLES.items():
        r = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
        if not r:
            r = Role(id=uuid.uuid4(), name=name)
            db.add(r)
        r.permissions = [perm_map[c] for c in codes if c in perm_map]
        role_map[name] = r
    await db.flush()

    # Users
    for username, password, role_name in USERS:
        exists = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if not exists:
            db.add(User(
                id=uuid.uuid4(),
                username=username,
                full_name=username.upper(),
                password_hash=hash_password(password),
                role_id=role_map[role_name].id,
                is_active=True,
            ))
    await db.flush()
    print(f"  ✓ RBAC seeded — {len(ROLES)} roles, {len(USERS)} users")


async def _seed_reference_distributions(db: AsyncSession) -> None:
    for rd in REF_DISTRIBUTIONS:
        exists = (
            await db.execute(
                select(ReferenceDistribution).where(
                    ReferenceDistribution.key == rd["key"],
                    ReferenceDistribution.stratum == rd["stratum"],
                )
            )
        ).scalar_one_or_none()
        if not exists:
            db.add(ReferenceDistribution(id=uuid.uuid4(), **rd))
    await db.flush()
    print(f"  ✓ reference distributions seeded — {len(REF_DISTRIBUTIONS)} rows")


async def _seed_demo_survey(db: AsyncSession) -> None:
    # Admin user
    admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
    if not admin:
        return  # RBAC seed must run first

    # Survey
    existing = (
        await db.execute(select(Survey).where(Survey.name == DEMO_SURVEY_NAME))
    ).scalar_one_or_none()

    if not existing:
        survey = Survey(
            id=uuid.uuid4(),
            name=DEMO_SURVEY_NAME,
            question_graph=DEMO_SURVEY_GRAPH,
            status="published",
            created_by=admin.id,
        )
        db.add(survey)
        await db.flush()

        for rule_dict in DEMO_VALIDATION_RULES:
            db.add(ValidationRule(
                id=uuid.uuid4(),
                survey_id=survey.id,
                field=rule_dict["field"],
                rule_type=rule_dict["rule_type"],
                params=rule_dict["params"],
                severity=rule_dict["severity"],
                reason_template=rule_dict["reason_template"],
            ))
        await db.flush()
        print(f"  ✓ demo survey seeded — id={survey.id}")
    else:
        print(f"  ✓ demo survey exists — id={existing.id}")


def _register_demo_cache() -> None:
    """Register the canned demo draft so survey generation is instant on stage."""
    register_demo_draft(
        "household employment survey for tamil nadu",
        {
            "title": {
                "en": "Household Employment Survey",
                "hi": "घरेलू रोज़गार सर्वेक्षण",
                "ta": "வீட்டு வேலைவாய்ப்பு கணக்கெடுப்பு",
            },
            "nodes": DEMO_SURVEY_GRAPH["nodes"],
            "branches": DEMO_SURVEY_GRAPH["branches"],
            "validation_rules": DEMO_VALIDATION_RULES,
            "sources": ["PLFS_methodology.txt", "HCES_methodology.txt"],
            "confidence": 94,
        },
    )


if __name__ == "__main__":
    asyncio.run(seed())
