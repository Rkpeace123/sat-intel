from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, get_db
from app.core.security import create_token, verify_password
from app.models.auth import User

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str


@router.post("/login", response_model=TokenOut)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.username == form.username))
    ).scalar_one_or_none()

    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "invalid credentials")
    if not user.is_active:
        raise HTTPException(403, "account disabled")

    return TokenOut(
        access_token=create_token(str(user.id)),
        role=user.role.name,
    )


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {
        "id":       str(user.id),
        "username": user.username,
        "role":     user.role.name,
        "permissions": [p.code for p in user.role.permissions],
    }
