"""
Pytest configuration and shared fixtures.

sentence_transformers, chromadb, and torch are large libraries that
trigger model downloads on first import.  We inject lightweight stubs
into sys.modules BEFORE pytest collects test files, so unit tests
run in seconds without any network access.

Integration tests (@pytest.mark.integration) use the real libraries
and require: docker compose up + ingest_all()
"""
import sys
from types import ModuleType
from unittest.mock import MagicMock

import numpy as np
import pytest


# ── Stub sentence_transformers ────────────────────────────────────────────────
def _make_st_stub():
    stub = ModuleType("sentence_transformers")
    fake_st = MagicMock()
    fake_st.encode.return_value = np.ones((1, 384), dtype="float32")
    stub.SentenceTransformer = MagicMock(return_value=fake_st)
    fake_ce = MagicMock()
    fake_ce.predict.return_value = [0.7]
    stub.CrossEncoder = MagicMock(return_value=fake_ce)
    return stub


# ── Stub chromadb ─────────────────────────────────────────────────────────────
def _make_chroma_stub():
    stub = ModuleType("chromadb")
    fake_col = MagicMock()
    fake_col.query.return_value = {
        "ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]
    }
    fake_col.get.return_value = {"ids": [], "documents": [], "metadatas": []}
    fake_col.upsert.return_value = None
    fake_client = MagicMock()
    fake_client.get_or_create_collection.return_value = fake_col
    stub.PersistentClient = MagicMock(return_value=fake_client)
    return stub


# Inject stubs BEFORE any app module is imported during collection
if "sentence_transformers" not in sys.modules:
    sys.modules["sentence_transformers"] = _make_st_stub()
if "chromadb" not in sys.modules:
    sys.modules["chromadb"] = _make_chroma_stub()
# Also stub torch / transformers to avoid heavy optional imports
for _mod in ("torch", "transformers"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()


# ── Markers ───────────────────────────────────────────────────────────────────
def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: requires running docker compose stack and ingested corpus",
    )


# ── FastAPI test client ────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
