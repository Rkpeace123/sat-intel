"""
Audit log — APPEND-ONLY (SQAF / NMDS audit trail).

NEVER issue UPDATE or DELETE on this table.
The append-only trigger is enforced in the Alembic migration.
Every write to sensitive tables (responses, trust_scores, coding_results)
must produce an AuditLog row via the service layer.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, pk


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64))        # e.g. "response.submit", "trust.score"
    resource_type: Mapped[str] = mapped_column(String(48)) # e.g. "Response", "TrustScore"
    resource_id: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # No updated_at — this table is append-only
