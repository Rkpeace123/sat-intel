"""
Demo rehearsal — single command, both wow moments land.

Run: pytest tests/test_demo_rehearsal.py -v

Phase 1 smoke: /health, /docs
Phase 8 wow moments: genuine → Green ≥ 90, fabricated → Red < 50
Phase 8 enumerator: badge drops on stage

These assertions are LOCKED.  If a future change to weights, thresholds,
or engine logic breaks them, the demo breaks.  Tune config/data to pass;
never weaken these assertions to make a commit green.
"""
import pytest

from app.intelligence.schemas import ValidationContext
from app.intelligence.verdict.behaviour_engine import BehaviourEngine
from app.intelligence.verdict.rule_engine      import RuleEngine
from app.intelligence.verdict.trust_engine     import TrustEngine, roll_up_enumerator

ENGINE = RuleEngine()
BEHAV  = BehaviourEngine(median_seconds=90)
TRUST  = TrustEngine()

CROSS = {
    "field": "income", "rule_type": "cross_field", "severity": "error",
    "params": {"if_field": "occupation", "if_op": "eq", "if_value": "Unemployed",
               "then_field": "income", "then_op": "lte", "then_value": 50000},
}
RANGE = {"field": "age", "rule_type": "range", "severity": "error",
         "params": {"field": "age", "min": 0, "max": 120}}
CTX_RULE = {"field": "income", "rule_type": "context", "severity": "warning",
            "params": {"field": "income", "ref_key": "income"}}
RULES = [CROSS, RANGE, CTX_RULE]
REF   = {"income": {"p05": 6000, "median": 22000, "p95": 80000}}


def _assess(answers, paradata):
    ctx = ValidationContext(answers=answers, rules=RULES, reference=REF, paradata=paradata)
    v   = ENGINE.run(ctx)
    sig, b = BEHAV.run(paradata=paradata, answers=answers)
    return TRUST.aggregate(v + b, sig, True)


# ── Phase 1 smoke ─────────────────────────────────────────────────────────────

def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "SATARK" in data["service"]


def test_docs_renders(client):
    resp = client.get("/docs")
    assert resp.status_code == 200


# ── Phase 8 wow moments ───────────────────────────────────────────────────────

def test_wow_genuine_green_above_90():
    """Wow moment 1 — genuine response: Green band, confidence ≥ 90."""
    r = _assess(
        answers={"occupation": "Salaried", "income": 25000, "age": 34, "household": 4},
        paradata={"total_seconds": 340,
                  "question_timings": {"a": 80, "b": 70, "c": 90, "d": 100},
                  "correction_count": 2},
    )
    assert r.risk_level == "Green", (
        f"Wow moment 1 FAILED: expected Green, got {r.risk_level} "
        f"(confidence={r.confidence:.1f})"
    )
    assert r.confidence >= 90, (
        f"Wow moment 1 FAILED: confidence {r.confidence:.1f} below 90 target"
    )


def test_wow_fabricated_red_below_50():
    """Wow moment 2 — fabricated response: Red band, confidence < 50, reasons present."""
    # Straight-line "99" answers + speeding → fraud_score ≥ 65 → confidence ~49
    r = _assess(
        answers={"occupation": "Unemployed", "income": 200000, "age": 34,
                 "q1": "99", "q2": "99", "q3": "99", "q4": "99"},
        paradata={"total_seconds": 15,
                  "question_timings": {"a": 4, "b": 3, "c": 4, "d": 4},
                  "correction_count": 0},
    )
    assert r.risk_level == "Red", (
        f"Wow moment 2 FAILED: expected Red, got {r.risk_level} "
        f"(confidence={r.confidence:.1f})"
    )
    assert r.confidence < 50, (
        f"Wow moment 2 FAILED: confidence {r.confidence:.1f} not below 50"
    )
    assert any("contradicts" in x for x in r.reasons), (
        "Cross-field reason missing from wow moment 2"
    )
    assert any("median" in x or "pace" in x for x in r.reasons), (
        "Speed reason missing from wow moment 2"
    )
    assert r.recommendation == "re_interview"


def test_wow_enumerator_badge_drops():
    """Wow moment 3 — enumerator badge visibly drops on stage after bad response."""
    score, level, trend = roll_up_enumerator(
        prev_score=92.0,
        prev_trend=[92.0, 93.0],   # short history so one bad response pulls mean to Amber
        new_confidence=46.0,
    )
    assert score < 92.0, f"Badge should have dropped from 92.0, got {score}"
    assert trend[-1] == 46.0
    assert level in ("Amber", "Red"), f"Expected Amber or Red badge, got {level}"


def test_is_verdict_true_in_wire_format():
    r = _assess({"occupation": "Salaried", "income": 25000}, paradata={})
    assert r.as_dict()["is_verdict"] is True


def test_breakdown_all_four_components():
    r = _assess({"occupation": "Unemployed", "income": 200000}, paradata={})
    assert set(r.breakdown) == {"validation", "fraud", "evidence", "behaviour"}
    assert all(0 <= v <= 100 for v in r.breakdown.values())
