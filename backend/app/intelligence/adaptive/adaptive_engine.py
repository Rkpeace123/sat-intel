"""
Adaptive question engine — rules only, no model in the path.

Decides the next action for the survey flow based on structured answers
and behaviour signals:
  BRANCH   — structured answer routes to a sub-module (highest priority)
  SKIP     — answer makes next question not applicable
  REORDER  — high dropout risk: move easy block up to retain respondent
  SIMPLIFY — high fatigue: present plainer wording
  ASK      — default: proceed normally

Every decision carries a plain-language reason with the actual trigger value
or score.  A statistician can read exactly why a question was simplified,
skipped, or branched without trusting a black box.

Thresholds are documented constants — tune them in config/data.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.intelligence.schemas import ValidationContext
from app.intelligence.verdict.behaviour_engine import BehaviourSignals

# ── Configurable thresholds ───────────────────────────────────────────────────
FATIGUE_SIMPLIFY  = 60   # behaviour.fatigue >= this → SIMPLIFY
DROPOUT_REORDER   = 70   # behaviour.dropout_risk >= this → REORDER


@dataclass
class AdaptiveDecision:
    action: str          # ASK | SIMPLIFY | SKIP | REORDER | BRANCH
    target: str | None   # next question id or branch key
    reason: str          # explainability — always populated
    params: dict         # e.g. {"simplified_text": ...} or {"branch": "Student"}

    def as_dict(self) -> dict:
        return {
            "action": self.action,
            "target": self.target,
            "reason": self.reason,
            "params": self.params,
        }


class AdaptiveEngine:
    """
    Rules-only next-step logic.
    Instantiate once; call .decide() per question transition.

    Priority order (fixed, documented):
      1. BRANCH   — explicit branch rule triggered
      2. SKIP     — explicit skip rule triggered
      3. REORDER  — dropout_risk >= threshold
      4. SIMPLIFY — fatigue >= threshold
      5. ASK      — default
    """

    def decide(
        self,
        ctx: ValidationContext,
        signals: BehaviourSignals,
        adaptive_logic: list[dict] | None = None,
        last_qid: str | None = None,
    ) -> dict:
        """
        Returns an AdaptiveDecision.as_dict().

        adaptive_logic: rows from the adaptive_logic table for the current survey.
                        Shape: [{action, trigger:{field,value}, target:{qid,branch?}}]
        """
        logic = adaptive_logic or []

        # 1. BRANCH — structured answer routes to a sub-module
        for rule in logic:
            if rule.get("action") == "BRANCH":
                trig = rule.get("trigger", {})
                if str(ctx.answers.get(trig.get("field"))) == str(trig.get("value")):
                    return AdaptiveDecision(
                        action="BRANCH",
                        target=rule["target"].get("qid"),
                        reason=(
                            f"branched to '{rule['target'].get('branch')}' because "
                            f"{trig.get('field')}={ctx.answers.get(trig.get('field'))!r}"
                        ),
                        params={"branch": rule["target"].get("branch")},
                    ).as_dict()

        # 2. SKIP — answer makes next question not applicable
        for rule in logic:
            if rule.get("action") == "SKIP":
                trig = rule.get("trigger", {})
                if str(ctx.answers.get(trig.get("field"))) == str(trig.get("value")):
                    return AdaptiveDecision(
                        action="SKIP",
                        target=rule["target"].get("qid"),
                        reason=(
                            f"skipped {rule['target'].get('qid')} because "
                            f"{trig.get('field')}={ctx.answers.get(trig.get('field'))!r} "
                            f"makes it not applicable"
                        ),
                        params={},
                    ).as_dict()

        # 3. REORDER — high dropout risk
        if signals.dropout_risk >= DROPOUT_REORDER:
            return AdaptiveDecision(
                action="REORDER",
                target=None,
                reason=(
                    f"reordered to a shorter block because dropout risk "
                    f"reached {signals.dropout_risk}"
                ),
                params={"strategy": "front-load short questions"},
            ).as_dict()

        # 4. SIMPLIFY — fatigue high
        if signals.fatigue >= FATIGUE_SIMPLIFY:
            return AdaptiveDecision(
                action="SIMPLIFY",
                target=last_qid,
                reason=(
                    f"simplified wording because fatigue score reached {signals.fatigue}"
                ),
                params={"mode": "plain_language"},
            ).as_dict()

        # 5. ASK — default
        return AdaptiveDecision(
            action="ASK",
            target=None,
            reason="proceeding to next question (engagement normal)",
            params={},
        ).as_dict()
