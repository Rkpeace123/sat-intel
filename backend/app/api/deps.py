"""
FastAPI shared dependencies — auth + RBAC.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database import get_db
from app.models.auth import User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def current_user(
    token: str = Depends(oauth2),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        data = decode_token(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")

    user = await db.get(User, data.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive")
    return user


def require(permission: str):
    """
    FastAPI dependency factory.
    Usage: router.get("/", dependencies=[Depends(require("survey:read"))])
    Admins bypass all permission checks.
    """
    async def _check(user: User = Depends(current_user)) -> User:
        if user.role.name == "admin":
            return user
        perms = {p.code for p in user.role.permissions}
        if permission not in perms:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"missing permission: {permission}",
            )
        return user
    return _check
