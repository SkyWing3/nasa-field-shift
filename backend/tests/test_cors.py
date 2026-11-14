import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import DEFAULT_DEV_CORS_ORIGINS, Settings
from app.main import create_app

DEV_ORIGIN = "http://localhost:5173"
FOREIGN_ORIGIN = "https://evil.example"


def preflight(client: TestClient, origin: str) -> dict[str, str]:
    response = client.options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    return dict(response.headers)


def client_for(**overrides: object) -> TestClient:
    return TestClient(create_app(Settings.model_validate(overrides)))


def test_development_allows_default_dev_origins() -> None:
    client = client_for(environment="development")

    for origin in DEFAULT_DEV_CORS_ORIGINS:
        response = client.get("/api/health", headers={"Origin": origin})
        assert response.headers.get("access-control-allow-origin") == origin


def test_development_rejects_foreign_origin() -> None:
    client = client_for(environment="development")

    response = client.get("/api/health", headers={"Origin": FOREIGN_ORIGIN})
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-origin" not in preflight(client, FOREIGN_ORIGIN)


def test_development_preflight_for_dev_origin() -> None:
    headers = preflight(client_for(environment="development"), DEV_ORIGIN)

    assert headers.get("access-control-allow-origin") == DEV_ORIGIN
    assert "access-control-allow-credentials" not in headers


def test_custom_origins_replace_defaults() -> None:
    client = client_for(environment="development", cors_origins="http://localhost:3000")

    allowed = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    default = client.get("/api/health", headers={"Origin": DEV_ORIGIN})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in default.headers


@pytest.mark.parametrize("environment", ["test", "production"])
def test_cors_disabled_outside_development(environment: str) -> None:
    client = client_for(environment=environment, cors_origins=DEV_ORIGIN)

    response = client.get("/api/health", headers={"Origin": DEV_ORIGIN})
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize(
    "origins",
    ["*", "http://*.example.org", "localhost:5173", "http://localhost:5173/"],
)
def test_invalid_origins_are_rejected(origins: str) -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate({"cors_origins": origins})


def test_origins_parsed_from_comma_separated_string() -> None:
    settings = Settings.model_validate(
        {"environment": "development", "cors_origins": " http://a.test , http://b.test ,"}
    )
    assert settings.resolved_cors_origins() == ("http://a.test", "http://b.test")


def test_origins_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TERRALAB_ENVIRONMENT", "development")
    monkeypatch.setenv("TERRALAB_CORS_ORIGINS", "http://a.test,http://b.test")

    settings = Settings(_env_file=None)

    assert settings.resolved_cors_origins() == ("http://a.test", "http://b.test")


def test_empty_environment_variable_falls_back_to_dev_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TERRALAB_ENVIRONMENT", "development")
    monkeypatch.setenv("TERRALAB_CORS_ORIGINS", "")

    settings = Settings(_env_file=None)

    assert settings.cors_origins == ()
    assert settings.resolved_cors_origins() == DEFAULT_DEV_CORS_ORIGINS
