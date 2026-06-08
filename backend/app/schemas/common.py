"""Shared Pydantic schemas used across multiple domains."""
from pydantic import BaseModel


class OKResponse(BaseModel):
    status: str = "ok"
    message: str = ""


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: str | None = None
