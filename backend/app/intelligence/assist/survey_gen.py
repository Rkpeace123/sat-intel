"""
Survey generation — assist lane.  Phase 10.

Prompt → editable survey draft, constrained to the question-bank RAG.
NEVER auto-publishes.  Output is always needs_review=True, is_verdict=False.

The exact demo prompt is cached for a zero-risk, identical-every-time stage
beat.  Arbitrary prompts work via the live RAG + Gemma path.

A generated survey, once published by SDRD, runs through the identical verdict
lane as a hand-built one — no special trust treatment.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.intelligence.assist.rag import reranker, retrieval
from app.intelligence.assist.rag import llm as rag_llm
from app.intelligence.assist.rag.config import CONTEXT_K, RETRIEVE_K, Bucket

# ── Demo-prompt cache — deterministic, safe on stage ─────────────────────────
_DEMO_CACHE: dict[str, dict] = {}


def register_demo_draft(prompt_key: str, draft: dict) -> None:
    """Register a canned draft for a specific prompt (case-insensitive)."""
    _DEMO_CACHE[prompt_key.strip().lower()] = draft


@dataclass
class SurveyDraft:
    title:            dict                # {en, hi, ta}
    nodes:            list                # question nodes (question_graph shape)
    branches:         dict                # adaptive branch map
    validation_rules: list                # suggested rules (SDRD confirms)
    sources:          list                # RAG provenance
    confidence:       int
    needs_review:     bool = True         # ALWAYS — a human publishes, never the model

    def as_dict(self) -> dict:
        return {
            "title":            self.title,
            "nodes":            self.nodes,
            "branches":         self.branches,
            "validation_rules": self.validation_rules,
            "sources":          self.sources,
            "confidence":       self.confidence,
            "needs_review":     self.needs_review,
            "is_verdict":       False,    # hard invariant — never True
        }


class SurveyGenerator:
    """
    Assist-lane survey drafting.
    Retrieve real bank questions → Gemma assembles an editable draft
    constrained to those questions → SDRD reviews/publishes.
    The model proposes; it never finalises.
    """

    _TASK = (
        "From ONLY the retrieved survey questions below, assemble a coherent draft "
        "questionnaire for the stated objective. Return STRICT JSON with keys: "
        "title{en,hi,ta}, nodes[{id,q{en},type,options?,code_type?}], "
        "branches{}, validation_rules[]. "
        "Do not invent questions outside the context. "
        "If the context is insufficient, return {\"error\":\"INSUFFICIENT_EVIDENCE\"}."
    )

    async def generate(
        self,
        objective: str,
        domain: str | None = None,
    ) -> SurveyDraft:
        key = objective.strip().lower()

        # Demo-safe deterministic path — exact prompt → cached draft
        if key in _DEMO_CACHE:
            d = _DEMO_CACHE[key]
            return SurveyDraft(**{**d, "needs_review": True})

        # Live path: hybrid retrieval → rerank → Gemma (assist only)
        query  = f"{objective} {domain or ''}".strip()
        pool   = retrieval.retrieve(Bucket.SURVEY_GEN, query, RETRIEVE_K)
        ranked = reranker.rerank(query, pool, CONTEXT_K)

        if not ranked:
            return SurveyDraft(
                title={"en": objective, "hi": objective, "ta": objective},
                nodes=[], branches={}, validation_rules=[],
                sources=[], confidence=0,
            )

        ctx  = "\n\n".join(f"[{i+1}] {h['text']}" for i, h in enumerate(ranked))
        text = await rag_llm.generate(f"{self._TASK}\n\nObjective: {objective}", ctx)
        parsed = self._parse(text, objective)

        top        = ranked[0].get("rnorm", ranked[0].get("fused", 0.0))
        confidence = int(round(100 * (0.7 * top + 0.3 * min(len(ranked), CONTEXT_K) / CONTEXT_K)))

        return SurveyDraft(
            title=parsed.get("title", {"en": objective, "hi": objective, "ta": objective}),
            nodes=parsed.get("nodes", []),
            branches=parsed.get("branches", {}),
            validation_rules=parsed.get("validation_rules", []),
            sources=sorted({h["metadata"].get("source", "?") for h in ranked}),
            confidence=confidence,
        )

    def _parse(self, text: str, objective: str) -> dict:
        """Robust JSON extraction — Gemma may wrap JSON in prose or fences."""
        try:
            start = text.index("{")
            end   = text.rindex("}") + 1
            obj   = json.loads(text[start:end])
            if "error" in obj:
                return {"title": {"en": objective}, "nodes": []}
            return obj
        except (ValueError, json.JSONDecodeError):
            return {"title": {"en": objective}, "nodes": []}


# ── Singleton for API routes ──────────────────────────────────────────────────
survey_generator = SurveyGenerator()
