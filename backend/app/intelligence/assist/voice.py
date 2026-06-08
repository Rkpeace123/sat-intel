"""
Voice engine — assist lane, Phase 12.

Sarvam STT + TTS, one path, behind ENABLE_VOICE feature flag.
A voice transcript enters the SAME /intelligence/answer pipeline as typed input —
voice is just another channel; it runs through the identical verdict lane.

Degrades gracefully: if ENABLE_VOICE=false or SARVAM_API_KEY unset →
return a "disabled" turn instead of erroring.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import httpx


@dataclass
class VoiceTurn:
    transcript: str
    language:   str
    audio_url:  str | None = None
    provider:   str = "sarvam"
    is_verdict: bool = False     # assist lane — never a verdict


def _bcp47(lang: str) -> str:
    return {"en": "en-IN", "hi": "hi-IN", "ta": "ta-IN"}.get(lang, "en-IN")


class VoiceEngine:
    """
    Scoped voice — Sarvam STT / TTS.
    Feature-flagged: ENABLE_VOICE=true + SARVAM_API_KEY required for live use.
    """

    def __init__(self):
        self.enabled  = os.getenv("ENABLE_VOICE", "false").lower() == "true"
        self.api_key  = os.getenv("SARVAM_API_KEY", "")
        self.base_url = "https://api.sarvam.ai"

    async def speech_to_text(
        self,
        audio_bytes: bytes,
        language: str = "ta",
    ) -> VoiceTurn:
        if not self.enabled or not self.api_key:
            return VoiceTurn(transcript="", language=language, provider="disabled")
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                f"{self.base_url}/speech-to-text",
                headers={"api-subscription-key": self.api_key},
                files={"file": ("audio.wav", audio_bytes, "audio/wav")},
                data={"language_code": _bcp47(language)},
            )
            r.raise_for_status()
            return VoiceTurn(
                transcript=r.json().get("transcript", ""),
                language=language,
            )

    async def text_to_speech(
        self,
        text: str,
        language: str = "ta",
    ) -> VoiceTurn:
        if not self.enabled or not self.api_key:
            return VoiceTurn(transcript=text, language=language, provider="disabled")
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                f"{self.base_url}/text-to-speech",
                headers={"api-subscription-key": self.api_key},
                json={
                    "inputs": [text],
                    "target_language_code": _bcp47(language),
                },
            )
            r.raise_for_status()
            audios = r.json().get("audios", [])
            return VoiceTurn(
                transcript=text,
                language=language,
                audio_url=audios[0] if audios else None,
            )
