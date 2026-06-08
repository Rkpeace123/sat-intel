import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, pk


class Survey(Base, TimestampMixin):
    __tablename__ = "surveys"

    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(160))
    version: Mapped[int] = mapped_column(Integer, default=1)
    region_id: Mapped[str | None] = mapped_column(String(32))          # LGD code
    # draft | published | archived
    status: Mapped[str] = mapped_column(String(16), default="draft")
    # frozen nodes + branches on publish
    question_graph: Mapped[dict] = mapped_column(JSONB, default=dict)
    languages: Mapped[list] = mapped_column(JSONB, default=lambda: ["en", "hi", "ta"])
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))


class SurveyTemplate(Base, TimestampMixin):
    __tablename__ = "survey_templates"

    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(160))
    blocks: Mapped[dict] = mapped_column(JSONB, default=dict)


class Question(Base):
    __tablename__ = "question_bank"

    id: Mapped[uuid.UUID] = pk()
    text_i18n: Mapped[dict] = mapped_column(JSONB)                     # {en, hi, ta}
    # choice | number | text | date
    qtype: Mapped[str] = mapped_column(String(24))
    options: Mapped[list | None] = mapped_column(JSONB)
    validation_rules: Mapped[list] = mapped_column(JSONB, default=list)
    # NCO | NIC | ISIC | COICOP | None
    code_type: Mapped[str | None] = mapped_column(String(12))
    # PLFS | HCES | ASUSE ...
    source: Mapped[str | None] = mapped_column(String(32))


class AdaptiveLogic(Base):
    __tablename__ = "adaptive_logic"

    id: Mapped[uuid.UUID] = pk()
    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE")
    )
    # {field, op, value} or behaviour threshold
    trigger: Mapped[dict] = mapped_column(JSONB)
    # ASK | SIMPLIFY | SKIP | REORDER | BRANCH
    action: Mapped[str] = mapped_column(String(16))
    target: Mapped[dict] = mapped_column(JSONB, default=dict)


class ValidationRule(Base):
    __tablename__ = "validation_rules"

    id: Mapped[uuid.UUID] = pk()
    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE")
    )
    field: Mapped[str] = mapped_column(String(64))
    # range | required | cross_field | context | logic
    rule_type: Mapped[str] = mapped_column(String(24))
    params: Mapped[dict] = mapped_column(JSONB)
    # error | warning
    severity: Mapped[str] = mapped_column(String(8), default="error")
    # explainability at rule level
    reason_template: Mapped[str] = mapped_column(String(255))
