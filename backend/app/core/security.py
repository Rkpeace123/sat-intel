"""
JWT creation/verification + bcrypt password hashing.
Uses bcrypt directly to avoid passlib version-detection bugs.
"""
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import settings


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict = {"sub": subject, "exp": expire, **(extra or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


# alias
create_access_token = create_token


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid / expired token."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])


# alias
decode_access_token = decode_token
