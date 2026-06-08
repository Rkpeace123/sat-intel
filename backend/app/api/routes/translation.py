"""
Translation + Voice routes — assist lane, feature-flagged.
"""
from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from app.api.deps import require
from app.intelligence.assist.translation import TranslationEngine
from app.intelligence.assist.voice import VoiceEngine

router = APIRouter(tags=["assist: lang+voice"])

_t = TranslationEngine()
_v = VoiceEngine()


class TIn(BaseModel):
    text:        str
    target_lang: str
    source_lang: str | None = None


@router.post("/translate")
def translate(
    body: TIn,
    user  = Depends(require("survey:read")),
):
    """Translate text EN/HI/TA. Degrades to pass-through when ENABLE_TRANSLATION=false."""
    return _t.translate(body.text, body.target_lang, body.source_lang).__dict__


@router.post("/voice/stt")
async def speech_to_text(
    language: str = Form("ta"),
    file:     UploadFile = File(...),
    user      = Depends(require("collect:write")),
):
    """Sarvam STT. Transcript flows to /intelligence/answer as normal input."""
    turn = await _v.speech_to_text(await file.read(), language)
    return turn.__dict__


@router.post("/voice/tts")
async def text_to_speech(
    text:     str = Form(...),
    language: str = Form("ta"),
    user      = Depends(require("collect:write")),
):
    """Sarvam TTS. Returns audio_url for playback confirmation."""
    return (await _v.text_to_speech(text, language)).__dict__
