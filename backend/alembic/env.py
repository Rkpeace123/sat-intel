"""
Alembic async migration environment.

URL resolution order:
  1. DATABASE_URL environment variable (set in .env or docker env)
  2. sqlalchemy.url in alembic.ini (fallback for local dev without .env)

Append-only triggers are installed after every `upgrade head`:
  - audit_logs
  - response_versions
"""
import asyncio
import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ── Load .env if present (local dev without docker) ───────────────────────────
_env_file = Path(__file__).parent.parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

# ── Import ALL models so autogenerate sees the full schema ────────────────────
from app.models import Base  # noqa: F401 — registers all 26 tables

config = context.config

# Override URL from env (takes priority over alembic.ini value)
_db_url = os.environ.get("DATABASE_URL")
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Append-only trigger DDL ───────────────────────────────────────────────────

_TRIGGER_FUNCTION = """
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only — UPDATE and DELETE are not allowed', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;
"""

_APPEND_ONLY_TABLES = ["audit_logs", "response_versions"]


def _install_append_only_triggers(conn: Connection) -> None:
    conn.execute(text(_TRIGGER_FUNCTION))
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
        try:
            await connection.run_sync(_install_append_only_triggers)
        except Exception as e:  # noqa: BLE001
            # Non-fatal if triggers already exist
            print(f"  [alembic] trigger note: {e}")
        await connection.commit()
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
