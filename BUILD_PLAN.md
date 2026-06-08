# SATARK — Phase-by-Phase Build Plan

> MoSPI-aligned, production-grade, demo-day-ready.
> Deterministic verdict lane + RAG/Gemma assist lane.
> Stack: FastAPI · PostgreSQL · Redis · ChromaDB · Gemma (local) · Sarvam (voice)

---

## Architecture pillars

| Pillar | Decision | Rationale |
|---|---|---|
| Verdict lane | Rules + Bayesian + Behaviour → Trust score | Explainable, auditable, no model latency |
| Assist lane | RAG (Chroma + BGE) + Gemma (Ollama) | Suggest-only, never on accept/reject path |
| Storage | Postgres (primary) + Redis (streams/cache) + Chroma/pgvector (vectors) | Proven, ops-friendly |
| Context lookup | Occupation → sector lookup table | Replaces Neo4j; simpler, faster |
| Languages | EN / HI / TA | MuRIL/IndicBERT extraction; Sarvam one-path voice |
| Sovereignty | All models local or NIC-hosted | No citizen data crosses boundary |

---

## Phase 1 — Codebase structure ✅

**Done when:** `uvicorn app.main:app` boots, `/health` returns ok, `alembic init` succeeds.

Deliverables:
- Full directory tree (see README for structure)
- `pyproject.toml` with frozen deps
- `backend/app/config.py` — pydantic-settings
- `backend/app/main.py` — FastAPI factory + `/health`
- `.env.example`
- `CLAUDE.md` + `BUILD_PLAN.md`

---

## Phase 2 — PostgreSQL schema + Alembic migrations

**Done when:** `alembic upgrade head` runs clean; all 25 tables exist.

Tables (25):
- Auth: `users`, `roles`, `permissions`, `role_permissions`
- Survey: `surveys`, `templates`, `questions`, `adaptive_logic`, `validation_rules`
- Field: `enumerators`, `assignments`, `households`
- Response: `responses`, `response_versions`, `paradata`
- Intelligence: `trust_scores`, `validation_results`, `coding_results`
- Knowledge: `knowledge_sources`, `rag_collections`, `embeddings`, `kg_entities`, `kg_relations`
- Session: `voice_sessions`, `translation_sessions`
- Audit: `audit_logs` (append-only, no UPDATE/DELETE)

Key design choices:
- UUID primary keys everywhere
- `TimestampMixin` (created_at, updated_at)
- JSONB for flexible metadata / rule payloads
- `response_versions` is immutable (append-only)
- `audit_logs` has a trigger that prevents UPDATE/DELETE

---

## Phase 3 — RAG pipeline (Assist lane)

**Done when:** ingest a PDF from `data/kb/`; similarity search returns top-5 with scores.

Components:
- `intelligence/assist/rag/embeddings.py` — BGE multilingual embedder (local)
- `intelligence/assist/rag/store.py` — ChromaDB collection wrapper
- `intelligence/assist/rag/retrieval.py` — hybrid BM25 + dense, reranker pass
- `intelligence/assist/rag/chunking.py` — recursive splitter, overlap, metadata
- `intelligence/assist/rag/ingest.py` — PDF/text → chunk → embed → store
- `intelligence/assist/rag/service.py` — unified query interface

---

## Phase 4 — Rule engine (Verdict lane)

**Done when:** synthetic response set scores ≥ 96 % genuine-correct, ≤ 5 % false-positive.

Components:
- `intelligence/verdict/rule_engine.py`
  - Cross-field consistency (age vs marital/employment)
  - Range validation per question type
  - Mandatory-field completeness
  - Each rule emits: `{rule_id, passed, reason, severity}`
- `intelligence/verdict/context_engine.py`
  - Occupation code → NIC sector lookup (CSV-backed, no DB round-trip)
  - Plausibility matrix (occupation × income × age)

---

## Phase 5 — NLP extraction (Assist lane)

**Done when:** open-text field → structured slot dict with confidence ≥ 0.85 on test set.

Components:
- `intelligence/assist/nlp_engine.py`
  - MuRIL / IndicBERT for token classification (extraction only, no generation)
  - Slot types: occupation_text, crop_name, illness_name, location_name
  - Output: `{field, value, confidence, model_version}`

---

## Phase 6 — (Reserved / skipped in current roadmap)

---

## Phase 7 — Bayesian anomaly engine (Verdict lane)

**Done when:** posterior anomaly flags match expert-labelled holdout at F1 ≥ 0.82.

Components:
- `intelligence/verdict/bayesian_engine.py`
  - Per-stratum priors from historical survey distributions (stored in DB)
  - Likelihood update on observed answer
  - Output: `{field, anomaly_score, prior, likelihood, posterior, reason}`
- Behaviour engine:
  - `intelligence/verdict/behaviour_engine.py`
  - Paradata signals: response_time_ms, edit_count, GPS drift, back-navigation
  - Output: `{signal, value, flag, reason}`

---

## Phase 8 — Trust aggregator (Verdict lane)

**Done when:** end-to-end pipeline: response in → trust score out, latency < 200 ms p95.

Components:
- `intelligence/verdict/trust_engine.py`
  - Weighted sum: validation 0.40 · fraud 0.30 · evidence 0.15 · behaviour 0.15
  - Output: `TrustResult(score, verdict, components, reasons[])`
- `intelligence/orchestrator.py`
  - Every response passes through: rules → bayesian → behaviour → trust
  - Stores results to `trust_scores`, `validation_results` tables

---

## Phase 9 — Adaptive question engine (Rules-based)

**Done when:** skip/show logic fires correctly on 20-question demo survey.

Components:
- `intelligence/adaptive/adaptive_engine.py`
  - Evaluates `adaptive_logic` table rules (JSON condition tree)
  - No model in the path; pure rule evaluation
  - Output: next question list + reason for each skip/show

---

## Phase 10 — Survey generation assist (Gemma + RAG)

**Done when:** prompt → draft survey JSON in < 8 s; human can edit before publish.

Components:
- `intelligence/assist/survey_gen.py`
  - RAG retrieves relevant question templates from `data/kb/`
  - Gemma drafts question text (suggest-only; human approves)
  - Output is a draft, never auto-published

---

## Phase 11 — Translation (EN / HI / TA)

**Done when:** round-trip EN→HI→EN BLEU ≥ 0.72 on 50-sentence test set.

Components:
- `intelligence/assist/translation.py`
  - IndicTrans2-3lang (HI + TA + EN) via Ollama or direct model load
  - Caches translations in Redis (TTL 24 h)
  - Roadmap: IndicTrans2-22lang (all scheduled languages)

---

## Phase 12 — Voice (Sarvam, single path)

**Done when:** recorded WAV → transcribed text → validated response, end-to-end.

Components:
- `intelligence/assist/voice.py`
  - Sarvam ASR (one endpoint, EN/HI/TA)
  - Normalise transcript → feed into standard response pipeline
  - TTS for replay/confirmation
  - Roadmap: multi-model, streaming

---

## Phase 13 — Redis Streams + event bus

**Done when:** response submitted event flows through Redis stream; dashboard consumer updates in < 500 ms.

Components:
- `redis_client.py` — asyncio pool, stream publish/consume helpers
- `services/events.py` — typed event publishers (ResponseSubmitted, TrustScored, etc.)
- Consumer groups for dashboard, analytics, audit

---

## Phase 14 — REST API (all routes)

**Done when:** Postman collection tests pass; auth/RBAC enforced on every protected route.

Routes (`/api/v1/`):
- `auth` — login, refresh, me, roles
- `surveys` — CRUD, publish, version
- `collection` — submit response, get next question
- `intelligence` — trust score, validation result, coding result
- `coding` — NIC lookup, manual override
- `enumerators` — CRUD, assignments
- `dashboard` — aggregates, maps
- `analytics` — cross-tab, trends
- `rag` — ingest, query (assist only)
- `translation` — translate text
- `voice` — upload WAV, get transcript

---

## Phase 15 — Docker Compose (full stack)

**Done when:** `docker compose up` starts all services; smoke test passes.

Services:
- `postgres` — Postgres 16
- `redis` — Redis 7
- `chroma` — ChromaDB server (or pgvector extension on postgres)
- `api` — SATARK FastAPI app
- `ollama` — Gemma model server (optional, CPU fallback)

---

## Roadmap appendix (post-demo)

These are deliberately out of scope for demo day:

| Feature | Why deferred |
|---|---|
| Qdrant | Chroma sufficient for demo scale; Qdrant when corpus > 10 M chunks |
| Neo4j | Context lookup replaces KG for now; Neo4j when relation queries dominate |
| IndicTrans2-22lang | EN/HI/TA covers demo states; 22-lang after infra scales |
| Biometric liveness | Requires hardware; Phase 2 product |
| Microservices split | Monolith-first; split on demonstrated bottleneck |
