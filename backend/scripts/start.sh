#!/usr/bin/env bash
set -e

echo "→ waiting for postgres..."
until python -c "
import asyncio, asyncpg, os
url = os.environ['DATABASE_URL'].replace('+asyncpg', '')
asyncio.run(asyncpg.connect(url))
" 2>/dev/null; do
  sleep 1
done
echo "  postgres ready"

echo "→ running migrations"
alembic upgrade head

echo "→ seeding (idempotent)"
python -m app.seed

echo "→ ingesting RAG knowledge base"
python -m app.intelligence.assist.rag.ingest_cli 2>/dev/null || echo "  (kb empty — skipped)"

echo "→ starting API"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
