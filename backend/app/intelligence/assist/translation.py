"""
Translation engine — assist lane, Phase 11.

EN/HI/TA survey content (question_graph carries {en,hi,ta}) works with ZERO
live translation calls — the frontend selects the language from the authored
text.  This engine handles free-text / open-ended answers and is feature-flagged
behind ENABLE_TRANSLATION.

Provider: static pass-through now; IndicTrans2 (22-lang) = roadmap.
Degrades gracefully: if flag off or provider errors → return original text.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from app.config import settings

# ── Script-based language detection (offline) ─────────────────────────────────
_DEV = re.compile(r"[\u0900-\u097F]")
_TAM = re.compile(r"[\u0B80-\u0BFF]")
SUPPORTED = {"en", "hi", "ta"}


def detect_language(text: str) -> str:
    if _TAM.search(text):
        return "ta"
    if _DEV.search(text):
        return "hi"
    return "en"


@dataclass
class Translation:
    source_lang: str
    target_lang: str
    text:        str
    translated:  str
    provider:    str         # static | indictrans2
    is_verdict:  bool = False   # assist lane — never a verdict


class TranslationEngine:
    """
    Assist-lane translation.
    Flag-gated: ENABLE_TRANSLATION=true enables live path.
    Graceful fallback: any error → static pass-through.
    """

    def __init__(self):
        self.enabled = os.getenv("ENABLE_TRANSLATION", "false").lower() == "true"

    def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str | None = None,
    ) -> Translation:
        src = source_lang or detect_language(text)
        if target_lang not in SUPPORTED:
            target_lang = "en"

        # Static path: same language or flag off → pass through
        if not self.enabled or src == target_lang:
            return Translation(src, target_lang, text, text, provider="static")

        # Live path (roadmap): IndicTrans2 via local / NIC-hosted endpoint
        try:
            translated = self._indictrans2(text, src, target_lang)
            return Translation(src, target_lang, text, translated, provider="indictrans2")
        except Exception:  # noqa: BLE001
            return Translation(src, target_lang, text, text, provider="static")

    def _indictrans2(self, text: str, src: str, tgt: str) -> str:
        # Roadmap: wire to AI4Bharat IndicTrans2 when ENABLE_TRANSLATION=true.
        # Raising here falls back to static in the caller.
        raise NotImplementedError("IndicTrans2 endpoint not configured")
