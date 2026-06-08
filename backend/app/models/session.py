import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, pk


class VoiceSession(Base, TimestampMixin):
    __tablename__ = "voice_sessions"

    id: Mapped[uuid.UUID] = pk()
    response_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("responses.id"))
    language: Mapped[str] = mapped_column(String(8))
    # [{turn, speaker, text, confidence}]
    transcript: Mapped[list] = mapped_column(JSONB, default=list)
    provider: Mapped[str] = mapped_column(String(16), default="sarvam")


class TranslationSession(Base, TimestampMixin):
    __tablename__ = "translation_sessions"

    id: Mapped[uuid.UUID] = pk()
    source_lang: Mapped[str] = mapped_column(String(8))
    target_lang: Mapped[str] = mapped_column(String(8))
    # {source_text: translated_text}
    pairs: Mapped[dict] = mapped_column(JSONB, default=dict)
