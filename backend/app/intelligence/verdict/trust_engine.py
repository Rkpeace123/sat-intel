"""
Trust aggregator — verdict lane complete.

Transparent weighted aggregation over four independently interpretable components.
NO model.  The confidence is a documented formula; the breakdown is shown to the
officer in full.  `is_verdict: True` appears only here — where every number is
explained.

Weights (from settings.trust_weights, locked in config):
  validation  0.40  — rule + cross-field + logic + Bayesian checks
  fraud       0.30  — behaviour fraud signals
  evidence    0.15  — completeness / answer coverage
  behaviour   0.15  — paradata quality score

Verdict bands:
  confidence ≥ 80  → Green  / accept
  confidence ≥ 50  → Amber  / review
  confidence < 50  → Red    / re_interview

Enumerator roll-up:
  Moving average over the last `window` responses gives the enumerator's
  trust badge.  A fabricating enumerator's badge visibly drops in real time.
"""
from __future__ import annotations

from app.config import settings
from app.intelligence.schemas import CheckResult, Status
from app.intelligence.verdict.behaviour_engine import BehaviourSignals

# ── Verdict band thresholds ───────────────────────────────────────────────────
GREEN_THRESHOLD = 80.0
AMBER_THRESHOLD = 50.0


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


class TrustResult:
    """
    Final verdict output — stored as a trust_scores row.
    as_dict() is the wire format for API responses.
    is_verdict=True only here: this is the only place a decision is made,
    and it is fully explained.
    """

    def __init__(
        self,
        confidence: float,
        risk_level: str,
        breakdown: dict,
        fraud_signals: list,
        recommendation: str,
        reasons: list[str],
    ):
        self.confidence     = round(confidence, 1)
        self.risk_level     = risk_level
        self.breakdown      = breakdown
        self.fraud_signals  = fraud_signals
        self.recommendation = recommendation
        self.reasons        = reasons[:8]   # cap for DB sanity

    def as_dict(self) -> dict:
        return {
            "confidence":     self.confidence,
            "risk_level":     self.risk_level,
            "breakdown":      self.breakdown,
            "fraud_signals":  self.fraud_signals,
            "recommendation": self.recommendation,
            "reasons":        self.reasons,
            "is_verdict":     True,
        }


class TrustEngine:
    """
    Stateless aggregator.
    Instantiate once (singleton); call .aggregate() per response.
    """

    def __init__(self):
        self.w = settings.trust_weights

    def aggregate(
        self,
        validation: list[CheckResult],
        behaviour: BehaviourSignals,
        evidence_present: bool = True,
    ) -> TrustResult:
        """
        Combine all verdict-lane outputs into a single TrustResult.

        validation      : rule + Bayesian + behaviour CheckResults combined
        behaviour       : BehaviourSignals from BehaviourEngine.run()
        evidence_present: False when key corroborating documents are absent
        """
        errors = [c for c in validation
                  if c.status is Status.FAIL and c.severity == "error"]
        warns  = [c for c in validation if c.status is Status.WARN]
        total  = max(len(validation), 1)

        # Component sub-scores — each 0..100, independently interpretable
        raw_val          = 100 * (1 - (len(errors) + 0.4 * len(warns)) / total)
        validation_score = _clamp(raw_val)
        fraud_component  = _clamp(100 - behaviour.fraud_score)
        evidence_score   = 100.0 if evidence_present else 70.0
        behaviour_score  = _clamp(float(behaviour.quality))

        confidence = (
            self.w["validation"] * validation_score
            + self.w["fraud"]    * fraud_component
            + self.w["evidence"] * evidence_score
            + self.w["behaviour"] * behaviour_score
        )

        risk = ("Green" if confidence >= GREEN_THRESHOLD else
                "Amber" if confidence >= AMBER_THRESHOLD else "Red")
        rec  = ("accept"       if risk == "Green" else
                "review"       if risk == "Amber" else "re_interview")

        reasons = (
            [c.reason for c in errors + warns]
            + [s["reason"] for s in behaviour.fraud_signals]
        )
        if not reasons:
            reasons = ["All checks passed — no anomalies detected"]

        return TrustResult(
            confidence=confidence,
            risk_level=risk,
            breakdown={
                "validation": round(validation_score),
                "fraud":      round(fraud_component),
                "evidence":   round(evidence_score),
                "behaviour":  round(behaviour_score),
            },
            fraud_signals=behaviour.fraud_signals,
            recommendation=rec,
            reasons=reasons,
        )


# ── Enumerator trust roll-up ──────────────────────────────────────────────────

def roll_up_enumerator(
    prev_score: float,
    prev_trend: list[float],
    new_confidence: float,
    window: int = 7,
) -> tuple[float, str, list[float]]:
    """
    Moving-average trust badge for an enumerator.

    A fabricating enumerator accumulates low-confidence responses;
    the badge visibly drops in real time on the dashboard.

    Returns (score, level, trend_window).
    """
    trend = (prev_trend + [round(new_confidence, 1)])[-window:]
    score = round(sum(trend) / len(trend), 1)
    level = ("Green" if score >= GREEN_THRESHOLD else
             "Amber" if score >= AMBER_THRESHOLD else "Red")
    return score, level, trend
