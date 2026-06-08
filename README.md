# SATARK — Adaptive Survey Intelligence & Validation Layer

> **MoSPI / NSO production-grade survey intelligence platform.**
> Deterministic verdict lane (rules + Bayesian + behaviour → trust score) with a
> RAG + Gemma assist lane for suggestions. Explainable, sovereign, demo-day-ready.

---

## Quick start

```bash
# 1. Clone and enter
cd satark

# 2. Set up Python env
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# 3. Configure
cp ../.env.example ../.env         # edit secrets

# 4. Boot
uvicorn app.main:app --reload
# → http://localhost:8000/docs
# → http://localhost:8000/health  {"status":"ok"}
```

Full stack (Phase 15):

```bash
docker compose up
```

---

## Project structure

```
satark/
├── CLAUDE.md                      # agent context → references BUILD_PLAN
├── BUILD_PLAN.md                  # phase-by-phase plan
├── docker-compose.yml             # postgres + redis + chroma + api
├── .env.example
├── README.md
│
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── Dockerfile
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                # FastAPI factory, router mount, lifespan
│   │   ├── config.py              # pydantic-settings
│   │   ├── database.py            # async SQLAlchemy engine + session
│   │   ├── redis_client.py        # asyncio pool + streams helpers
│   │   ├── models/                # SQLAlchemy ORM (Phase 2)
│   │   ├── schemas/               # Pydantic v2 DTOs
│   │   ├── core/                  # security, rbac, errors
│   │   ├── intelligence/          # ── THE CORE USP ──
│   │   │   ├── verdict/           # deterministic lane (no model)
│   │   │   ├── adaptive/          # rules-based skip logic
│   │   │   └── assist/            # RAG + Gemma (suggest-only)
│   │   ├── services/              # orchestration
│   │   └── api/                   # REST routes (Phase 14)
│   ├── data/
│   │   ├── kb/                    # PUBLIC docs only — RAG corpus
│   │   ├── seed/                  # seed users, codes, demo survey
│   │   └── chroma/                # vector store (gitignored)
│   └── tests/
│
└── docs/
    ├── ARCHITECTURE.md
    └── ROADMAP.md
```

---

## Architecture decisions

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full rationale.

| Layer | Choice | Notes |
|---|---|---|
| Verdict | Rules + Bayesian + Behaviour | No model; fully explainable |
| Assist | ChromaDB + BGE + Gemma | Suggest-only |
| DB | PostgreSQL 16 + Redis 7 | JSONB for payloads |
| Vectors | ChromaDB (pgvector roadmap) | Local, sovereign |
| Voice | Sarvam single path | EN/HI/TA |
| Languages | EN / HI / TA | MuRIL extraction |

---

## Inviolable contracts

1. **No model in the verdict lane** — accept/reject is always deterministic.
2. **Explainability** — every score stores a plain-language reason.
3. **Sovereign** — no citizen data leaves the deployment boundary.
4. **Coding is retrieval-first** — LLM never classifies directly.

---

## Roadmap

Qdrant, Neo4j, IndicTrans2-22lang, biometric liveness, microservices split — see [docs/ROADMAP.md](docs/ROADMAP.md).
