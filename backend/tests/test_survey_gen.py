"""
Phase 10 — Survey generation tests.

Cached demo prompt is deterministic, needs_review always True,
is_verdict always False, JSON parser survives fences and garbage.
"""
import pytest

from app.intelligence.assist.survey_gen import SurveyGenerator, register_demo_draft

GEN = SurveyGenerator()


class TestSurveyGen:
    @pytest.mark.asyncio
    async def test_cached_prompt_deterministic_needs_review(self):
        register_demo_draft("test survey abc", {
            "title":            {"en": "Test Survey", "hi": "परीक्षण", "ta": "சோதனை"},
            "nodes":            [{"id": "q1", "q": {"en": "Age?"}, "type": "number"}],
            "branches":         {},
            "validation_rules": [],
            "sources":          ["test.txt"],
            "confidence":       90,
        })
        d = await GEN.generate("Test Survey ABC")
        assert d.needs_review is True
        assert d.as_dict()["is_verdict"] is False
        assert d.nodes[0]["id"] == "q1"
        assert d.title["en"] == "Test Survey"

    @pytest.mark.asyncio
    async def test_needs_review_always_true(self):
        register_demo_draft("dummy prompt xyz", {
            "title": {"en": "X"}, "nodes": [], "branches": {},
            "validation_rules": [], "sources": [], "confidence": 50,
        })
        d = await GEN.generate("dummy prompt xyz")
        assert d.needs_review is True

    def test_parser_handles_fenced_json(self):
        out = GEN._parse(
            '```json\n{"title":{"en":"X"},"nodes":[{"id":"a"}]}\n```',
            "objective",
        )
        assert out["title"]["en"] == "X"
        assert out["nodes"][0]["id"] == "a"

    def test_parser_handles_prose_wrapped_json(self):
        out = GEN._parse(
            'Here is the survey:\n{"title":{"en":"Y"},"nodes":[]}\nEnd.',
            "obj",
        )
        assert out["title"]["en"] == "Y"

    def test_parser_degrades_on_garbage(self):
        out = GEN._parse("sorry I cannot help with that", "My Objective")
        assert out["nodes"] == []
        assert out["title"]["en"] == "My Objective"

    def test_parser_handles_insufficient_evidence(self):
        out = GEN._parse('{"error":"INSUFFICIENT_EVIDENCE"}', "goal")
        assert out["nodes"] == []

    @pytest.mark.asyncio
    async def test_as_dict_is_verdict_false(self):
        register_demo_draft("check is_verdict 2", {
            "title": {"en": "T"}, "nodes": [], "branches": {},
            "validation_rules": [], "sources": [], "confidence": 0,
        })
        d = await GEN.generate("check is_verdict 2")
        assert d.as_dict()["is_verdict"] is False
