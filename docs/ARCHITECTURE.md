# SATARK — Architecture

## System diagram

```
Enumerator app / Web UI
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  SATARK API  (FastAPI / uvicorn)                           │
│                                                           │
│  collection_service ──► IntelligenceOrchestrator          │
│                              │                            │
│              ┌───────────────┼──────────────┐             │
│              ▼               ▼              ▼             │
│        rule_engine    bayesian_engine  behaviour_engine   │
│              └───────────────┬──────────────┘             │
│                              ▼                            │
│                        trust_engine ──► TrustResult       │
│                       (VERDICT LANE)    stored to DB      │
│                                                           │
│  [assist lane — suggest only, never on verdict path]      │
│    rag/service ◄── coding_engine ◄── nlp_engine           │
│    survey_gen  ◄── llm (Gemma/Ollama)                     │
│    translation ◄── voice (Sarvam)                         │
└───────────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
  PostgreSQL 16               Redis 7 Streams
  (primary store)             (events, cache)
        │
        ▼
  ChromaDB (vectors)
  BGE embedder (local)
```

## Key decisions

### 1. Deterministic verdict lane

Every accept/reject/review decision is produced by:
- **Rule engine** — cross-field consistency, range checks, mandatory fields
- **Bayesian engine** — per-stratum anomaly scoring with stored priors
- **Behaviour engine** — paradata signals (timing, GPS drift, edit count)
- **Trust engine** — weighted aggregation (validation 0.40, fraud 0.30, evidence 0.15, behaviour 0.15)

No model call is ever made in this path. The verdict is reproducible and auditable.

### 2. Assist lane (suggest-only)

RAG + Gemma live entirely in `app/intelligence/assist/`. They:
- Suggest occupation codes (human confirms)
- Draft survey questions (human edits before publish)
- Extract slots from open-text fields
- Translate and transcribe

They have **no write access** to trust_scores, validation_results, or audit_logs.

### 3. Context lookup instead of Neo4j

Occupation → NIC sector mapping is a CSV-backed lookup table with a plausibility matrix (occupation × income × age). This replaces a graph DB for the demo scale. Neo4j is a roadmap item when relation traversal queries dominate.

### 4. Storage rationale

| Store | Use |
|---|---|
| PostgreSQL 16 | All structured data, JSONB rule payloads, audit log |
| Redis 7 | Event streams (response submitted, trust scored), translation cache |
| ChromaDB | RAG vector embeddings from public KB documents |

### 5. Sovereignty

- All embeddings: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (local)
- All reranking: `BAAI/bge-reranker-base` (local)
- LLM: Gemma 2B via Ollama (local) or NIC-hosted
- Voice: Sarvam (NIC-approved endpoint)
- No citizen data crosses the deployment boundary
- `data/kb/` contains only public MoSPI/NSO documents
