"""
Engine I/O dataclasses shared across the full intelligence pipeline.
Changing field names here is a breaking change — update all engines together.

These are the contracts between the orchestrator and each sub-engine.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ── Shared enums ──────────────────────────────────────────────────────────────

class Status(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


class Verdict(str, Enum):
    """Kept for backward-compat / Phase 14 API schemas.
    The live verdict is produced by trust_engine.TrustResult (risk_level Green/Amber/Red)."""
    ACCEPT = "ACCEPT"
    REVIEW = "REVIEW"
    REJECT = "REJECT"


class Severity(str, Enum):
    INFO    = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


# ── Rule + Bayesian + Behaviour shared output ─────────────────────────────────

@dataclass
class CheckResult:
    """One check result from any verdict-lane engine."""
    layer: str              # rule | cross_field | context | behaviour | logic
    field: str | None
    status: Status
    severity: str           # error | warning
    reason: str             # EXPLAINABILITY — always populated
    recommended_action: str | None = None

    def as_dict(self) -> dict:
        return {
            "layer": self.layer,
            "field": self.field,
            "status": self.status.value,
            "severity": self.severity,
            "reason": self.reason,
            "recommended_action": self.recommended_action,
        }


# ── Bayesian engine output ────────────────────────────────────────────────────

@dataclass
class BayesianResult:
    field: str
    value: float
    posterior_anomaly: float   # P(anomaly | value), 0..1
    percentile: float          # where value sits in the genuine distribution
    stratum: str
    reason: str                # plain-language, always stored


# ── Behaviour engine output ───────────────────────────────────────────────────

@dataclass
class BehaviourSignal:
    """Legacy single-signal dataclass — kept for Bayesian engine compatibility."""
    signal: str        # speed_anomaly | straight_line | correction_flood | gps_drift | low_effort
    value: float       # raw metric that triggered the signal
    flag: bool         # True = suspicious
    reason: str        # plain-language


# BehaviourSignals (rich Phase 8 output) is defined in behaviour_engine.py
# to avoid a circular import.  Import it from there.


# ── Trust engine (aggregator) output ─────────────────────────────────────────
# Phase 8: TrustResult is defined in trust_engine.py (carries as_dict + is_verdict).
# The dataclasses below are kept for the orchestrator's type annotations.

@dataclass
class TrustComponents:
    validation_score: float    # 0–100  (from rule engine)
    fraud_score: float         # 0–100  (from Bayesian engine)
    evidence_score: float      # 0–100  (from completeness / coding confidence)
    behaviour_score: float     # 0–100  (from paradata signals)


@dataclass
class TrustResult:
    """
    Lightweight TrustResult used by the orchestrator when the full
    trust_engine.TrustResult is not available.
    Phase 8: orchestrator uses trust_engine.TrustResult directly.
    """
    response_id: str
    score: float               # 0–100 weighted aggregate
    verdict: Verdict
    components: TrustComponents
    reasons: list[str] = field(default_factory=list)   # plain-language, stored


# ── Shared pipeline context ───────────────────────────────────────────────────

@dataclass
class ValidationContext:
    """
    Everything the verdict engines need, passed in — no DB calls inside any engine.
    The service layer loads validation_rules + reference_distributions from Postgres
    and constructs this context before calling the engines.
    """
    answers: dict                                       # {qid: value}
    rules: list[dict]                                   # from validation_rules table
    reference: dict = field(default_factory=dict)       # {key: {p05, median, p95, params}}
    paradata: dict = field(default_factory=dict)        # timings, corrections, GPS, etc.


# ── Coding engine output ──────────────────────────────────────────────────────

@dataclass
class CodingResult:
    field: str
    raw_text: str
    code: str | None           # NIC code assigned; None = needs human
    confidence: float          # 0–100
    source: str                # "rag_retrieval" | "nic_api" | "human"
    reason: str
    human_review_required: bool = False


# ── Adaptive engine output ────────────────────────────────────────────────────

@dataclass
class AdaptiveDecision:
    question_id: str
    show: bool
    reason: str


# ── NLP extraction output ────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    field: str
    value: str
    confidence: float
    model_version: str
