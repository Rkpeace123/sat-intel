"""
Intelligence output tables.

EXPLAINABILITY CONTRACT (enforced at DB level):
  - validation_results.reason  — NOT NULL
  - coding_results.reason      — NOT NULL
  - trust_scores.breakdown     — NOT NULL (JSONB with per-component scores)

No row may be inserted into these tables without a plain-language reason.
"""
import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, pk


class ValidationResult(Base, TimestampMixin):
    __tablename__ = "validation_results"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responses.id"))
    # rule | cross_field | context | behaviour | logic
    layer: Mapped[str] = mapped_column(String(16))
    field: Mapped[str | None] = mapped_column(String(64))
    # pass | warn | fail
    status: Mapped[str] = mapped_column(String(8))
    # error | warning
    severity: Mapped[str] = mapped_column(String(8), default="error")
    # EXPLAINABILITY — NOT NULL, enforced here
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    recommended_action: Mapped[str | None] = mapped_column(String(32))


class CodingResult(Base, TimestampMixin):
    __tablename__ = "coding_results"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responses.id"))
    field: Mapped[str] = mapped_column(String(64))
    # raw text always preserved — never overwrite
    raw_text: Mapped[str] = mapped_column(String(512))
    code: Mapped[str | None] = mapped_column(String(16))
    # NCO | NIC | ISIC | COICOP
    code_type: Mapped[str | None] = mapped_column(String(12))
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    # local | mospi_nic
    source: Mapped[str] = mapped_column(String(24), default="local")
    # EXPLAINABILITY — NOT NULL
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    # set by DPD officer after human review
    approved_code: Mapped[str | None] = mapped_column(String(16))


class TrustScore(Base, TimestampMixin):
    __tablename__ = "trust_scores"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responses.id"))
    confidence: Mapped[float] = mapped_column(Float)
    # Green | Amber | Red
    risk_level: Mapped[str] = mapped_column(String(8))
    # {validation, fraud, evidence, behaviour} — NOT NULL
    breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fraud_signals: Mapped[list] = mapped_column(JSONB, default=list)  # [{type, reason}]
    recommendation: Mapped[str] = mapped_column(String(32))
