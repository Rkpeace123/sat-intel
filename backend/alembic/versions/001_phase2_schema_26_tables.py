"""phase2 schema — 26 tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── permissions ───────────────────────────────────────────────────────────
    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True, server_default=""),
    )

    # ── roles ─────────────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(32), nullable=False, unique=True),
    )

    # ── role_permissions ──────────────────────────────────────────────────────
    op.create_table(
        "role_permissions",
        sa.Column("role_id",       postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("roles.id",       ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",            postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username",      sa.String(64),  nullable=False, unique=True),
        sa.Column("full_name",     sa.String(128), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role_id",       postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("is_active",     sa.Boolean,     nullable=False, server_default="true"),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── surveys ───────────────────────────────────────────────────────────────
    op.create_table(
        "surveys",
        sa.Column("id",             postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name",           sa.String(160), nullable=False),
        sa.Column("version",        sa.Integer,     nullable=False, server_default="1"),
        sa.Column("region_id",      sa.String(32),  nullable=True),
        sa.Column("status",         sa.String(16),  nullable=False, server_default="draft"),
        sa.Column("question_graph", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("languages",      postgresql.JSONB, nullable=False, server_default='["en","hi","ta"]'),
        sa.Column("created_by",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── survey_templates ──────────────────────────────────────────────────────
    op.create_table(
        "survey_templates",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name",       sa.String(160), nullable=False),
        sa.Column("blocks",     postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── question_bank ─────────────────────────────────────────────────────────
    op.create_table(
        "question_bank",
        sa.Column("id",               postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("text_i18n",        postgresql.JSONB, nullable=False),
        sa.Column("qtype",            sa.String(24), nullable=False),
        sa.Column("options",          postgresql.JSONB, nullable=True),
        sa.Column("validation_rules", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("code_type",        sa.String(12),  nullable=True),
        sa.Column("source",           sa.String(32),  nullable=True),
    )

    # ── adaptive_logic ────────────────────────────────────────────────────────
    op.create_table(
        "adaptive_logic",
        sa.Column("id",        postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger",   postgresql.JSONB, nullable=False),
        sa.Column("action",    sa.String(16), nullable=False),
        sa.Column("target",    postgresql.JSONB, nullable=False, server_default="{}"),
    )

    # ── validation_rules ──────────────────────────────────────────────────────
    op.create_table(
        "validation_rules",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id",       postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field",           sa.String(64),  nullable=False),
        sa.Column("rule_type",       sa.String(24),  nullable=False),
        sa.Column("params",          postgresql.JSONB, nullable=False),
        sa.Column("severity",        sa.String(8),   nullable=False, server_default="error"),
        sa.Column("reason_template", sa.String(255), nullable=False),
    )

    # ── enumerators ───────────────────────────────────────────────────────────
    op.create_table(
        "enumerators",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name",        sa.String(128), nullable=False),
        sa.Column("region",      sa.String(96),  nullable=False),
        sa.Column("trust_score", sa.Float,       nullable=False, server_default="100.0"),
        sa.Column("trust_level", sa.String(8),   nullable=False, server_default="Green"),
        sa.Column("trust_trend", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("status",      sa.String(12),  nullable=False, server_default="active"),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── households ────────────────────────────────────────────────────────────
    op.create_table(
        "households",
        sa.Column("id",        sa.String(32), primary_key=True),
        sa.Column("region_id", sa.String(32), nullable=True),
        sa.Column("prepop",    postgresql.JSONB, nullable=False, server_default="{}"),
    )

    # ── assignments ───────────────────────────────────────────────────────────
    op.create_table(
        "assignments",
        sa.Column("id",             postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id",      postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id"),      nullable=False),
        sa.Column("enumerator_id",  postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("enumerators.id"),  nullable=False),
        sa.Column("household_id",   sa.String(32),
                  sa.ForeignKey("households.id"),   nullable=True),
        sa.Column("status",         sa.String(16),  nullable=False, server_default="assigned"),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── responses (APPEND-ONLY) ───────────────────────────────────────────────
    op.create_table(
        "responses",
        sa.Column("id",               postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id",        postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id"),     nullable=False),
        sa.Column("enumerator_id",    postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("enumerators.id"), nullable=True),
        sa.Column("household_id",     sa.String(32),
                  sa.ForeignKey("households.id"),  nullable=True),
        sa.Column("channel",          sa.String(16),  nullable=False, server_default="web"),
        sa.Column("answers",          postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("prepopulated",     postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("adaptive_log",     postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("confidence_score", sa.Float,   nullable=True),
        sa.Column("trust_level",      sa.String(8),   nullable=True),
        sa.Column("status",           sa.String(16),  nullable=False, server_default="captured"),
        sa.Column("created_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── response_versions (APPEND-ONLY) ──────────────────────────────────────
    op.create_table(
        "response_versions",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id"), nullable=False),
        sa.Column("version",     sa.Integer,     nullable=False, server_default="1"),
        sa.Column("answers",     postgresql.JSONB, nullable=False),
        sa.Column("changed_by",  postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reason",      sa.String(255), nullable=False, server_default=""),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── paradata ──────────────────────────────────────────────────────────────
    op.create_table(
        "paradata",
        sa.Column("id",                postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id",       postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at",        sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at",          sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_seconds",     sa.Integer, nullable=True),
        sa.Column("question_timings",  postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("pauses",            sa.Integer, nullable=False, server_default="0"),
        sa.Column("correction_count",  sa.Integer, nullable=False, server_default="0"),
        sa.Column("back_nav_count",    sa.Integer, nullable=False, server_default="0"),
        sa.Column("gps_lat",           sa.Float,   nullable=True),
        sa.Column("gps_lng",           sa.Float,   nullable=True),
        sa.Column("device",            sa.String(64),  nullable=True),
        sa.Column("mode",              sa.String(16),  nullable=True),
        sa.Column("network",           sa.String(16),  nullable=True),
    )

    # ── validation_results ────────────────────────────────────────────────────
    op.create_table(
        "validation_results",
        sa.Column("id",                 postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id",        postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id"), nullable=False),
        sa.Column("layer",              sa.String(16),  nullable=False),
        sa.Column("field",              sa.String(64),  nullable=True),
        sa.Column("status",             sa.String(8),   nullable=False),
        sa.Column("severity",           sa.String(8),   nullable=False, server_default="error"),
        sa.Column("reason",             sa.String(255), nullable=False),   # NOT NULL — explainability
        sa.Column("recommended_action", sa.String(32),  nullable=True),
        sa.Column("created_at",         sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",         sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── coding_results ────────────────────────────────────────────────────────
    op.create_table(
        "coding_results",
        sa.Column("id",            postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id",   postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id"), nullable=False),
        sa.Column("field",         sa.String(64),  nullable=False),
        sa.Column("raw_text",      sa.String(512), nullable=False),
        sa.Column("code",          sa.String(16),  nullable=True),
        sa.Column("code_type",     sa.String(12),  nullable=True),
        sa.Column("confidence",    sa.Integer,     nullable=False, server_default="0"),
        sa.Column("source",        sa.String(24),  nullable=False, server_default="local"),
        sa.Column("reason",        sa.String(255), nullable=False),  # NOT NULL — explainability
        sa.Column("needs_review",  sa.Boolean,     nullable=False, server_default="false"),
        sa.Column("approved_code", sa.String(16),  nullable=True),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── trust_scores ──────────────────────────────────────────────────────────
    op.create_table(
        "trust_scores",
        sa.Column("id",             postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id",    postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id"), nullable=False),
        sa.Column("confidence",     sa.Float, nullable=False),
        sa.Column("risk_level",     sa.String(8), nullable=False),
        sa.Column("breakdown",      postgresql.JSONB, nullable=False),  # NOT NULL — explainability
        sa.Column("fraud_signals",  postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("recommendation", sa.String(32), nullable=False),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── classification_codes ──────────────────────────────────────────────────
    op.create_table(
        "classification_codes",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code",            sa.String(16),  nullable=False),
        sa.Column("code_type",       sa.String(12),  nullable=False),
        sa.Column("label",           sa.String(255), nullable=False),
        sa.Column("synonyms",        postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("external_source", sa.String(32),  nullable=True),
    )

    # ── reference_distributions ───────────────────────────────────────────────
    op.create_table(
        "reference_distributions",
        sa.Column("id",      postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key",     sa.String(64), nullable=False),
        sa.Column("stratum", sa.String(64), nullable=True),
        sa.Column("p05",     sa.Float,      nullable=True),
        sa.Column("median",  sa.Float,      nullable=True),
        sa.Column("p95",     sa.Float,      nullable=True),
        sa.Column("params",  postgresql.JSONB, nullable=False, server_default="{}"),
    )

    # ── knowledge_sources ─────────────────────────────────────────────────────
    op.create_table(
        "knowledge_sources",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bucket",     sa.String(24),  nullable=False),
        sa.Column("name",       sa.String(160), nullable=False),
        sa.Column("uri",        sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── kg_entities ───────────────────────────────────────────────────────────
    op.create_table(
        "kg_entities",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("etype",      sa.String(24),  nullable=False),
        sa.Column("name",       sa.String(128), nullable=False),
        sa.Column("attributes", postgresql.JSONB, nullable=False, server_default="{}"),
    )

    # ── kg_relations ──────────────────────────────────────────────────────────
    op.create_table(
        "kg_relations",
        sa.Column("id",       postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("src_id",   postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("kg_entities.id"), nullable=False),
        sa.Column("dst_id",   postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("kg_entities.id"), nullable=False),
        sa.Column("relation", sa.String(32), nullable=False),
    )

    # ── voice_sessions ────────────────────────────────────────────────────────
    op.create_table(
        "voice_sessions",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("responses.id"), nullable=True),
        sa.Column("language",    sa.String(8),   nullable=False),
        sa.Column("transcript",  postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("provider",    sa.String(16),  nullable=False, server_default="sarvam"),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── translation_sessions ──────────────────────────────────────────────────
    op.create_table(
        "translation_sessions",
        sa.Column("id",           postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_lang",  sa.String(8), nullable=False),
        sa.Column("target_lang",  sa.String(8), nullable=False),
        sa.Column("pairs",        postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at",   sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",   sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── audit_logs (APPEND-ONLY) ──────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id",            postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id",      postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action",        sa.String(64),  nullable=False),
        sa.Column("resource_type", sa.String(48),  nullable=False),
        sa.Column("resource_id",   sa.String(64),  nullable=True),
        sa.Column("detail",        postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("success",       sa.Boolean,     nullable=False, server_default="true"),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Indexes for common queries ─────────────────────────────────────────────
    op.create_index("ix_responses_survey_id",     "responses",     ["survey_id"])
    op.create_index("ix_responses_enumerator_id", "responses",     ["enumerator_id"])
    op.create_index("ix_responses_trust_level",   "responses",     ["trust_level"])
    op.create_index("ix_responses_status",        "responses",     ["status"])
    op.create_index("ix_trust_scores_response",   "trust_scores",  ["response_id"])
    op.create_index("ix_validation_results_resp", "validation_results", ["response_id"])
    op.create_index("ix_audit_logs_actor",        "audit_logs",    ["actor_id"])
    op.create_index("ix_audit_logs_resource",     "audit_logs",    ["resource_type", "resource_id"])
    op.create_index("ix_classification_codes_ct", "classification_codes", ["code_type"])

    # ── Append-only triggers ───────────────────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_mutation()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'Table % is append-only — UPDATE and DELETE are not allowed', TG_TABLE_NAME;
          RETURN NULL;
        END;
        $$;
    """)
    for table in ("audit_logs", "response_versions"):
        op.execute(f"""
            CREATE TRIGGER trg_no_mutation_{table}
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
        """)


def downgrade() -> None:
    # Drop in reverse dependency order
    for table in ("audit_logs", "response_versions"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_no_mutation_{table} ON {table};")
    op.execute("DROP FUNCTION IF EXISTS prevent_mutation();")

    for tbl in [
        "audit_logs", "translation_sessions", "voice_sessions",
        "kg_relations", "kg_entities", "knowledge_sources",
        "reference_distributions", "classification_codes",
        "trust_scores", "coding_results", "validation_results",
        "paradata", "response_versions", "responses",
        "assignments", "households", "enumerators",
        "validation_rules", "adaptive_logic",
        "question_bank", "survey_templates", "surveys",
        "users", "role_permissions", "roles", "permissions",
    ]:
        op.drop_table(tbl)
