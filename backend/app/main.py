from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Warm RAG singletons (load models once; avoids first-request latency) ──
    from app.intelligence.assist.rag.embeddings import _model as _emb
    from app.intelligence.assist.rag.reranker   import _model as _rr
    _emb()
    _rr()

    # ── Register demo survey-gen cache ────────────────────────────────────────
    from app.seed import _register_demo_cache
    _register_demo_cache()

    yield

    # ── Cleanup ───────────────────────────────────────────────────────────────
    from app.redis_client import close as redis_close
    await redis_close()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Adaptive Survey Intelligence & Validation Layer for MoSPI/NSO. "
            "Deterministic verdict lane · RAG+Gemma assist lane · EN/HI/TA."
        ),
        lifespan=lifespan,
    )

    # ── CORS (adjust origins in production) ──────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health ────────────────────────────────────────────────────────────────
    @app.get("/health", tags=["meta"])
    async def health():
        return {"status": "ok", "service": settings.app_name}

    # ── Routes ────────────────────────────────────────────────────────────────
    from app.api.routes import (
        analytics,
        auth,
        coding,
        collection,
        dashboard,
        enumerators,
        intelligence,
        surveys,
        translation,
    )

    PREFIX = "/api/v1"
    for router in (
        auth.router,
        surveys.router,
        collection.router,
        intelligence.router,
        dashboard.router,
        enumerators.router,
        analytics.router,
        translation.router,
    ):
        app.include_router(router, prefix=PREFIX)

    # Assist routes (coding, RAG, survey-gen) — no sub-prefix; paths defined in router
    app.include_router(coding.router, prefix=PREFIX)

    return app


app = create_app()
