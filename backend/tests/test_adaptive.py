"""
Phase 9 — Adaptive engine tests.

branch on structured answer, skip when N/A, simplify on fatigue≥60,
reorder on dropout≥70, default ASK with reason, and no LLM in the path.
"""
import pytest

from app.intelligence.adaptive.adaptive_engine import AdaptiveEngine
from app.intelligence.schemas import ValidationContext
from app.intelligence.verdict.behaviour_engine import BehaviourSignals

ENG = AdaptiveEngine()

LOGIC = [
    {"action": "BRANCH", "trigger": {"field": "occupation", "value": "Student"},
     "target": {"branch": "Student", "qid": "institution"}},
    {"action": "SKIP",   "trigger": {"field": "occupation", "value": "Salaried"},
     "target": {"qid": "land_holding"}},
]


def _sig(fatigue: float = 20, dropout: float = 10) -> BehaviourSignals:
    return BehaviourSignals(
        engagement=80, fatigue=fatigue, dropout_risk=dropout,
        quality=90, fraud_signals=[], fraud_score=0,
    )


def _ctx(answers: dict) -> ValidationContext:
    return ValidationContext(answers=answers, rules=[])


class TestAdaptiveEngine:
    def test_branch_on_structured_answer(self):
        d = ENG.decide(_ctx({"occupation": "Student"}), _sig(), LOGIC)
        assert d["action"] == "BRANCH"
        assert d["params"]["branch"] == "Student"
        assert "Student" in d["reason"]

    def test_skip_when_not_applicable(self):
        d = ENG.decide(_ctx({"occupation": "Salaried"}), _sig(), LOGIC)
        assert d["action"] == "SKIP"
        assert d["target"] == "land_holding"

    def test_simplify_on_high_fatigue(self):
        d = ENG.decide(_ctx({"occupation": "Farmer"}), _sig(fatigue=64), LOGIC, last_qid="q7")
        assert d["action"] == "SIMPLIFY"
        assert "fatigue" in d["reason"]
        assert d["target"] == "q7"

    def test_reorder_on_high_dropout(self):
        d = ENG.decide(_ctx({"occupation": "Farmer"}), _sig(dropout=75), LOGIC)
        assert d["action"] == "REORDER"
        assert "dropout" in d["reason"]

    def test_default_is_ask_with_reason(self):
        d = ENG.decide(_ctx({"occupation": "Farmer"}), _sig(), LOGIC)
        assert d["action"] == "ASK"
        assert d["reason"]

    def test_branch_takes_priority_over_simplify(self):
        """BRANCH fires even when fatigue is high."""
        d = ENG.decide(_ctx({"occupation": "Student"}), _sig(fatigue=80), LOGIC)
        assert d["action"] == "BRANCH"

    def test_skip_fires_before_reorder(self):
        """SKIP has higher priority than REORDER."""
        d = ENG.decide(_ctx({"occupation": "Salaried"}), _sig(dropout=90), LOGIC)
        assert d["action"] == "SKIP"

    def test_empty_logic_defaults_to_ask(self):
        d = ENG.decide(_ctx({"occupation": "Farmer"}), _sig(), adaptive_logic=[])
        assert d["action"] == "ASK"

    def test_every_decision_has_reason(self):
        for occ in ("Student", "Salaried", "Farmer", "Unemployed"):
            d = ENG.decide(_ctx({"occupation": occ}), _sig(), LOGIC)
            assert d["reason"] and isinstance(d["reason"], str)

    def test_no_llm_in_adaptive_engine(self):
        import app.intelligence.adaptive.adaptive_engine as mod
        src = open(mod.__file__).read()
        assert "llm" not in src
        assert "gemma" not in src.lower()
        assert "generate" not in src
