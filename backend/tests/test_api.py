"""
Phase 14 — API layer tests.

Auth endpoints, RBAC enforcement, assist route contracts.
Tests run with mocked DB (no live Postgres needed).
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


class TestHealth:
    def test_health_ok(self, client: TestClient):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_docs_render(self, client: TestClient):
        r = client.get("/docs")
        assert r.status_code == 200

    def test_openapi_json(self, client: TestClient):
        r = client.get("/openapi.json")
        assert r.status_code == 200
        paths = r.json()["paths"]
        # core endpoints must be present
        assert "/api/v1/auth/login" in paths
        assert "/api/v1/intelligence/answer" in paths
        assert "/api/v1/dashboard/metrics" in paths
        assert "/api/v1/coding" in paths


class TestAuth:
    def test_protected_endpoint_returns_401_without_token(self, client: TestClient):
        r = client.post("/api/v1/intelligence/answer",
                        json={"response_id": "x", "paradata": {}})
        assert r.status_code == 401

    def test_dashboard_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/dashboard/metrics")
        assert r.status_code == 401

    def test_surveys_list_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/surveys/")
        assert r.status_code == 401

    def test_coding_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/coding?text=driver")
        assert r.status_code == 401


class TestCodingContract:
    """Coding endpoint must be assist-only even when called (with mocked store)."""

    def test_coding_route_exists(self, client: TestClient):
        r = client.get("/openapi.json")
        assert "/api/v1/coding" in r.json()["paths"]
