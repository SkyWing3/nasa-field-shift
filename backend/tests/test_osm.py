import asyncio
import json
from pathlib import Path

import httpx2
import pytest

from app.data_sources.osm import (
    OsmFeatureProvider,
    OsmSnapshot,
    OsmSnapshotStore,
    OsmTimeoutError,
    OsmUnavailableError,
    OsmUpstreamError,
    OverpassClient,
)
from app.data_sources.osm.features import classify, intersects, overpass_query, parse_overpass
from app.data_sources.raster import BBox

AREA = BBox(-17.58, -65.89, -17.52, -65.83)


def way(way_id: int, tags: dict[str, str], points: list[tuple[float, float]]) -> dict[str, object]:
    return {
        "type": "way",
        "id": way_id,
        "tags": tags,
        "geometry": [{"lat": lat, "lon": lon} for lon, lat in points],
    }


SQUARE = [
    (-65.86, -17.55),
    (-65.859, -17.55),
    (-65.859, -17.549),
    (-65.86, -17.549),
    (-65.86, -17.55),
]
LINE = [(-65.87, -17.56), (-65.85, -17.54)]
PAYLOAD = {
    "osm3s": {"timestamp_osm_base": "2026-11-14T22:04:41Z"},
    "elements": [
        way(
            1,
            {"highway": "primary", "surface": "asphalt", "name": "Avenida", "oneway": "yes"},
            LINE,
        ),
        way(2, {"highway": "track", "tracktype": "grade3"}, LINE),
        way(3, {"waterway": "canal", "intermittent": "yes"}, LINE),
        way(4, {"building": "yes"}, SQUARE),
        way(5, {"landuse": "orchard"}, SQUARE),
        way(6, {"natural": "water", "water": "basin"}, SQUARE),
        way(7, {"amenity": "bench"}, LINE),  # no se representa
        way(8, {"highway": "footway"}, LINE),
        {"type": "node", "id": 9, "lat": -17.5, "lon": -65.8},
        way(10, {"highway": "primary"}, [(-65.87, -17.56)]),  # geometría insuficiente
    ],
}


def test_query_is_bounded_and_limited_to_scene_categories() -> None:
    query = overpass_query(AREA)
    assert "[bbox:-17.580000,-65.890000,-17.520000,-65.830000]" in query
    assert "[out:json]" in query
    assert 'way["highway"]' in query
    assert "node" not in query


def test_parses_and_classifies_elements() -> None:
    features, timestamp = parse_overpass(PAYLOAD)
    assert timestamp == "2026-11-14T22:04:41Z"
    kinds = {f.id: (f.kind, f.subtype, f.geometry_type) for f in features}
    assert kinds == {
        "way/1": ("road", "primary", "LineString"),
        "way/2": ("track", "grade3", "LineString"),
        "way/3": ("waterway", "canal", "LineString"),
        "way/4": ("building", "yes", "Polygon"),
        "way/5": ("landuse", "orchard", "Polygon"),
        "way/6": ("water", "basin", "Polygon"),
        "way/8": ("path", "footway", "LineString"),
    }
    road = next(f for f in features if f.id == "way/1")
    # Solo se conservan las etiquetas útiles para la escena.
    assert road.tags == {"highway": "primary", "surface": "asphalt", "name": "Avenida"}
    assert road.coordinates[0] == (-65.87, -17.56)
    with pytest.raises(ValueError):
        parse_overpass({"nothing": True})


def test_classification_edge_cases() -> None:
    assert classify({"highway": "pedestrian", "area": "yes"}, True) is None
    assert classify({"waterway": "riverbank"}, True) is None
    assert classify({"railway": "rail"}, False) == ("railway", "rail", "LineString")
    assert classify({"landuse": "farmland"}, False) is None  # un uso del suelo debe ser cerrado


def test_intersects() -> None:
    features, _ = parse_overpass(PAYLOAD)
    assert intersects(features[0], AREA)
    assert not intersects(features[0], BBox(10, 10, 11, 11))


def snapshot(bbox: BBox, fetched_at: str = "2026-11-14T22:00:00+00:00") -> OsmSnapshot:
    features, timestamp = parse_overpass(PAYLOAD)
    return OsmSnapshot(
        "demo", bbox, timestamp, fetched_at, "https://overpass.test", tuple(features)
    )


def test_snapshot_store_round_trip_and_lookup(tmp_path: Path) -> None:
    store = OsmSnapshotStore(tmp_path)
    path = store.save(snapshot(AREA))
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["license"].startswith("ODbL")
    assert store.find(BBox(-17.56, -65.87, -17.54, -65.85)) is not None
    assert store.find(BBox(-17.60, -65.87, -17.54, -65.85)) is None  # sale del área
    loaded = store.find(AREA)
    assert loaded is not None and len(loaded.features) == 7
    (tmp_path / "roto.json").write_text("{", encoding="utf-8")
    assert store.find(AREA) is not None  # un archivo dañado se ignora


def test_provider_serves_snapshots_and_refuses_live_queries_by_default(tmp_path: Path) -> None:
    store = OsmSnapshotStore(tmp_path)
    store.save(snapshot(AREA))
    provider = OsmFeatureProvider(store, None)
    assert not provider.live_enabled
    result = asyncio.run(provider.features(BBox(-17.551, -65.861, -17.548, -65.858)))
    assert result.origin == "snapshot"
    assert {f.id for f in result.features} >= {"way/4", "way/5"}
    with pytest.raises(OsmUnavailableError, match="TERRALAB_OVERPASS_URL"):
        asyncio.run(provider.features(BBox(10, 10, 10.01, 10.01)))


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_live_overpass_is_rate_limited_cached_and_identified(tmp_path: Path) -> None:
    requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(200, json=PAYLOAD)

    clock = FakeClock()
    overpass = OverpassClient(
        httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
        "https://overpass.test/api/interpreter",
        "MiGranja/1.0 (contacto@example.org)",
        clock=clock,
        sleep=clock.sleep,
    )
    provider = OsmFeatureProvider(OsmSnapshotStore(tmp_path), overpass)
    first = BBox(-17.56, -65.87, -17.54, -65.85)
    result = asyncio.run(provider.features(first))
    assert result.origin == "overpass"
    assert requests[0].headers["User-Agent"] == "MiGranja/1.0 (contacto@example.org)"
    assert b"data=" in requests[0].content
    # La misma área se sirve desde la instantánea guardada, sin repetir la consulta.
    assert asyncio.run(provider.features(first)).origin == "snapshot"
    assert len(requests) == 1
    # Otra área: se espera el intervalo mínimo entre consultas.
    asyncio.run(provider.features(BBox(-17.50, -65.87, -17.48, -65.85)))
    assert clock.sleeps == [10.0]
    with pytest.raises(OsmUnavailableError, match="demasiado grande"):
        asyncio.run(provider.features(BBox(-18, -66, -17, -65)))


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx2.Response(429), OsmUpstreamError),
        (httpx2.Response(200, content=b"<html>"), OsmUpstreamError),
        (None, OsmTimeoutError),
    ],
)
def test_live_overpass_errors(response: httpx2.Response | None, error: type[Exception]) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        if response is None:
            raise httpx2.ReadTimeout("lento", request=request)
        return response

    overpass = OverpassClient(
        httpx2.AsyncClient(transport=httpx2.MockTransport(handler)), "https://overpass.test/i", "UA"
    )
    with pytest.raises(error):
        asyncio.run(overpass.fetch(AREA))
    with pytest.raises(ValueError):
        OverpassClient(httpx2.AsyncClient(), "http://overpass.test/i", "UA")
