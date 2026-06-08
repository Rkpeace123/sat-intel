# SATARK — Agent Build Context

SATARK is the Adaptive Survey Intelligence & Validation Layer for MoSPI/NSO.
Build strictly against BUILD_PLAN.md, phase by phase.

## Inviolable contracts

1. **EXPLAINABILITY**: no stage emits a code/score/verdict without a stored plain-language reason.
2. **NO MODEL IN THE VERDICT LANE**: validation, fraud, confidence, trust, and adaptive
   routing are deterministic. LLM/Gemma and RAG live ONLY in `app/intelligence/assist/`
   and may suggest, never decide. There must be no Gemma/RAG call on the accept/reject path.
3. **SOVEREIGN**: local embeddings + local/NIC-hosted Gemma; no citizen data leaves the boundary;
   no foreign API in the data path. KB under `data/kb/` is PUBLIC documents only.
4. **CODING is retrieval-first**; low confidence routes to a human (DPD) and may fall back to
   the MoSPI DIID NIC search API. The LLM never classifies directly.

## Build order

Phase 1 structure → 2 schema+migrations → 4 rule engine → 7 bayesian → behaviour →
8 trust → orchestrator → 5 nlp(extraction) → 3 rag → coding(+NIC) → 9 adaptive →
10 survey-gen → collection+paradata → 14 api → 13 redis events → 11/12 translation+voice
(scoped) → 15 docker.

**Finish the verdict lane before parallelizing.**

## Workflow (per non-trivial change)

write code → spawn code-reviewer subagent → spawn qa subagent → parent applies fixes →
ship only when review passes and tests pass. Lock packages/contracts on day 1.

Self-anneal: on error, fix → test → note the fix.

## Definition of done for Phase 1

`docker compose up` builds; FastAPI serves /docs; /health returns ok; alembic is initialized.

## References

- Full phase-by-phase plan: [BUILD_PLAN.md](./BUILD_PLAN.md)
- Architecture decisions: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Roadmap (Qdrant / Neo4j / IndicTrans2-22 / biometric): [docs/ROADMAP.md](./docs/ROADMAP.md)
