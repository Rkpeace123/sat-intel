import uuid

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, pk


class Enumerator(Base, TimestampMixin):
    __tablename__ = "enumerators"

    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(128))
    region: Mapped[str] = mapped_column(String(96))
    trust_score: Mapped[float] = mapped_column(Float, default=100.0)
    # Green | Amber | Red
    trust_level: Mapped[str] = mapped_column(String(8), default="Green")
    trust_trend: Mapped[list] = mapped_column(JSONB, default=list)
    # active | suspended
    status: Mapped[str] = mapped_column(String(12), default="active")


class Household(Base):
    __tablename__ = "households"

    # e.g. HH-TN-0042
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    region_id: Mapped[str | None] = mapped_column(String(32))         # LGD
    prepop: Mapped[dict] = mapped_column(JSONB, default=dict)


class Assignment(Base, TimestampMixin):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = pk()
    survey_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("surveys.id"))
    enumerator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enumerators.id"))
    household_id: Mapped[str | None] = mapped_column(ForeignKey("households.id"))
    # assigned | in_progress | submitted | accepted
    status: Mapped[str] = mapped_column(String(16), default="assigned")
