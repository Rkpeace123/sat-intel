"""
Phase 11 + 12 — Translation + Voice tests.

EN/HI/TA detection, graceful pass-through when flag off,
voice disabled returns empty not error.
"""
import pytest

from app.intelligence.assist.translation import TranslationEngine, detect_language
from app.intelligence.assist.voice import VoiceEngine

T = TranslationEngine()


class TestTranslation:
    def test_detect_english(self):
        assert detect_language("auto driver") == "en"

    def test_detect_tamil(self):
        assert detect_language("விவசாயி") == "ta"

    def test_detect_hindi(self):
        assert detect_language("किसान") == "hi"

    def test_passthrough_when_disabled(self):
        out = T.translate("hello", "ta")
        assert out.translated == "hello"
        assert out.provider == "static"
        assert out.is_verdict is False

    def test_same_language_is_passthrough(self):
        out = T.translate("வணக்கம்", "ta", "ta")
        assert out.translated == "வணக்கம்"
        assert out.provider == "static"

    def test_unsupported_target_lang_falls_back_to_en(self):
        out = T.translate("hello", "zz")
        assert out.target_lang == "en"

    def test_is_verdict_false(self):
        out = T.translate("survey question", "hi")
        assert out.is_verdict is False

    def test_translation_shape(self):
        out = T.translate("household size", "ta")
        assert out.source_lang in ("en", "hi", "ta")
        assert out.target_lang == "ta"
        assert out.text == "household size"


class TestVoice:
    @pytest.mark.asyncio
    async def test_disabled_returns_empty_not_error(self):
        v = VoiceEngine()   # ENABLE_VOICE unset in test env
        turn = await v.speech_to_text(b"", "ta")
        assert turn.provider == "disabled"
        assert turn.is_verdict is False
        assert turn.transcript == ""

    @pytest.mark.asyncio
    async def test_tts_disabled_returns_text_passthrough(self):
        v = VoiceEngine()
        turn = await v.text_to_speech("hello", "en")
        assert turn.provider == "disabled"
        assert turn.transcript == "hello"
        assert turn.is_verdict is False
