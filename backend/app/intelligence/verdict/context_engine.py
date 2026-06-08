"""
Context engine — occupation → NIC sector lookup.

CSV-backed plausibility matrix (occupation × income_band × age_band).
No DB round-trip in the hot path; the lookup table is loaded once at import.

Replaces Neo4j for demo scale.  Extend via the CSV in data/seed/.
"""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

# ── Inline plausibility matrix (demo seed; extended via CSV) ──────────────────
# Maps (occupation_group, income_band, age_band) → plausible: bool
_PLAUSIBILITY: dict[tuple[str, str, str], bool] = {
    # occupation_group, income_band,  age_band
    ("student",      "zero",   "teen"):   True,
    ("student",      "low",    "teen"):   True,
    ("student",      "high",   "teen"):   False,  # student + high income + teen → suspicious
    ("unemployed",   "zero",   "adult"):  True,
    ("unemployed",   "low",    "adult"):  True,
    ("unemployed",   "high",   "adult"):  False,  # unemployed + high income → contradicts
    ("salaried",     "mid",    "adult"):  True,
    ("salaried",     "high",   "adult"):  True,
    ("salaried",     "zero",   "adult"):  False,
    ("self_employed","mid",    "adult"):  True,
    ("self_employed","high",   "adult"):  True,
    ("retired",      "low",    "senior"): True,
    ("retired",      "mid",    "senior"): True,
    ("retired",      "high",   "senior"): True,
    ("retired",      "low",    "adult"):  True,
}

# NIC sector lookup: occupation keyword → sector label
_NIC_SECTORS: dict[str, str] = {
    "farmer": "Agriculture, forestry and fishing",
    "agriculture": "Agriculture, forestry and fishing",
    "teacher": "Education",
    "doctor": "Human health and social work activities",
    "nurse": "Human health and social work activities",
    "engineer": "Professional, scientific and technical activities",
    "software": "Information and communication",
    "it": "Information and communication",
    "driver": "Transportation and storage",
    "auto": "Transportation and storage",
    "trader": "Wholesale and retail trade",
    "retail": "Wholesale and retail trade",
    "construction": "Construction",
    "factory": "Manufacturing",
    "garment": "Manufacturing",
    "textile": "Manufacturing",
    "domestic": "Activities of households as employers",
    "cook": "Accommodation and food service activities",
    "restaurant": "Accommodation and food service activities",
    "government": "Public administration and defence",
    "police": "Public administration and defence",
    "military": "Public administration and defence",
    "student": "Education",
    "unemployed": "(Not in labour force)",
    "retired": "(Not in labour force)",
    "homemaker": "(Not in labour force)",
}


def _income_band(income: float | None) -> str:
    if income is None:
        return "unknown"
    if income <= 0:
        return "zero"
    if income < 10_000:
        return "low"
    if income < 50_000:
        return "mid"
    return "high"


def _age_band(age: float | None) -> str:
    if age is None:
        return "unknown"
    if age < 18:
        return "teen"
    if age < 60:
        return "adult"
    return "senior"


def _occ_group(occupation: str) -> str:
    occ = (occupation or "").lower()
    if any(k in occ for k in ("student", "studying")):
        return "student"
    if any(k in occ for k in ("unemployed", "no work", "jobless")):
        return "unemployed"
    if any(k in occ for k in ("retired", "pension")):
        return "retired"
    if any(k in occ for k in ("salary", "salaried", "job", "employee", "service")):
        return "salaried"
    if any(k in occ for k in ("self", "own business", "freelance", "daily wage")):
        return "self_employed"
    return "other"


def sector_for(occupation_text: str) -> str:
    """Return the NIC sector label for an occupation text (keyword match)."""
    text = occupation_text.lower()
    for kw, sector in _NIC_SECTORS.items():
        if kw in text:
            return sector
    return "Not elsewhere classified"


def plausibility_check(
    occupation: str,
    income: float | None,
    age: float | None,
) -> dict:
    """
    Return {plausible: bool, reason: str}.
    Used by the rule engine context checks and orchestrator.
    """
    occ_grp    = _occ_group(occupation)
    inc_band   = _income_band(income)
    age_band_v = _age_band(age)

    key = (occ_grp, inc_band, age_band_v)
    plausible = _PLAUSIBILITY.get(key, True)  # default True (unknown combos are not flagged)

    if not plausible:
        reason = (
            f"occupation={occupation!r} (group={occ_grp}) with "
            f"income_band={inc_band}, age_band={age_band_v} is implausible"
        )
    else:
        reason = (
            f"occupation={occupation!r}, income_band={inc_band}, "
            f"age_band={age_band_v} — plausible"
        )

    return {"plausible": plausible, "reason": reason,
            "occ_group": occ_grp, "income_band": inc_band, "age_band": age_band_v}
