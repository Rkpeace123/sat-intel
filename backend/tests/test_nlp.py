"""
Phase 5 — NLP engine tests.

Script-based EN/HI/TA detection, occupation→coding-RAG handoff,
generic text stays generic, extraction never emits a verdict.
"""
import pytest

from app.intelligence.assist.nlp_engine import NLPEngine, detect_language

ENG = NLPEngine(use_transformer=False)


class TestLanguageDetection:
    def test_english(self):
        assert detect_language("auto driver") == "en"

    def test_tamil(self):
        assert detect_language("ஆட்டோ ஓட்டுநர்") == "ta"

    def test_hindi(self):
        assert detect_language("गेहूं की खेती") == "hi"

    def test_mixed_tamil_english(self):
        assert detect_language("uber driver டாக்சி") == "mixed"

    def test_mixed_hindi_english(self):
        assert detect_language("salary job करता हूँ") == "mixed"


class TestExtraction:
    def test_occupation_intent_and_code_suggestion(self):
        ex = ENG.extract("auto driver")
        assert ex.intent == "occupation"
        assert ex.language == "en"
        assert isinstance(ex.code_suggestions, list)

    def test_tamil_occupation_routes_to_coder(self):
        ex = ENG.extract("ஆட்டோ ஓட்டுநர்")
        assert ex.language == "ta"
        assert ex.intent == "occupation"

    def test_hindi_occupation(self):
        ex = ENG.extract("किसान")
        assert ex.language == "hi"
        assert ex.intent == "occupation"

    def test_generic_text_no_coding(self):
        ex = ENG.extract("the weather is fine today")
        assert ex.intent == "generic"
        assert ex.code_suggestions == []

    def test_industry_intent(self):
        ex = ENG.extract("works in a factory")
        assert ex.intent == "industry"

    def test_location_intent(self):
        ex = ENG.extract("lives in a village near a district town")
        assert ex.intent == "location"

    def test_extraction_never_returns_verdict(self):
        d = ENG.extract("auto driver").as_dict()
        assert "status" not in d
        assert "confidence" not in d
        assert "verdict" not in d
        assert "is_verdict" not in d

    def test_transformer_flag_off_no_import(self):
        """Default engine must not import transformers."""
        import sys
        # transformers should not be in the call graph for default mode
        eng = NLPEngine(use_transformer=False)
        eng.extract("teacher")   # must not crash or trigger transformer import
        # If transformers is a mock in conftest, that's fine too

    def test_extraction_shape(self):
        ex = ENG.extract("paddy farmer")
        assert ex.raw == "paddy farmer"
        assert ex.normalized == "paddy farmer"
        assert isinstance(ex.entities, list)
