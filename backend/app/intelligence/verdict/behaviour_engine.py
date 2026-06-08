"""
Behaviour engine — paradata → engagement/fatigue/fraud signals.  Verdict lane.

Output: BehaviourSignals (rich summary) + list[CheckResult] (slots into pipeline).
Every fraud signal carries a reason with the actual numbers.

Signals:
  speeding              — avg time far below plausible minimum
  straight_lining       — identical answers across all questions
  no_correction_speed   — fast + zero corrections (fabrication tell)
  correction_flood      — edit count far above normal
  gps_drift             — GPS inconsistent with assignment area
  low_effort            — critical open-text fields very short

Thresholds are documented constants — tune them in config/data, never in
engine logic.  To hit a target score, adjust the weight or threshold, not the
formula.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.intelligence.schemas import CheckResult, Status

# ── Documented thresholds ─────────────────────────────────────────────────────
MEDIAN_SECONDS_PER_Q = 90.0    # realistic median interview pace
SPEED_HARD_THRESHOLD = 0.15    # avg_t / median < this → "speeding" (FAIL)
SPEED_SOFT_THRESHOLD = 0.30    # + 0 corrections → "no_correction_speed" (WARN)
MAX_CORRECTIONS      = 15      # above this → correction_flood (WARN)
GPS_DRIFT_KM         = 5.0     # haversine from expected centroid → WARN
MIN_OPEN_TEXT_LEN    = 3       # shorter than this → low_effort (WARN)
STRAIGHT_LINE_MIN_Q  = 4       # minimum answers needed to detect straight-lining


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@dataclass
class BehaviourSignals:
    """
    Rich paradata summary — stored in trust_scores.breakdown["behaviour_detail"].
    Every score is independently interpretable.
    Every fraud signal has a reason with actual numbers.
    """
    engagement:    float        # 0..100  (lower = rushed / disengaged)
    fatigue:       float        # 0..100  (higher = more pauses / slowdown)
    dropout_risk:  float        # 0..100  (higher = more back-navigation)
    quality:       float        # 0..100  (overall paradata quality indicator)
    fraud_signals: list = field(default_factory=list)   # [{type, reason}]
    fraud_score:   float = 0.0  # 0..100  (higher = more suspicious)


class BehaviourEngine:
    """
    Deterministic paradata analyser.
    Instantiate once (singleton at app level); call .run() per response.
    """

    def __init__(self, median_seconds: float = MEDIAN_SECONDS_PER_Q):
        self.median = median_seconds

    def run(
        self,
        paradata: dict,
        answers: dict,
        expected_lat: float | None = None,
        expected_lon: float | None = None,
        n_questions: int | None = None,
    ) -> tuple[BehaviourSignals, list[CheckResult]]:
        pd       = paradata or {}
        timings  = pd.get("question_timings") or {}
        n_ans    = max(len(answers), 1)
        nq       = n_questions or n_ans

        # Average seconds per question
        if timings:
            avg_t = sum(timings.values()) / len(timings)
        elif pd.get("total_seconds"):
            avg_t = pd["total_seconds"] / nq
        else:
            avg_t = self.median

        corrections  = pd.get("correction_count", 0) or 0
        backs        = pd.get("back_nav_count", 0) or 0
        pauses       = pd.get("pauses", 0) or 0
        speed_ratio  = avg_t / self.median if self.median else 1.0

        fraud_signals: list[dict]    = []
        checks:        list[CheckResult] = []

        # 1. Speeding
        if speed_ratio < SPEED_HARD_THRESHOLD:
            reason = (
                f"answered in {avg_t:.0f}s vs ~{self.median:.0f}s median "
                f"({speed_ratio * 100:.0f}% of expected pace)"
            )
            fraud_signals.append({"type": "speeding", "reason": reason})
            checks.append(CheckResult("behaviour", "speed", Status.FAIL,
                                      "error", reason, "re_interview"))

        # 2. Straight-lining
        vals = [str(v) for v in answers.values()]
        if len(vals) >= STRAIGHT_LINE_MIN_Q and len(set(vals)) == 1:
            reason = f"identical answer across all {len(vals)} questions (straight-lining)"
            fraud_signals.append({"type": "straight_lining", "reason": reason})
            checks.append(CheckResult("behaviour", "straight_line", Status.FAIL,
                                      "error", reason, "re_interview"))

        # 3. Zero-correction speed combo
        if speed_ratio < SPEED_SOFT_THRESHOLD and corrections == 0 and n_ans >= STRAIGHT_LINE_MIN_Q:
            reason = (
                f"no corrections across {n_ans} answers at "
                f"{speed_ratio * 100:.0f}% of expected pace"
            )
            fraud_signals.append({"type": "no_correction_speed", "reason": reason})
            checks.append(CheckResult("behaviour", "no_correction_speed", Status.WARN,
                                      "warning", reason, "review"))

        # 4. Correction flood
        if corrections > MAX_CORRECTIONS:
            reason = (
                f"{corrections} corrections recorded "
                f"(threshold {MAX_CORRECTIONS} — possible coaching or tampering)"
            )
            fraud_signals.append({"type": "correction_flood", "reason": reason})
            checks.append(CheckResult("behaviour", "correction_flood", Status.WARN,
                                      "warning", reason, "review"))

        # 5. GPS drift
        gps_lat = pd.get("gps_lat")
        gps_lon = pd.get("gps_lng")
        if (gps_lat is not None and gps_lon is not None
                and expected_lat is not None and expected_lon is not None):
            dist_km = _haversine_km(gps_lat, gps_lon, expected_lat, expected_lon)
            if dist_km > GPS_DRIFT_KM:
                reason = (
                    f"GPS {dist_km:.1f} km from expected assignment area "
                    f"(threshold {GPS_DRIFT_KM} km)"
                )
                fraud_signals.append({"type": "gps_drift", "reason": reason})
                checks.append(CheckResult("behaviour", "gps_drift", Status.WARN,
                                          "warning", reason, "review"))

        # 6. Low effort
        short = [
            k for k, v in answers.items()
            if isinstance(v, str) and 0 < len(v.strip()) < MIN_OPEN_TEXT_LEN
        ]
        if short:
            reason = (
                f"{len(short)} open-text field(s) have very short answers "
                f"({', '.join(short[:3])})"
            )
            fraud_signals.append({"type": "low_effort", "reason": reason})
            checks.append(CheckResult("behaviour", "low_effort", Status.WARN,
                                      "warning", reason, "review"))

        # Derived scores
        engagement   = _clamp(100 - max(0, (0.5 - speed_ratio)) * 160)
        fatigue      = _clamp(pauses * 8 + max(0, (speed_ratio - 1.5)) * 30)
        dropout_risk = _clamp(backs * 12 + pauses * 6)
        fraud_score  = _clamp(
            (40 if any(s["type"] == "speeding"              for s in fraud_signals) else 0)
            + (45 if any(s["type"] == "straight_lining"     for s in fraud_signals) else 0)
            + (20 if any(s["type"] == "no_correction_speed" for s in fraud_signals) else 0)
            + (10 if any(s["type"] == "correction_flood"    for s in fraud_signals) else 0)
            + (10 if any(s["type"] == "gps_drift"           for s in fraud_signals) else 0)
            + (5  if any(s["type"] == "low_effort"          for s in fraud_signals) else 0)
        )
        quality = _clamp(100 - fraud_score - max(0, fatigue - 60) * 0.5)

        return (
            BehaviourSignals(
                engagement=round(engagement),
                fatigue=round(fatigue),
                dropout_risk=round(dropout_risk),
                quality=round(quality),
                fraud_signals=fraud_signals,
                fraud_score=round(fraud_score),
            ),
            checks,
        )
