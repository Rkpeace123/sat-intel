"""
JWT creation/verification + bcrypt password hashing.
Phase 14 API routes will call these helpers.
"""
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext

from app.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict = {"sub": subject, "exp": expire, **(extra or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


# alias for backward compat
create_access_token = create_token


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid / expired token."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])


# alias for backward compat
decode_access_token = decode_token
