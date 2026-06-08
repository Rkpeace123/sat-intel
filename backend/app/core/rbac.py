"""
Role-based access control.
Capability matrix and require() FastAPI dependency.
Phase 14 will wire this into every protected route.
"""
from fastapi import Depends, HTTPException, status

# ── Capability matrix ─────────────────────────────────────────────────────────
# Maps permission name → set of roles that hold it.
CAPABILITY_MATRIX: dict[str, set[str]] = {
    "survey:read":        {"admin", "supervisor", "enumerator", "analyst"},
    "survey:write":       {"admin", "supervisor"},
    "survey:publish":     {"admin"},
    "response:submit":    {"enumerator"},
    "response:read":      {"admin", "supervisor", "analyst"},
    "intelligence:read":  {"admin", "supervisor", "analyst"},
    "coding:override":    {"admin", "supervisor"},
    "enumerator:manage":  {"admin", "supervisor"},
    "dashboard:read":     {"admin", "supervisor", "analyst"},
    "analytics:read":     {"admin", "supervisor", "analyst"},
    "rag:ingest":         {"admin"},
    "audit:read":         {"admin"},
}


def require(permission: str):
    """
    FastAPI dependency factory.
    Usage:  router.get("/", dependencies=[Depends(require("survey:read"))])
    Phase 14: replace the stub below with real token extraction.
    """
    def _check(
        # current_user: User = Depends(get_current_user)  # Phase 14
    ):
        # Phase 14 implementation:
        # if permission not in CAPABILITY_MATRIX:
        #     raise HTTPException(status_code=403, detail="Unknown permission")
        # if current_user.role not in CAPABILITY_MATRIX[permission]:
        #     raise HTTPException(status_code=403, detail="Insufficient permissions")
        pass

    return _check
