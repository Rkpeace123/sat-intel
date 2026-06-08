"""
Collection service — wires the orchestrator to Postgres.

score_response():
  1. Load validation_rules + reference_distributions for the survey
  2. Build IntelligenceInput
  3. Call orchestrator.process_answer()
  4. Persist TrustScore + ValidationResult rows
  5. Update response.status / trust_level
  6. Return IntelligenceOutput-shaped dict (events list included for route to publish)
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.intelligence.orchestrator import IntelligenceInput, orchestrator
from app.models.intelligence import TrustScore, ValidationResult
from app.models.knowledge import ReferenceDistribution
from app.models.survey import ValidationRule
from app.models.response import Paradata, Response


async def score_response(
    db: AsyncSession,
    response: Response,
    paradata_dict: dict,
    enumerator_ctx: dict | None = None,
) -> dict:
    """
    Run the full verdict pipeline for a response and persist results.
    Returns the IntelligenceOutput as a dict (events included for the route to publish).
    """
    survey_id = response.survey_id

    # 1. Load validation rules for this survey
    rules_rows = (
        await db.execute(
            select(ValidationRule).where(ValidationRule.survey_id == survey_id)
        )
    ).scalars().all()
    rules = [
        {
            "rule_type":       r.rule_type,
            "field":           r.field,
            "params":          r.params,
            "severity":        r.severity,
            "reason_template": r.reason_template,
        }
        for r in rules_rows
    ]

    # 2. Load reference distributions (priors for Bayesian engine)
    ref_rows = (await db.execute(select(ReferenceDistribution))).scalars().all()
    reference: dict = {}
    for r in ref_rows:
        reference[r.key] = {
            "stratum": r.stratum,
            "p05":     r.p05,
            "median":  r.median,
            "p95":     r.p95,
            "params":  r.params or {},
        }

    # 3. Identify numeric fields for Bayesian scoring
    answers = response.answers or {}
    numeric_fields = [k for k, v in answers.items() if _is_numeric(v)]

    # 4. Build input and run pipeline
    inp = IntelligenceInput(
        answers=answers,
        rules=rules,
        reference=reference,
        paradata=paradata_dict,
        numeric_fields=numeric_fields,
        evidence_present=True,
        enumerator=enumerator_ctx,
    )
    out = orchestrator.process_answer(inp)

    # 5. Persist TrustScore
    trust_row = TrustScore(
        id=uuid.uuid4(),
        response_id=response.id,
        confidence=out.trust["confidence"],
        risk_level=out.trust["risk_level"],
        breakdown=out.trust["breakdown"],
        fraud_signals=out.trust["fraud_signals"],
        recommendation=out.trust["recommendation"],
    )
    db.add(trust_row)

    # 6. Persist ValidationResults (one row per check that failed/warned)
    for check in out.validation:
        if check["status"] in ("fail", "warn"):
            vr = ValidationResult(
                id=uuid.uuid4(),
                response_id=response.id,
                layer=check["layer"],
                field=check.get("field"),
                status=check["status"],
                severity=check["severity"],
                reason=check["reason"],
                recommended_action=check.get("recommended_action"),
            )
            db.add(vr)

    # 7. Update response status and trust level
    response.confidence_score = out.trust["confidence"]
    response.trust_level      = out.trust["risk_level"]
    response.status           = (
        "approved" if out.trust["risk_level"] == "Green"
        else "flagged" if out.trust["risk_level"] == "Red"
        else "captured"
    )

    await db.commit()
    return {
        "trust":       out.trust,
        "validation":  out.validation,
        "behaviour":   out.behaviour,
        "adaptive":    out.adaptive,
        "events":      out.events,
        "enumerator":  out.enumerator_update,
    }


def _is_numeric(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False
