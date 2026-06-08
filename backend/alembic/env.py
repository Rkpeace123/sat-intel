import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ── Import ALL models so autogenerate sees the full schema ────────────────────
from app.models import Base  # noqa: F401 — side-effect: registers all tables

config = context.config

# Override sqlalchemy.url from environment (never hard-code credentials)
_db_url = os.environ.get("DATABASE_URL") or os.environ.get("database_url")
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Append-only trigger DDL ───────────────────────────────────────────────────
_APPEND_ONLY_TRIGGER = """
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: UPDATE and DELETE are not allowed.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;
"""

_APPEND_ONLY_TABLES = ["audit_logs", "response_versions"]


def _create_append_only_triggers(conn: Connection) -> None:
    conn.execute(text(_APPEND_ONLY_TRIGGER))
    for table in _APPEND_ONLY_TABLES:
        conn.execute(text(f"""
            DROP TRIGGER IF EXISTS trg_no_mutation_{table} ON {table};
            CREATE TRIGGER trg_no_mutation_{table}
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
        """))


# ── Migration runners ─────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
        # Install append-only triggers after tables are created
        await connection.run_sync(_create_append_only_triggers)
        await connection.commit()
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
