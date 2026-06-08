"""
NLP engine — assist lane, extraction only.  Phase 5.

Extracts structure from free text (occupation, industry, location, intent,
entities) to help the coding engine and survey flow.  Never validates or decides.

Default path is deterministic + coding RAG — works offline on CPU with no
transformer download.  MuRIL/IndicBERT is an optional upgrade
(extras=['nlp'], use_transformer=True) that augments entities but never
gates a verdict.

Language detection is script-based (Devanagari / Tamil / Latin regex) —
more reliable than probabilistic models on short official-survey strings.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

from app.intelligence.assist.rag import service as coding_assist


# ── Script-based language detection ──────────────────────────────────────────
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_TAMIL      = re.compile(r"[\u0B80-\u0BFF]")


def detect_language(text: str) -> str:
    """Return 'en', 'hi', 'ta', or 'mixed' based on Unicode script presence."""
    has_tam   = bool(_TAMIL.search(text))
    has_dev   = bool(_DEVANAGARI.search(text))
    has_latin = bool(re.search(r"[A-Za-z]", text))
    if has_tam:
        return "ta" if not has_latin else "mixed"
    if has_dev:
        return "hi" if not has_latin else "mixed"
    return "en"


# ── Intent / entity cues (covers demo + most field vocabulary) ────────────────
_OCC_CUES = (
    "driver", "farmer", "teacher", "shop", "worker", "labour", "developer",
    "engineer", "nurse", "doctor", "cook", "mechanic",
    # Hindi
    "किसान", "चालक", "विवसायी",
    # Tamil
    "ஓட்டுநர்", "விவசாயி", "ஆசிரியர்",
)
_IND_CUES = (
    "factory", "shop", "store", "service", "manufacturing", "agriculture",
    "transport", "retail", "taxi", "kirana", "mill",
)
_LOC_CUES = (
    "village", "district", "block", "city", "town", "nagar", "ward",
    "gram", "taluk", "mandal",
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


@dataclass
class Extraction:
    raw:              str
    normalized:       str
    language:         str                      # en | hi | ta | mixed
    intent:           str | None               # occupation | industry | location | generic
    entities:         list = field(default_factory=list)   # [{type, text}]
    occupation:       str | None = None
    industry:         str | None = None
    location:         str | None = None
    code_suggestions: list = field(default_factory=list)   # from coding RAG (assist)

    def as_dict(self) -> dict:
        return {**self.__dict__}


class NLPEngine:
    """
    Assist-lane extraction only.

    use_transformer=False (default): deterministic cue-matching + coding RAG.
      Runs offline, no download needed, suitable for demo.

    use_transformer=True: add MuRIL/IndicBERT NER on top (augments entities,
      never replaces rule path, degrades gracefully if model fails).
      Requires: pip install -e ".[nlp]"
    """

    def __init__(
        self,
        use_transformer: bool = False,
        model_name: str = "google/muril-base-cased",
    ):
        self.use_transformer = use_transformer
        self.model_name      = model_name

    @lru_cache(maxsize=1)
    def _ner(self):
        # Only imported when use_transformer=True and extras['nlp'] is installed
        from transformers import pipeline  # type: ignore[import]
        return pipeline(
            "token-classification",
            model=self.model_name,
            aggregation_strategy="simple",
        )

    def extract(self, text: str, hint: str | None = None) -> Extraction:
        raw    = text
        norm   = _normalize(text)
        lang   = detect_language(text)
        intent = hint or self._infer_intent(norm)
        ents   = self._rule_entities(norm)

        # Optional transformer NER — augments only, never gates verdict
        if self.use_transformer:
            try:
                for ent in self._ner()(text):
                    ents.append({"type": ent["entity_group"], "text": ent["word"]})
            except Exception:  # noqa: BLE001
                pass  # degrade gracefully — never break the pipeline

        occupation = norm if intent == "occupation" else None
        industry   = norm if intent == "industry"   else None
        location   = next(
            (e["text"] for e in ents if e["type"] in ("LOC", "location")), None
        )

        # Hand off to retrieval-first coder for code suggestions (ASSIST only)
        suggestions: list = []
        if intent in ("occupation", "industry"):
            suggestions = coding_assist.classify_code(norm).get("suggestions", [])

        return Extraction(
            raw=raw,
            normalized=norm,
            language=lang,
            intent=intent,
            entities=ents,
            occupation=occupation,
            industry=industry,
            location=location,
            code_suggestions=suggestions,
        )

    def _infer_intent(self, norm: str) -> str:
        if any(c in norm for c in _OCC_CUES):
            return "occupation"
        if any(c in norm for c in _IND_CUES):
            return "industry"
        if any(c in norm for c in _LOC_CUES):
            return "location"
        return "generic"

    def _rule_entities(self, norm: str) -> list[dict]:
        ents: list[dict] = []
        for cue in _OCC_CUES:
            if cue in norm:
                ents.append({"type": "occupation", "text": cue})
        for cue in _LOC_CUES:
            if cue in norm:
                ents.append({"type": "location", "text": cue})
        return ents
