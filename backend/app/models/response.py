"""
Response models — APPEND-ONLY design.

responses       : one row per submission; never mutated after capture.
response_versions: corrections create new rows linked to the original response.
paradata        : behavioural signals recorded alongside each response.

This is what makes the system auditable to a statistician:
the original answer is always recoverable.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, pk


class Response(Base, TimestampMixin):
    """
    APPEND-ONLY — never issue UPDATE or DELETE on this table.
    Corrections must create a ResponseVersion row.
    """
    __tablename__ = "responses"

    id: Mapped[uuid.UUID] = pk()
    survey_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("surveys.id"))
    enumerator_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("enumerators.id")
    )
    household_id: Mapped[str | None] = mapped_column(ForeignKey("households.id"))
    # web | whatsapp | ivr | avatar
    channel: Mapped[str] = mapped_column(String(16), default="web")
    # {qid: {raw, coded}}
    answers: Mapped[dict] = mapped_column(JSONB, default=dict)
    prepopulated: Mapped[dict] = mapped_column(JSONB, default=dict)
    adaptive_log: Mapped[list] = mapped_column(JSONB, default=list)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    # Green | Amber | Red
    trust_level: Mapped[str | None] = mapped_column(String(8))
    # captured | flagged | approved | re_interview
    status: Mapped[str] = mapped_column(String(16), default="captured")


class ResponseVersion(Base):
    """
    Correction rows — append-only.
    version 1 = first correction; version 2 = second correction; etc.
    """
    __tablename__ = "response_versions"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responses.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    answers: Mapped[dict] = mapped_column(JSONB)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Paradata(Base):
    __tablename__ = "paradata"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("responses.id", ondelete="CASCADE")
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    total_seconds: Mapped[int | None] = mapped_column(Integer)
    # {qid: seconds}
    question_timings: Mapped[dict] = mapped_column(JSONB, default=dict)
    pauses: Mapped[int] = mapped_column(Integer, default=0)
    correction_count: Mapped[int] = mapped_column(Integer, default=0)
    back_nav_count: Mapped[int] = mapped_column(Integer, default=0)
    gps_lat: Mapped[float | None] = mapped_column(Float)
    gps_lng: Mapped[float | None] = mapped_column(Float)
    device: Mapped[str | None] = mapped_column(String(64))
    # PS Section 7: mode of interview
    mode: Mapped[str | None] = mapped_column(String(16))
    network: Mapped[str | None] = mapped_column(String(16))
