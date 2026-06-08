"""
Standardised error envelope + FastAPI exception handlers.
Every error response follows the shape:
  {"error": {"code": "...", "message": "...", "detail": "..."}}
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorEnvelope(BaseModel):
    code: str
    message: str
    detail: str | None = None


def _envelope(code: str, message: str, detail: str | None = None) -> dict:
    return {"error": ErrorEnvelope(code=code, message=message, detail=detail).model_dump()}


def register_exception_handlers(app: FastAPI) -> None:
    """Call this in create_app() after Phase 14 routes are mounted."""

    @app.exception_handler(404)
    async def not_found(_req: Request, _exc: Exception):
        return JSONResponse(
            status_code=404,
            content=_envelope("NOT_FOUND", "Resource not found"),
        )

    @app.exception_handler(422)
    async def validation_error(_req: Request, exc: Exception):
        return JSONResponse(
            status_code=422,
            content=_envelope("VALIDATION_ERROR", "Request validation failed", str(exc)),
        )

    @app.exception_handler(500)
    async def internal_error(_req: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content=_envelope("INTERNAL_ERROR", "Internal server error", str(exc)),
        )
