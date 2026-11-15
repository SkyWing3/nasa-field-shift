from fastapi.testclient import TestClient

from app import __version__
from app.core.config import Settings
from app.main import create_app


def make_client(**overrides: object) -> TestClient:
    settings = Settings.model_validate({"environment": "test", **overrides})
    return TestClient(create_app(settings))


def test_health_returns_ok() -> None:
    response = make_client().get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "terralab-api",
        "version": __version__,
        "environment": "test",
    }


def test_health_reports_configured_environment() -> None:
    response = make_client(environment="development").get("/api/health")

    assert response.json()["environment"] == "development"


def test_docs_hidden_in_production() -> None:
    client = make_client(environment="production")

    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404
    assert client.get("/api/health").status_code == 200


def test_unknown_route_returns_404() -> None:
    assert make_client().get("/api/does-not-exist").status_code == 404
