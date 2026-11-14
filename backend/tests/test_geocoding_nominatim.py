import asyncio
import itertools
import json

import httpx2
import pytest

from app.data_sources.geocoding import (
    GeocodingTimeoutError,
    GeocodingUpstreamError,
    NominatimGeocoder,
)

RESULT = [
    {
        "osm_type": "relation",
        "osm_id": 1234,
        "lat": "-17.5423",
        "lon": "-65.8347",
        "category": "place",
        "name": "Punata",
        "display_name": "Punata, Provincia Punata, Cochabamba, Bolivia",
    }
]


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make_geocoder(
    handler: httpx2.MockTransport, clock: FakeClock | None = None
) -> tuple[NominatimGeocoder, FakeClock]:
    clock = clock or FakeClock()
    geocoder = NominatimGeocoder(
        httpx2.AsyncClient(transport=handler),
        "https://nominatim.example.org/",
        "aplicacion-de-prueba/1.0",
        clock=clock,
        sleep=clock.sleep,
    )
    return geocoder, clock


def test_sends_identifying_user_agent_and_expected_parameters() -> None:
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, json=RESULT)

    geocoder, _ = make_geocoder(httpx2.MockTransport(handler))
    [place] = asyncio.run(geocoder.search("Punata", 3))

    request = seen[0]
    assert request.url.host == "nominatim.example.org"
    assert request.url.path == "/search"
    assert request.headers["User-Agent"] == "aplicacion-de-prueba/1.0"
    assert dict(request.url.params) == {
        "q": "Punata",
        "format": "jsonv2",
        "limit": "3",
        "accept-language": "es",
    }
    assert place.id == "osm:relation/1234"
    assert (place.latitude, place.longitude) == (-17.5423, -65.8347)
    assert place.kind == "populated-place"
    assert place.region == "Provincia Punata, Cochabamba"


def test_never_exceeds_one_request_per_second() -> None:
    calls: list[float] = []
    clock = FakeClock()

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(clock.now)
        return httpx2.Response(200, json=RESULT)

    geocoder, _ = make_geocoder(httpx2.MockTransport(handler), clock)

    async def burst() -> None:
        for query in ("uno", "dos", "tres"):
            await geocoder.search(query, 5)
            clock.now += 0.1  # el usuario busca de nuevo enseguida

    asyncio.run(burst())
    assert len(calls) == 3
    assert all(later - earlier >= 1.0 for earlier, later in itertools.pairwise(calls))
    assert clock.sleeps == pytest.approx([0.9, 0.9])


def test_caches_repeated_queries() -> None:
    calls = 0

    def handler(request: httpx2.Request) -> httpx2.Response:
        nonlocal calls
        calls += 1
        return httpx2.Response(200, json=RESULT)

    geocoder, _ = make_geocoder(httpx2.MockTransport(handler))

    async def repeat() -> None:
        await geocoder.search("Punata", 5)
        await geocoder.search("  PUNATA ", 5)

    asyncio.run(repeat())
    assert calls == 1


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx2.Response(503), GeocodingUpstreamError),
        (httpx2.Response(200, content=b"<html>"), GeocodingUpstreamError),
        (
            httpx2.Response(200, content=json.dumps({"no": "lista"}).encode()),
            GeocodingUpstreamError,
        ),
    ],
)
def test_maps_upstream_failures(response: httpx2.Response, error: type[Exception]) -> None:
    geocoder, _ = make_geocoder(httpx2.MockTransport(lambda request: response))
    with pytest.raises(error):
        asyncio.run(geocoder.search("Punata", 5))


def test_maps_timeouts() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("lento", request=request)

    geocoder, _ = make_geocoder(httpx2.MockTransport(handler))
    with pytest.raises(GeocodingTimeoutError):
        asyncio.run(geocoder.search("Punata", 5))


def test_rejects_unsafe_configuration() -> None:
    client = httpx2.AsyncClient()
    with pytest.raises(ValueError, match="1 petición por segundo"):
        NominatimGeocoder(client, "https://x", "app/1.0", min_interval_s=0.5)
    with pytest.raises(ValueError, match="User-Agent"):
        NominatimGeocoder(client, "https://x", "  ")
