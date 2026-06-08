"""
Intelligence pipeline orchestrator — single entry point for every response.

Order is fixed and documented:
  1. behaviour signals from paradata
  2. adaptive decision (rules, no LLM)
  3. rule + bayesian + behaviour validation → CheckResults
  4. trust aggregation (THE verdict — fully explained, is_verdict: True)
  5. enumerator roll-up (moving-average badge)
  6. events list (Phase 13 publishes these)

The assist lane (coding/RAG/Gemma) is invoked elsewhere for suggestions and
never feeds this verdict.  Engines are I/O-free; persistence happens in the
service layer that calls this.

CONTRACT: no LLM / RAG / Gemma import in this file or anything it calls.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.intelligence.schemas import CheckResult, ValidationContext
from app.intelligence.adaptive.adaptive_engine import AdaptiveEngine
from app.intelligence.verdict.bayesian_engine  import BayesianEngine
from app.intelligence.verdict.behaviour_engine import BehaviourEngine, BehaviourSignals
from app.intelligence.verdict.rule_engine      import RuleEngine
from app.intelligence.verdict.trust_engine     import TrustEngine, roll_up_enumerator

logger = logging.getLogger(__name__)


@dataclass
class IntelligenceInput:
    answers:          dict
    rules:            list[dict]
    reference:        dict  = field(default_factory=dict)
    paradata:         dict  = field(default_factory=dict)
    numeric_fields:   list  = field(default_factory=list)   # fields the Bayesian layer scores
    evidence_present: bool  = True
    enumerator:       dict | None = None                    # {score, trend, level} for roll-up
    adaptive_logic:   list  = field(default_factory=list)   # rows from adaptive_logic table
    last_qid:         str | None = None                     # last answered question id


@dataclass
class IntelligenceOutput:
    validation:        list         # [CheckResult.as_dict()]
    behaviour:         dict         # BehaviourSignals summary
    trust:             dict         # TrustResult.as_dict()  (is_verdict: True)
    adaptive:          dict         # next-question decision (+ reason)
    enumerator_update: dict | None  # {score, level, trend} after roll-up
    events:            list         # event names to publish (Phase 13)


class IntelligenceOrchestrator:
    """
    Stateless pipeline runner.
    Instantiate once at app startup; call .process_answer() per response.
    """

    def __init__(self, median_seconds: float = 90.0):
        self.rules    = RuleEngine()
        self.bayes    = BayesianEngine()
        self.behaviour = BehaviourEngine(median_seconds=median_seconds)
        self.trust    = TrustEngine()
        self.adaptive = AdaptiveEngine()

    def process_answer(self, inp: IntelligenceInput) -> IntelligenceOutput:
        ctx = ValidationContext(
            answers=inp.answers,
            rules=inp.rules,
            reference=inp.reference,
            paradata=inp.paradata,
        )

        # 1. Behaviour signals from paradata
        signals, behaviour_checks = self.behaviour.run(
            paradata=inp.paradata,
            answers=inp.answers,
        )

        # 2. Adaptive decision (rules; uses behaviour, never an LLM)
        adaptive_decision = self.adaptive.decide(
            ctx, signals,
            adaptive_logic=inp.adaptive_logic,
            last_qid=inp.last_qid,
        )

        # 3. Validation — rule layer + Bayesian layer
        rule_checks:  list[CheckResult] = self.rules.run(ctx)
        bayes_checks, _bayes_detail     = self.bayes.run(ctx, inp.numeric_fields)
        validation = rule_checks + bayes_checks + behaviour_checks

        # 4. Trust aggregation (THE verdict — fully explained)
        trust = self.trust.aggregate(validation, signals, inp.evidence_present)

        # 5. Enumerator roll-up
        enum_update = None
        if inp.enumerator:
            score, level, trend = roll_up_enumerator(
                inp.enumerator.get("score", 100.0),
                inp.enumerator.get("trend", []),
                trust.confidence,
            )
            enum_update = {"score": score, "level": level, "trend": trend}

        # 6. Events to emit
        events = ["response.scored"]
        if trust.risk_level == "Red":
            events.append("flag.created")
        if enum_update and enum_update["level"] != inp.enumerator.get("level"):
            events.append("trust.updated")

        logger.info(
            "verdict confidence=%.1f risk=%s events=%s",
            trust.confidence, trust.risk_level, events,
        )

        return IntelligenceOutput(
            validation=[c.as_dict() for c in validation],
            behaviour={
                "engagement":    signals.engagement,
                "fatigue":       signals.fatigue,
                "dropout_risk":  signals.dropout_risk,
                "quality":       signals.quality,
                "fraud_score":   signals.fraud_score,
                "fraud_signals": signals.fraud_signals,
            },
            trust=trust.as_dict(),
            adaptive=adaptive_decision,
            enumerator_update=enum_update,
            events=events,
        )


# Module-level singleton — imported by collection_service and API routes
orchestrator = IntelligenceOrchestrator()
