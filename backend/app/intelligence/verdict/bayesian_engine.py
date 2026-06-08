"""
Bayesian anomaly engine — verdict lane.

Computes per-field posterior anomaly probability against seeded reference
distributions (from reference_distributions table).  Fully deterministic,
no model, no training — priors are plain numbers stored in Postgres.

Distribution support:
  lognormal  — income, expenditure (right-skewed, HCES/PLFS calibrated)
  normal     — age, household size, crop yield

Output: CheckResult (slots into the pipeline) + BayesianResult (for trust breakdown).

The anomalous-hypothesis likelihood uses a heavy-tailed alternative:
  P(value | anomalous) = blend of broad normal + small constant
This is a documented modeling choice — present as "probabilistic flagging for
human review," not a fraud classification.

Reference distribution params shape (reference_distributions.params):
  {"dist": "lognormal", "mu": 10.24, "sigma": 0.55}
  {"dist": "normal",    "mu": 34.0,  "sigma": 8.5}
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.intelligence.schemas import BayesianResult, CheckResult, Status, ValidationContext

# Base rate of fabrication/error per field.
# Documented, not learned — tunable per survey type.
_PRIOR_ANOMALY = 0.05


def _norm_cdf(x: float, mu: float, sigma: float) -> float:
    if sigma <= 0:
        return 0.5
    return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))


def _norm_pdf(x: float, mu: float, sigma: float) -> float:
    if sigma <= 0:
        return 1e-9
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * math.sqrt(2 * math.pi))


def _to_log_space(value: float, dist: str) -> float | None:
    """Lognormal: work in log space (income/expenditure are right-skewed)."""
    if dist == "lognormal":
        return math.log(value) if value > 0 else None
    return value


class BayesianEngine:
    """
    Per-field posterior anomaly probability against a seeded reference distribution.
    Verdict-lane: deterministic, offline, inspectable.
    Emits a CheckResult (same shape as rule engine) + a BayesianResult for the
    trust breakdown stored in trust_scores.breakdown.
    """

    def __init__(self, prior_anomaly: float = _PRIOR_ANOMALY):
        self.prior = prior_anomaly

    def assess_field(
        self,
        field: str,
        value,
        ref: dict,
    ) -> BayesianResult | None:
        """
        Compute posterior P(anomaly | value) for a single field.
        Returns None for non-numeric input or missing params (graceful degradation).
        """
        try:
            v = float(value)
        except (TypeError, ValueError):
            return None

        params = ref.get("params", {})
        dist   = params.get("dist", "normal")
        mu     = params.get("mu")
        sigma  = params.get("sigma")
        stratum = ref.get("stratum", "all")

        if mu is None or sigma is None:
            return None

        x = _to_log_space(v, dist)
        if x is None:
            return None

        # Percentile of the observed value under the "genuine" distribution
        pct = _norm_cdf(x, mu, sigma)

        # Likelihoods:
        #   genuine    ~ reference distribution
        #   anomalous  ~ heavy-tailed alternative (broad normal + floor)
        like_genuine = _norm_pdf(x, mu, sigma)
        like_anom    = _norm_pdf(x, mu, sigma * 4) * 0.25 + 1e-6

        # Bayes posterior P(anomaly | value)
        num = like_anom * self.prior
        den = num + like_genuine * (1 - self.prior)
        posterior = num / den if den > 0 else 0.0

        pct_label = round(pct * 100, 1)
        median_label = ref.get("median", "?")

        reason = (
            f"{field}={v:g} sits at the {pct_label:g}th percentile for "
            f"{stratum} (median {median_label}); "
            f"posterior anomaly {round(posterior * 100, 1):g}%"
        )

        return BayesianResult(
            field=field,
            value=v,
            posterior_anomaly=round(posterior, 4),
            percentile=round(pct, 4),
            stratum=stratum,
            reason=reason,
        )

    def run(
        self,
        ctx: ValidationContext,
        fields: list[str],
        threshold: float = 0.9,
    ) -> tuple[list[CheckResult], list[BayesianResult]]:
        """
        Assess all requested fields.
        Returns (checks, details) where checks slot into the verdict pipeline
        and details are stored in trust_scores.breakdown.

        threshold: posterior ≥ threshold → FAIL (re_interview)
                   posterior ≥ 0.6       → WARN (review)
                   below 0.6             → PASS
        """
        checks:  list[CheckResult]   = []
        details: list[BayesianResult] = []

        for f in fields:
            ref = ctx.reference.get(f)
            if not ref:
                continue

            res = self.assess_field(f, ctx.answers.get(f), ref)
            if res is None:
                continue

            details.append(res)

            if res.posterior_anomaly >= threshold:
                status   = Status.FAIL
                severity = "error"
                action   = "re_interview"
            elif res.posterior_anomaly >= 0.6:
                status   = Status.WARN
                severity = "warning"
                action   = "review"
            else:
                status   = Status.PASS
                severity = "error"
                action   = None

            checks.append(CheckResult(
                layer="context",
                field=f,
                status=status,
                severity=severity,
                reason=res.reason,
                recommended_action=action,
            ))

        return checks, details
