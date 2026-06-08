"""
RBAC seed — run once after `alembic upgrade head`.

Creates all permissions and roles, and wires the capability matrix.
Also creates a default `admin` user (password must be changed immediately).

Usage:
    cd backend
    python -m data.seed.rbac_seed
    # or from alembic post-migration hook
"""
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.models.auth import Permission, Role, User, role_permissions

# ── Permission catalogue ───────────────────────────────────────────────────────
PERMISSIONS: list[dict] = [
    {"code": "survey:read",         "description": "View surveys and questions"},
    {"code": "survey:write",        "description": "Create / edit surveys"},
    {"code": "survey:publish",      "description": "Publish a survey"},
    {"code": "response:submit",     "description": "Submit a response"},
    {"code": "response:read",       "description": "Read responses"},
    {"code": "intelligence:read",   "description": "View trust scores and validation results"},
    {"code": "coding:review",       "description": "Approve or override coding results (DPD)"},
    {"code": "validation:review",   "description": "Review flagged validation results"},
    {"code": "enumerator:manage",   "description": "Create / edit enumerator records"},
    {"code": "dashboard:view",      "description": "Access the dashboard"},
    {"code": "analytics:read",      "description": "Run analytics queries"},
    {"code": "rag:ingest",          "description": "Ingest documents into the RAG corpus"},
    {"code": "admin",               "description": "Full administrative access"},
]

# ── Role → permission mapping ─────────────────────────────────────────────────
# Roles aligned with MoSPI field structure
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": [p["code"] for p in PERMISSIONS],
    "sdrd": [  # Survey Design & Research Division
        "survey:read", "survey:write", "survey:publish",
        "response:read", "intelligence:read", "analytics:read", "dashboard:view",
        "rag:ingest",
    ],
    "fod": [  # Field Operations Division
        "survey:read", "response:read", "enumerator:manage",
        "intelligence:read", "dashboard:view",
    ],
    "dpd": [  # Data Processing Division — primary coder
        "survey:read", "response:read", "coding:review",
        "validation:review", "intelligence:read", "dashboard:view",
    ],
    "scd": [  # Subject Classification Division
        "survey:read", "response:read", "analytics:read", "dashboard:view",
    ],
    "enumerator": [
        "survey:read", "response:submit",
    ],
    "citizen": [
        "survey:read", "response:submit",
    ],
    "leadership": [
        "survey:read", "response:read", "intelligence:read",
        "analytics:read", "dashboard:view",
    ],
}


async def seed(db: AsyncSession) -> None:
    # ── Permissions ───────────────────────────────────────────────────────────
    perm_map: dict[str, Permission] = {}
    for pdata in PERMISSIONS:
        existing = await db.scalar(
            select(Permission).where(Permission.code == pdata["code"])
        )
        if existing:
            perm_map[pdata["code"]] = existing
        else:
            p = Permission(id=uuid.uuid4(), **pdata)
            db.add(p)
            perm_map[pdata["code"]] = p

    await db.flush()

    # ── Roles ─────────────────────────────────────────────────────────────────
    role_map: dict[str, Role] = {}
    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        existing = await db.scalar(select(Role).where(Role.name == role_name))
        if existing:
            role_map[role_name] = existing
        else:
            r = Role(id=uuid.uuid4(), name=role_name)
            r.permissions = [perm_map[c] for c in perm_codes]
            db.add(r)
            role_map[role_name] = r

    await db.flush()

    # ── Default admin user ────────────────────────────────────────────────────
    admin_exists = await db.scalar(select(User).where(User.username == "admin"))
    if not admin_exists:
        admin = User(
            id=uuid.uuid4(),
            username="admin",
            full_name="System Administrator",
            password_hash=hash_password("changeme123!"),  # MUST change on first login
            role_id=role_map["admin"].id,
            is_active=True,
        )
        db.add(admin)
        print("Created default admin user (username: admin) — change the password immediately.")

    await db.commit()
    print("RBAC seed complete.")
    for role_name, role in role_map.items():
        pcount = len(ROLE_PERMISSIONS[role_name])
        print(f"  {role_name:<14} → {pcount} permissions")


async def main() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
