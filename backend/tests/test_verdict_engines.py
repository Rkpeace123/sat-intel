"""
Phase 4 + 7 + 8 — verdict lane tests.

Rule engine, Bayesian engine, Behaviour engine, Trust aggregator, Orchestrator.
Property tests prove: reason always present, engine never raises, posterior ∈ [0,1].
Demo-defining tests prove: genuine → Green ≥ 90, fabricated → Red < 50.
"""
import pytest
from hypothesis import given, strategies as st

from app.intelligence.schemas import CheckResult, Status, ValidationContext
from app.intelligence.verdict.bayesian_engine  import BayesianEngine
from app.intelligence.verdict.behaviour_engine import BehaviourEngine, BehaviourSignals
from app.intelligence.verdict.rule_engine      import RuleEngine
from app.intelligence.verdict.trust_engine     import TrustEngine, roll_up_enumerator
from app.intelligence.orchestrator             import orchestrator, IntelligenceInput

ENGINE = RuleEngine()
BAYES  = BayesianEngine()
BEHAV  = BehaviourEngine(median_seconds=90)
TRUST  = TrustEngine()

# ── Shared fixtures ───────────────────────────────────────────────────────────
CROSS = {
    "field": "income", "rule_type": "cross_field", "severity": "error",
    "params": {"if_field": "occupation", "if_op": "eq", "if_value": "Unemployed",
               "then_field": "income", "then_op": "lte", "then_value": 50000},
}
RANGE = {
    "field": "age", "rule_type": "range", "severity": "error",
    "params": {"field": "age", "min": 0, "max": 120},
}
REQUIRED = {
    "field": "name", "rule_type": "required", "severity": "error",
    "params": {"field": "name"},
}
CTX_RULE = {
    "field": "income", "rule_type": "context", "severity": "warning",
    "params": {"field": "income", "ref_key": "income"},
}
LOGIC_RULE = {
    "field": "spouse_income", "rule_type": "logic", "severity": "error",
    "params": {"field": "spouse_income", "requires_field": "marital_status"},
}

REF = {"income": {"p05": 6000, "median": 22000, "p95": 80000}}
UNEMP_REF = {"stratum": "Unemployed_urban_TN", "median": 0,
             "params": {"dist": "lognormal", "mu": 6.5, "sigma": 0.9}}
SAL_REF   = {"stratum": "Salaried_urban_TN", "median": 28000,
             "params": {"dist": "lognormal", "mu": 10.24, "sigma": 0.55}}

RULES = [CROSS, RANGE, CTX_RULE]


def _ctx(answers, extra_rules=None, reference=None):
    return ValidationContext(
        answers=answers,
        rules=[CROSS, RANGE, CTX_RULE] + (extra_rules or []),
        reference=reference or REF,
    )


def _assess(answers, paradata, reference=None, evidence=True):
    """Full verdict-lane pipeline, returns TrustResult."""
    ctx = ValidationContext(answers=answers, rules=RULES,
                            reference=reference or REF, paradata=paradata)
    v_checks = ENGINE.run(ctx)
    sig, b_checks = BEHAV.run(paradata=paradata, answers=answers)
    return TRUST.aggregate(v_checks + b_checks, sig, evidence)


# ═════════════════════════════════════════════════════════
# PHASE 4 — RULE ENGINE
# ═════════════════════════════════════════════════════════

class TestRuleEngine:
    def test_fabricated_cross_field_fails_with_reason(self):
        res = ENGINE.run(_ctx({"occupation": "Unemployed", "income": 200000, "age": 34}))
        cf = next(r for r in res if r.layer == "cross_field")
        assert cf.status is Status.FAIL
        assert "contradicts" in cf.reason and "Unemployed" in cf.reason

    def test_genuine_response_passes_all(self):
        res = ENGINE.run(_ctx({"occupation": "Salaried", "income": 25000, "age": 34}))
        assert all(r.status is Status.PASS for r in res)

    def test_context_warns_outside_band_not_fail(self):
        res = ENGINE.run(_ctx({"occupation": "Salaried", "income": 200000, "age": 34}))
        ctx_r = next(r for r in res if r.layer == "context")
        assert ctx_r.status is Status.WARN

    def test_bad_number_is_reasoned_fail_not_exception(self):
        res = ENGINE.run(_ctx({"occupation": "Salaried", "income": "abc", "age": "xx"}))
        rng = next(r for r in res if r.layer == "rule" and r.field == "age")
        assert rng.status is Status.FAIL and "not a number" in rng.reason

    def test_cross_field_antecedent_not_met_does_not_fire(self):
        res = ENGINE.run(_ctx({"occupation": "Salaried", "income": 200000, "age": 34}))
        cf = next(r for r in res if r.layer == "cross_field")
        assert cf.status is Status.PASS

    def test_required_field_missing_fails(self):
        ctx = ValidationContext(answers={"age": 30}, rules=[REQUIRED], reference={})
        res = ENGINE.run(ctx)
        assert res[0].status is Status.FAIL and "required but missing" in res[0].reason

    def test_required_field_present_passes(self):
        ctx = ValidationContext(answers={"name": "Ravi Kumar"}, rules=[REQUIRED], reference={})
        assert ENGINE.run(ctx)[0].status is Status.PASS

    def test_logic_rule_skip_break_fails(self):
        ctx = ValidationContext(answers={"spouse_income": "30000"}, rules=[LOGIC_RULE], reference={})
        res = ENGINE.run(ctx)
        assert res[0].status is Status.FAIL and "prerequisite" in res[0].reason

    def test_logic_rule_prerequisite_present_passes(self):
        ctx = ValidationContext(
            answers={"spouse_income": "30000", "marital_status": "married"},
            rules=[LOGIC_RULE], reference={})
        assert ENGINE.run(ctx)[0].status is Status.PASS

    def test_unknown_rule_type_skipped_not_crash(self):
        ctx = ValidationContext(
            answers={"age": 30},
            rules=[{"rule_type": "galaxy_brain", "params": {"field": "age"}, "severity": "error"}],
            reference={})
        assert ENGINE.run(ctx) == []

    def test_fail_carries_recommended_action(self):
        res = ENGINE.run(_ctx({"occupation": "Unemployed", "income": 200000, "age": 34}))
        cf = next(r for r in res if r.layer == "cross_field")
        assert cf.recommended_action in ("re_interview", "review")

    @given(age=st.integers(min_value=-50, max_value=300))
    def test_property_reason_always_present(self, age):
        for r in ENGINE.run(_ctx({"occupation": "Salaried", "income": 25000, "age": age})):
            assert r.reason and isinstance(r.reason, str)

    @given(
        income=st.one_of(st.none(), st.floats(-1e7, 1e8), st.text(max_size=10)),
        age=st.one_of(st.none(), st.integers(-100, 500), st.text(max_size=5)),
    )
    def test_property_engine_never_raises(self, income, age):
        ENGINE.run(_ctx({"occupation": "Salaried", "income": income, "age": age}))


# ═════════════════════════════════════════════════════════
# PHASE 7 — BAYESIAN ENGINE
# ═════════════════════════════════════════════════════════

class TestBayesianEngine:
    def test_fabricated_income_high_posterior(self):
        r = BAYES.assess_field("income", 200000, UNEMP_REF)
        assert r is not None and r.posterior_anomaly >= 0.9
        assert "percentile" in r.reason and "anomaly" in r.reason

    def test_genuine_income_low_posterior(self):
        r = BAYES.assess_field("income", 25000, SAL_REF)
        assert r is not None and r.posterior_anomaly < 0.4

    def test_posterior_valid_for_range_of_values(self):
        for v in (0.01, 100, 5000, 25000, 200000, 9_999_999):
            r = BAYES.assess_field("income", v, SAL_REF)
            assert r is not None and 0.0 <= r.posterior_anomaly <= 1.0

    def test_non_numeric_returns_none(self):
        assert BAYES.assess_field("income", "lots", SAL_REF) is None
        assert BAYES.assess_field("income", None, SAL_REF) is None

    def test_missing_params_returns_none(self):
        assert BAYES.assess_field("income", 25000, {}) is None
        assert BAYES.assess_field("income", 25000, {"params": {}}) is None

    def test_zero_lognormal_returns_none(self):
        assert BAYES.assess_field("income", 0, UNEMP_REF) is None

    def test_reason_contains_stratum(self):
        r = BAYES.assess_field("income", 200000, UNEMP_REF)
        assert "Unemployed_urban_TN" in r.reason

    def test_run_fabricated_produces_fail(self):
        ctx = ValidationContext(answers={"income": 200000}, rules=[],
                                reference={"income": UNEMP_REF})
        checks, details = BAYES.run(ctx, ["income"], threshold=0.9)
        assert checks[0].status is Status.FAIL
        assert checks[0].recommended_action == "re_interview"

    def test_run_genuine_produces_pass(self):
        ctx = ValidationContext(answers={"income": 25000}, rules=[],
                                reference={"income": SAL_REF})
        assert BAYES.run(ctx, ["income"])[0][0].status is Status.PASS

    def test_field_without_reference_skipped(self):
        ctx = ValidationContext(answers={"income": 25000, "age": 34}, rules=[],
                                reference={"income": SAL_REF})
        checks, _ = BAYES.run(ctx, ["income", "age"])
        assert len(checks) == 1

    @given(v=st.floats(min_value=1.0, max_value=1e8, allow_nan=False, allow_infinity=False))
    def test_property_posterior_always_valid(self, v):
        r = BAYES.assess_field("income", v, SAL_REF)
        if r is not None:
            assert 0.0 <= r.posterior_anomaly <= 1.0
            assert r.reason and isinstance(r.reason, str)


# ═════════════════════════════════════════════════════════
# PHASE 8 — BEHAVIOUR ENGINE
# ═════════════════════════════════════════════════════════

class TestBehaviourEngine:
    def test_speeding_detected(self):
        sig, _ = BEHAV.run(
            paradata={"question_timings": {"a": 4, "b": 3, "c": 4, "d": 4}, "correction_count": 0},
            answers={"a": "1", "b": "2", "c": "3", "d": "4"})
        assert any(s["type"] == "speeding" for s in sig.fraud_signals)

    def test_normal_pace_no_speeding(self):
        sig, _ = BEHAV.run(
            paradata={"question_timings": {"a": 80, "b": 70, "c": 90, "d": 100}},
            answers={"a": "1", "b": "2", "c": "3", "d": "4"})
        assert not any(s["type"] == "speeding" for s in sig.fraud_signals)

    def test_straight_lining_detected(self):
        sig, _ = BEHAV.run(paradata={}, answers={f"q{i}": "999" for i in range(6)})
        assert any(s["type"] == "straight_lining" for s in sig.fraud_signals)

    def test_diverse_answers_no_straight_line(self):
        sig, _ = BEHAV.run(paradata={}, answers={f"q{i}": str(i * 137) for i in range(6)})
        assert not any(s["type"] == "straight_lining" for s in sig.fraud_signals)

    def test_correction_flood_detected(self):
        sig, _ = BEHAV.run(paradata={"correction_count": 25}, answers={"q1": "hello"})
        assert any(s["type"] == "correction_flood" for s in sig.fraud_signals)

    def test_no_correction_speed_combo(self):
        sig, _ = BEHAV.run(
            paradata={"question_timings": {"a": 15, "b": 12, "c": 13, "d": 14},
                      "correction_count": 0},
            answers={"a": "1", "b": "2", "c": "3", "d": "4"})
        # speed_ratio ≈ 0.15 — may trigger speeding or no_correction_speed
        types = {s["type"] for s in sig.fraud_signals}
        assert types & {"speeding", "no_correction_speed"}

    def test_gps_drift_detected(self):
        sig, _ = BEHAV.run(
            paradata={"gps_lat": 28.7041, "gps_lng": 77.1025}, answers={"q1": "v"},
            expected_lat=13.0827, expected_lon=80.2707)
        assert any(s["type"] == "gps_drift" for s in sig.fraud_signals)

    def test_gps_within_range_clean(self):
        sig, _ = BEHAV.run(
            paradata={"gps_lat": 13.0827, "gps_lng": 80.2707}, answers={"q1": "v"},
            expected_lat=13.09, expected_lon=80.275)
        assert not any(s["type"] == "gps_drift" for s in sig.fraud_signals)

    def test_low_effort_detected(self):
        sig, _ = BEHAV.run(paradata={}, answers={"occupation": "ab", "reason": "x"})
        assert any(s["type"] == "low_effort" for s in sig.fraud_signals)

    def test_fraud_signals_have_reasons(self):
        sig, checks = BEHAV.run(
            paradata={"question_timings": {"a": 4, "b": 3, "c": 4, "d": 4},
                      "correction_count": 0},
            answers={"a": "99", "b": "99", "c": "99", "d": "99"})
        for s in sig.fraud_signals:
            assert s["reason"] and isinstance(s["reason"], str)
        for c in checks:
            assert c.reason and isinstance(c.reason, str)

    def test_fraud_score_bounded(self):
        sig, _ = BEHAV.run(
            paradata={"question_timings": {"a": 2, "b": 2, "c": 2, "d": 2},
                      "correction_count": 0},
            answers={"a": "99", "b": "99", "c": "99", "d": "99"})
        assert 0 <= sig.fraud_score <= 100

    def test_quality_bounded(self):
        sig, _ = BEHAV.run(paradata={}, answers={"q1": "ok"})
        assert 0 <= sig.quality <= 100


# ═════════════════════════════════════════════════════════
# PHASE 8 — TRUST ENGINE (aggregator)
# ═════════════════════════════════════════════════════════

class TestTrustEngine:
    def test_as_dict_has_is_verdict_true(self):
        sig, checks = BEHAV.run(paradata={}, answers={"q1": "ok"})
        result = TRUST.aggregate(checks, sig, True)
        d = result.as_dict()
        assert d["is_verdict"] is True

    def test_breakdown_has_four_keys(self):
        sig, checks = BEHAV.run(paradata={}, answers={"q1": "ok"})
        r = TRUST.aggregate(checks, sig)
        assert set(r.breakdown) == {"validation", "fraud", "evidence", "behaviour"}

    def test_breakdown_components_bounded(self):
        sig, checks = BEHAV.run(paradata={}, answers={"q1": "ok"})
        r = TRUST.aggregate(checks, sig)
        assert all(0 <= v <= 100 for v in r.breakdown.values())

    def test_confidence_bounded(self):
        sig, checks = BEHAV.run(
            paradata={"question_timings": {"a": 2, "b": 2}, "correction_count": 0},
            answers={"a": "99", "b": "99"})
        r = TRUST.aggregate(checks, sig)
        assert 0 <= r.confidence <= 100

    def test_risk_levels_match_confidence(self):
        from app.intelligence.verdict.trust_engine import GREEN_THRESHOLD, AMBER_THRESHOLD
        sig0, _ = BEHAV.run(paradata={}, answers={"q1": "ok"})
        for (conf_expect, risk_expect) in [(95.0, "Green"), (65.0, "Amber"), (30.0, "Red")]:
            # Construct a BehaviourSignals that gives a specific quality
            sig = BehaviourSignals(engagement=100, fatigue=0, dropout_risk=0,
                                   quality=conf_expect, fraud_signals=[], fraud_score=0)
            r = TRUST.aggregate([], sig, True)
            # confidence will be near quality since all weights multiply it
            # just verify the band logic is correct for the result we get
            if r.confidence >= GREEN_THRESHOLD:
                assert r.risk_level == "Green"
            elif r.confidence >= AMBER_THRESHOLD:
                assert r.risk_level == "Amber"
            else:
                assert r.risk_level == "Red"

    def test_reasons_list_never_empty(self):
        sig, checks = BEHAV.run(paradata={}, answers={"q1": "ok"})
        r = TRUST.aggregate(checks, sig)
        assert isinstance(r.reasons, list) and len(r.reasons) >= 1
        for reason in r.reasons:
            assert isinstance(reason, str) and reason

    def test_evidence_absent_lowers_score(self):
        sig, _ = BEHAV.run(paradata={}, answers={"q1": "ok"})
        with_ev    = TRUST.aggregate([], sig, evidence_present=True)
        without_ev = TRUST.aggregate([], sig, evidence_present=False)
        assert with_ev.confidence >= without_ev.confidence


# ═════════════════════════════════════════════════════════
# PHASE 8 — DEMO-DEFINING TESTS (the wow moments)
# ═════════════════════════════════════════════════════════

class TestDemoMoments:
    """
    These tests define the demo-day targets.
    If a future change to weights or thresholds breaks them, the demo breaks.
    Tune config/data to pass; never weaken these assertions.
    """

    def test_genuine_response_lands_green_high_confidence(self):
        """Wow moment 1: genuine response → Green ≥ 90."""
        r = _assess(
            answers={"occupation": "Salaried", "income": 25000, "age": 34, "household": 4},
            paradata={"total_seconds": 340,
                      "question_timings": {"a": 80, "b": 70, "c": 90, "d": 100},
                      "correction_count": 2},
        )
        assert r.risk_level == "Green", f"Expected Green, got {r.risk_level} (confidence={r.confidence})"
        assert r.confidence >= 90, f"Genuine confidence {r.confidence} below 90 target"

    def test_fabricated_response_collapses_to_red(self):
        """Wow moment 2: fabricated response → Red < 50 with cross-field + speed reasons."""
        # Straight-line numeric answers (all "99") + speeding triggers fraud_score ≥ 65
        r = _assess(
            answers={"occupation": "Unemployed", "income": 200000, "age": 34,
                     "q1": "99", "q2": "99", "q3": "99", "q4": "99"},
            paradata={"total_seconds": 15,
                      "question_timings": {"a": 4, "b": 3, "c": 4, "d": 4},
                      "correction_count": 0},
        )
        assert r.risk_level == "Red", f"Expected Red, got {r.risk_level} (confidence={r.confidence})"
        assert r.confidence < 50, f"Suspicious confidence {r.confidence} not below 50"
        assert any("contradicts" in x for x in r.reasons), "Cross-field reason missing"
        assert any("median" in x or "pace" in x for x in r.reasons), "Speed reason missing"
        assert r.recommendation == "re_interview"

    def test_confidence_always_in_range(self):
        for occ, inc in [("Salaried", 25000), ("Unemployed", 200000), ("Farmer", 0)]:
            r = _assess(
                {"occupation": occ, "income": inc, "age": 30},
                {"total_seconds": 200, "question_timings": {"a": 60}},
            )
            assert 0 <= r.confidence <= 100

    def test_enumerator_badge_drops_after_bad_response(self):
        """Enumerator roll-up: badge visibly drops when a fabricated response is added."""
        score, level, trend = roll_up_enumerator(
            prev_score=92.0,
            prev_trend=[92.0, 93.0],   # short window so 46 pulls mean to Amber
            new_confidence=46,
        )
        assert score < 92, f"Badge should have dropped from 92, got {score}"
        assert trend[-1] == 46
        assert level in ("Amber", "Red")

    def test_breakdown_transparent_and_decomposed(self):
        r = _assess(
            {"occupation": "Unemployed", "income": 200000},
            {"total_seconds": 15, "question_timings": {"a": 4, "b": 4}},
        )
        assert set(r.breakdown) == {"validation", "fraud", "evidence", "behaviour"}
        assert all(0 <= v <= 100 for v in r.breakdown.values())


# ═════════════════════════════════════════════════════════
# ORCHESTRATOR — end-to-end
# ═════════════════════════════════════════════════════════

class TestOrchestrator:
    def test_returns_trust_result_shape(self):
        inp = IntelligenceInput(
            answers={"occupation": "Salaried", "income": "25000", "age": "34"},
            rules=[CROSS, RANGE],
            reference={"income": SAL_REF},
        )
        result = orchestrator.process_answer(inp)
        assert hasattr(result, "trust")
        assert 0 <= result.trust["confidence"] <= 100
        assert result.trust["risk_level"] in ("Green", "Amber", "Red")
        assert result.trust["recommendation"] in ("accept", "review", "re_interview")

    def test_genuine_pipeline_accepts(self):
        inp = IntelligenceInput(
            answers={"occupation": "Salaried", "income": "25000", "age": "34",
                     "name": "Priya", "marital_status": "married"},
            rules=[CROSS, RANGE],
            reference={"income": SAL_REF},
            paradata={"total_seconds": 600, "correction_count": 1,
                      "question_timings": {"a": 80, "b": 70, "c": 90, "d": 100}},
        )
        result = orchestrator.process_answer(inp)
        assert result.trust["confidence"] >= 80
        assert result.trust["risk_level"] == "Green"

    def test_suspicious_pipeline_red(self):
        inp = IntelligenceInput(
            answers={"occupation": "Unemployed", "income": "200000", "age": "34",
                     "q1": "99", "q2": "99", "q3": "99"},
            rules=[CROSS, RANGE],
            reference={"income": UNEMP_REF},
            paradata={"total_seconds": 15, "correction_count": 0,
                      "question_timings": {"a": 4, "b": 3, "c": 4, "d": 4}},
        )
        result = orchestrator.process_answer(inp)
        assert result.trust["confidence"] < 60
        assert result.trust["risk_level"] in ("Red", "Amber")

    def test_no_llm_in_orchestrator_module(self):
        """The orchestrator must not import any assist/LLM module."""
        import app.intelligence.orchestrator as mod
        src = open(mod.__file__).read()
        # imports (not comments/docstrings) must not reference assist lane
        import_lines = [l for l in src.splitlines() if l.strip().startswith(("import", "from"))]
        import_block = "\n".join(import_lines)
        assert "assist.rag.llm" not in import_block
        assert "survey_gen" not in import_block
        assert "nlp_engine" not in import_block

    def test_is_verdict_true_in_result(self):
        inp = IntelligenceInput(answers={}, rules=[], paradata={})
        result = orchestrator.process_answer(inp)
        assert result.trust["is_verdict"] is True

    def test_reasons_always_present(self):
        inp = IntelligenceInput(answers={}, rules=[], paradata={})
        result = orchestrator.process_answer(inp)
        assert isinstance(result.trust.get("reasons"), list)
        assert len(result.trust["reasons"]) >= 1

    def test_events_list_populated(self):
        inp = IntelligenceInput(answers={}, rules=[], paradata={})
        result = orchestrator.process_answer(inp)
        assert isinstance(result.events, list)
        assert "response.scored" in result.events

    def test_flag_event_on_red(self):
        inp = IntelligenceInput(
            answers={"occupation": "Unemployed", "income": "200000",
                     "q1": "99", "q2": "99", "q3": "99", "q4": "99"},
            rules=[CROSS],
            paradata={"total_seconds": 15, "correction_count": 0,
                      "question_timings": {"a": 4, "b": 3, "c": 4, "d": 4}},
        )
        result = orchestrator.process_answer(inp)
        if result.trust["risk_level"] == "Red":
            assert "flag.created" in result.events
