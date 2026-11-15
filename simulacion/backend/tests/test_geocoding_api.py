import pydantic
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.data_sources.geocoding import (
    DisabledGeocoder,
    GeocodingError,
    GeocodingTimeoutError,
    GeocodingUnavailableError,
    GeocodingUpstreamError,
    GeoNamesGazetteer,
    Place,
    create_geocoder,
)
from app.main import create_app

PUNATA = Place(
    id="geonames:3907080",
    name="Punata",
    region="Cochabamba",
    country_code="BO",
    latitude=-17.5423,
    longitude=-65.8347,
    kind="populated-place",
    population=15194,
)


class FakeGeocoder:
    name = "falso"
    attribution = "Datos de prueba"
    attribution_url = "https://example.org/"

    def __init__(self, error: GeocodingError | None = None) -> None:
        self.error = error
        self.queries: list[tuple[str, int]] = []

    def is_available(self) -> bool:
        return self.error is None

    async def search(self, query: str, limit: int) -> list[Place]:
        self.queries.append((query, limit))
        if self.error is not None:
            raise self.error
        return [PUNATA]


def client_for(geocoder: FakeGeocoder) -> TestClient:
    return TestClient(create_app(Settings(environment="test"), geocoder=geocoder))


def test_reports_provider_and_attribution() -> None:
    response = client_for(FakeGeocoder()).get("/api/geocoding/info")
    assert response.status_code == 200
    assert response.json() == {
        "provider": "falso",
        "attribution": "Datos de prueba",
        "attributionUrl": "https://example.org/",
        "available": True,
    }


def test_returns_results_in_camel_case() -> None:
    geocoder = FakeGeocoder()
    response = client_for(geocoder).get(
        "/api/geocoding/search", params={"q": " Punata ", "limit": 3}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "Punata"
    assert body["results"] == [
        {
            "id": "geonames:3907080",
            "name": "Punata",
            "region": "Cochabamba",
            "countryCode": "BO",
            "latitude": -17.5423,
            "longitude": -65.8347,
            "kind": "populated-place",
            "population": 15194,
        }
    ]
    assert geocoder.queries == [("Punata", 3)]


@pytest.mark.parametrize(
    "params",
    [
        {"q": "x"},
        {"q": "  "},
        {"q": "a" * 121},
        {"q": "Punata", "limit": 0},
        {"q": "Punata", "limit": 11},
    ],
)
def test_validates_query_parameters(params: dict[str, str | int]) -> None:
    geocoder = FakeGeocoder()
    response = client_for(geocoder).get("/api/geocoding/search", params=params)
    assert response.status_code == 422
    assert geocoder.queries == []


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (GeocodingUnavailableError("sin datos"), 503),
        (GeocodingUpstreamError("error externo"), 502),
        (GeocodingTimeoutError("lento"), 504),
    ],
)
def test_maps_provider_errors_to_http(error: GeocodingError, status: int) -> None:
    response = client_for(FakeGeocoder(error)).get("/api/geocoding/search", params={"q": "Punata"})
    assert response.status_code == status
    assert response.json()["detail"] == str(error)


def test_default_provider_is_the_local_gazetteer() -> None:
    assert isinstance(create_geocoder(Settings(environment="test")), GeoNamesGazetteer)
    assert isinstance(
        create_geocoder(Settings(environment="test", geocoder="disabled")), DisabledGeocoder
    )


def test_nominatim_requires_a_deliberate_identifying_configuration() -> None:
    with pytest.raises(pydantic.ValidationError, match="NOMINATIM_USER_AGENT"):
        Settings(environment="test", geocoder="nominatim")
    with pytest.raises(pydantic.ValidationError, match="HTTPS"):
        Settings(
            environment="test",
            geocoder="nominatim",
            nominatim_user_agent="app/1.0",
            nominatim_url="http://nominatim.example.org",
        )
