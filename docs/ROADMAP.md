# SATARK — Roadmap Appendix

Items deliberately deferred from the demo-day build.
All are validated design choices; none are speculative.

---

## Qdrant (vector store upgrade)

**Trigger:** RAG corpus exceeds ~10 M chunks, or multi-tenancy per survey round needed.

**Why deferred:** ChromaDB handles demo scale (< 100k docs) with no ops overhead.
Qdrant adds: filtered ANN, payload indexing, named vectors, horizontal scaling.

**Migration path:** `rag/store.py` abstracts the collection interface — swap the backend,
keep the same `retrieve(query, top_k)` contract.

---

## Neo4j (knowledge graph)

**Trigger:** relation-traversal queries dominate (e.g., "all households in stratum X
where occupation links to sector Y and income links to tax-band Z").

**Why deferred:** the context_engine CSV lookup handles occupation → sector for demo.
Neo4j adds: Cypher traversal, graph algorithms (community detection for cluster fraud).

**Migration path:** `verdict/context_engine.py` → Neo4j-backed at the same interface.

---

## IndicTrans2-22lang (full scheduled language coverage)

**Trigger:** pilot expansion to states beyond Hindi/Tamil belt (Odia, Bengali, Kannada, etc.)

**Why deferred:** EN/HI/TA covers the demo states. IndicTrans2-3lang is lighter.

**Migration path:** `assist/translation.py` → swap model; same `translate(text, src, tgt)` API.

---

## Biometric liveness check

**Trigger:** Phase 2 product (post-pilot).

**Scope:** enumerator authentication via device camera before each session.
Requires hardware support policy approval from MoSPI/NIC.

---

## Microservices split

**Trigger:** demonstrated bottleneck — e.g., RAG ingest saturates API workers,
or voice transcription latency exceeds SLA.

**Split plan:**
- `satark-verdict` — rule + bayesian + behaviour + trust (stateless, scale to 0)
- `satark-assist` — RAG + coding + NLP (GPU node, separate scaling)
- `satark-voice` — Sarvam proxy + TTS (edge-deployable)
- `satark-api` — thin gateway + auth + RBAC

**Current stance:** monolith-first; split on evidence, not speculation.

---

## Streaming voice (Phase 12+)

**Trigger:** > 30-second field voice sessions where buffering is unacceptable.

**Plan:** Sarvam streaming WebSocket → partial transcript → incremental validation.

---

## pgvector (PostgreSQL vector extension)

**Trigger:** operational preference for single-DB footprint post-scale.

**Plan:** add `pgvector` extension; migrate ChromaDB collections to `embeddings` table
using HNSW index. Keeps vectors co-located with metadata and simplifies backup.
