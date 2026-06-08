"""
Knowledge / context-lookup tables.

classification_codes     : NIC/NCO/ISIC/COICOP lookup — used by coding_engine retrieval-first
reference_distributions  : per-stratum priors for the Bayesian engine
knowledge_sources        : RAG corpus metadata (actual docs in data/kb/, vectors in Chroma)
kg_entities / kg_relations: occupation-sector-activity lookup (relational, not Neo4j)
"""
import uuid

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, pk


class ClassificationCode(Base):
    __tablename__ = "classification_codes"

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(16))
    # NCO | NIC | ISIC | COICOP
    code_type: Mapped[str] = mapped_column(String(12))
    label: Mapped[str] = mapped_column(String(255))
    synonyms: Mapped[list] = mapped_column(JSONB, default=list)
    # "MoSPI NIC" when sourced from DIID NIC API
    external_source: Mapped[str | None] = mapped_column(String(32))


class ReferenceDistribution(Base):
    """
    Per-stratum statistical priors for the Bayesian anomaly engine.
    Populated from historical survey data during setup.
    """
    __tablename__ = "reference_distributions"

    id: Mapped[uuid.UUID] = pk()
    # e.g. "income|urban" or "unemployed|rural|age_25_34"
    key: Mapped[str] = mapped_column(String(64))
    stratum: Mapped[str | None] = mapped_column(String(64))
    p05: Mapped[float | None] = mapped_column(Float)
    median: Mapped[float | None] = mapped_column(Float)
    p95: Mapped[float | None] = mapped_column(Float)
    # mu / sigma per stratum for continuous fields
    params: Mapped[dict] = mapped_column(JSONB, default=dict)


class KnowledgeSource(Base, TimestampMixin):
    """
    Metadata for documents ingested into the RAG corpus.
    Actual documents live in data/kb/ (public only).
    Vectors stored in ChromaDB.
    """
    __tablename__ = "knowledge_sources"

    id: Mapped[uuid.UUID] = pk()
    # survey_generation | coding | validation | trust | policy
    bucket: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(String(160))
    uri: Mapped[str | None] = mapped_column(String(512))


class KGEntity(Base):
    """
    Occupation / industry / sector entities.
    Relational lookup replacing Neo4j for demo scale.
    """
    __tablename__ = "kg_entities"

    id: Mapped[uuid.UUID] = pk()
    # occupation | sector | activity
    etype: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(String(128))
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict)


class KGRelation(Base):
    """
    Directed relation between two KGEntity rows.
    belongs_to | implies | inconsistent_with
    """
    __tablename__ = "kg_relations"

    id: Mapped[uuid.UUID] = pk()
    src_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kg_entities.id"))
    dst_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kg_entities.id"))
    relation: Mapped[str] = mapped_column(String(32))
