import base64
from pathlib import Path

import httpx2
import numpy as np
import pydantic
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.data_sources.elevation import NasademProvider
from app.data_sources.elevation.nasadem import nasadem_tile_name, nasadem_tiles_for
from app.data_sources.imagery import ImageryProvider
from app.data_sources.landcover import WorldCoverProvider
from app.data_sources.landcover.worldcover import worldcover_tile_name, worldcover_tiles_for
from app.data_sources.osm import OsmFeatureProvider, OsmSnapshot, OsmSnapshotStore
from app.data_sources.osm.features import parse_overpass
from app.data_sources.raster import BBox, RangeCache
from app.data_sources.raster.sources import BlobCache
from app.data_sources.world import WorldDataService
from app.main import create_app
from tests.test_osm import PAYLOAD
from tests.tiff_writer import GeoTags, write_cog

DEM_URL = "https://dem.test/nasadem"
LC_URL = "https://lc.test/map"


STEP = 1 / 360


def nasadem_tile() -> bytes:
    # Tesela s18w066 sintética de 361 x 361 píxeles (paso 1/360°): altura = 2700 + columna.
    step = STEP
    heights = np.tile(np.arange(361, dtype="int16") + 2700, (361, 1))
    heights[0, 0] = -32768  # un vacío
    return write_cog(
        [heights], GeoTags(-66.0, -17.0, step, step, pixel_is_point=True), tile=16, nodata="-32768"
    )


def worldcover_tile() -> bytes:
    classes = np.full((36, 36), 40, dtype="uint8")
    classes[:, 18:] = 30
    return write_cog(
        [classes, classes[::2, ::2].copy()], GeoTags(-66.0, -15.0, 1 / 12, 1 / 12), tile=16
    )


JPEG = b"\xff\xd8\xff\xe0synthetic"
FILES = {
    "/imagery/14/9003/5194.jpg": JPEG,
    "/nasadem/NASADEM_HGT_s18w066.tif": nasadem_tile(),
    "/map/ESA_WorldCover_10m_2021_v200_S18W066_Map.tif": worldcover_tile(),
}


def range_server(requests: list[str]) -> httpx2.MockTransport:
    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request.url.path)
        body = FILES.get(request.url.path)
        if body is None:
            return httpx2.Response(404)
        if "Range" not in request.headers:
            return httpx2.Response(200, content=body)
        start, end = (int(v) for v in request.headers["Range"].removeprefix("bytes=").split("-"))
        return httpx2.Response(206, content=body[start : end + 1])

    return httpx2.MockTransport(handler)


def world_service(
    tmp_path: Path, requests: list[str], *, offline: bool = False
) -> WorldDataService:
    client = httpx2.AsyncClient(transport=range_server(requests))
    cache = RangeCache(tmp_path / "cache")
    store = OsmSnapshotStore(tmp_path / "osm")
    features, timestamp = parse_overpass(PAYLOAD)
    store.save(
        OsmSnapshot(
            "demo",
            BBox(-17.58, -65.89, -17.52, -65.83),
            timestamp,
            "2026-11-14T22:06:09+00:00",
            "https://overpass.test",
            tuple(features),
        )
    )
    return WorldDataService(
        elevation=NasademProvider(client, cache, base_url=DEM_URL, offline=offline),
        landcover=WorldCoverProvider(client, cache, base_url=LC_URL, offline=offline),
        features=OsmFeatureProvider(store, None),
        imagery=ImageryProvider(
            client,
            BlobCache(tmp_path / "tiles"),
            template="https://imagery.test/imagery/{z}/{y}/{x}.jpg",
            offline=offline,
        ),
        client=client,
        offline=offline,
    )


@pytest.fixture
def requests() -> list[str]:
    return []


@pytest.fixture
def client(tmp_path: Path, requests: list[str]) -> TestClient:
    settings = Settings(environment="test", world_data_dir=tmp_path)
    return TestClient(create_app(settings, world=world_service(tmp_path, requests)))


AREA = {"south": -17.6, "west": -65.9, "north": -17.4, "east": -65.7}


def test_tile_naming_matches_the_datasets() -> None:
    assert nasadem_tile_name(-18, -66) == "NASADEM_HGT_s18w066"
    assert nasadem_tile_name(5, 7) == "NASADEM_HGT_n05e007"
    assert nasadem_tiles_for(BBox(-17.6, -66.2, -17.4, -65.7)) == [(-18, -67), (-18, -66)]
    assert nasadem_tiles_for(BBox(-18.0, -66.0, -17.0, -65.0)) == [(-18, -66)]
    assert worldcover_tile_name(-18, -66) == "S18W066"
    assert worldcover_tiles_for(BBox(-17.6, -66.2, -17.4, -65.7)) == [(-18, -69), (-18, -66)]


def test_datasets_describe_provenance(client: TestClient) -> None:
    data = client.get("/api/world/datasets").json()
    assert "NASADEM" in data["elevation"]["attribution"]
    assert "OpenTopography" in data["elevation"]["citation"]
    assert data["elevation"]["verticalDatum"].startswith("EGM96")
    assert "ESA WorldCover" in data["landcover"]["attribution"]
    assert data["landcover"]["license"] == "CC BY 4.0"
    assert {"code": 40, "label": "Cultivos"} in data["landcoverClasses"]
    assert "OpenStreetMap" in data["features"]["attribution"]
    assert data["featuresLiveEnabled"] is False
    assert data["imagery"]["license"] == "CC BY 4.0"
    assert "EOX" in data["imagery"]["attribution"]


def test_elevation_returns_decodable_float_grid(client: TestClient) -> None:
    response = client.get("/api/world/elevation", params={**AREA, "maxSize": 256})
    assert response.status_code == 200
    data = response.json()
    assert data["encoding"] == "float32le"
    heights = np.frombuffer(base64.b64decode(data["data"]), "<f4").reshape(
        data["height"], data["width"]
    )
    # Columna j del resultado: centro del píxel → columna de la tesela → altura 2700 + columna.
    centers = data["west"] + (np.arange(data["width"]) + 0.5) * data["pixelWidth"]
    expected = 2700 + np.round((centers + 66.0) * 360)
    np.testing.assert_array_equal(heights[0], expected.astype("f4"))
    assert data["tiles"] == ["NASADEM_HGT_s18w066"]
    assert data["stats"]["min"] >= 2700


def test_elevation_marks_voids_as_nan_and_fills_ocean(client: TestClient) -> None:
    data = client.get(
        "/api/world/elevation",
        params={"south": -17.1, "west": -66.1, "north": -16.95, "east": -65.95},
    ).json()
    heights = np.frombuffer(base64.b64decode(data["data"]), "<f4").reshape(
        data["height"], data["width"]
    )
    assert data["stats"]["voidFraction"] > 0
    assert np.isnan(heights).sum() == 1
    # Las teselas inexistentes (s18w067, s17w066…) se consideran océano: 0 m.
    assert set(data["tilesMissing"]) >= {"NASADEM_HGT_s18w067"}
    assert (heights[:, 0] == 0).all()


def test_landcover_returns_classes(client: TestClient) -> None:
    data = client.get("/api/world/landcover", params={**AREA, "maxSize": 64}).json()
    classes = np.frombuffer(base64.b64decode(data["data"]), "u1")
    assert set(np.unique(classes)) <= {30, 40}
    assert data["encoding"] == "uint8"


def test_features_from_snapshot_and_unavailable_area(client: TestClient) -> None:
    data = client.get(
        "/api/world/features",
        params={"south": -17.56, "west": -65.87, "north": -17.54, "east": -65.85},
    ).json()
    assert data["origin"] == "snapshot"
    assert data["osmTimestamp"] == "2026-11-14T22:04:41Z"
    assert {f["kind"] for f in data["features"]} >= {"road", "building", "waterway"}
    missing = client.get(
        "/api/world/features", params={"south": 10, "west": 10, "north": 10.01, "east": 10.01}
    )
    assert missing.status_code == 503


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/world/elevation", {"south": -18, "west": -66, "north": -17, "east": -65}),
        ("/api/world/elevation", {"south": -17, "west": -66, "north": -17.5, "east": -65.9}),
        ("/api/world/elevation", {"south": 70, "west": 10, "north": 70.1, "east": 10.1}),
        ("/api/world/features", {"south": -18.0, "west": -66.0, "north": -17.3, "east": -65.7}),
        ("/api/world/features", {**AREA, "zoom": 15}),
        ("/api/world/landcover", {**AREA, "maxSize": 4096}),
    ],
)
def test_rejects_invalid_or_oversized_areas(
    client: TestClient, path: str, params: dict[str, float]
) -> None:
    assert client.get(path, params=params).status_code == 422


def test_offline_mode_serves_cache_and_reports_missing_data(tmp_path: Path) -> None:
    requests: list[str] = []
    settings = Settings(environment="test", world_data_dir=tmp_path)
    online = TestClient(create_app(settings, world=world_service(tmp_path, requests)))
    assert online.get("/api/world/elevation", params={**AREA, "maxSize": 64}).status_code == 200
    count = len(requests)
    offline = TestClient(
        create_app(settings, world=world_service(tmp_path, requests, offline=True))
    )
    assert offline.get("/api/world/elevation", params={**AREA, "maxSize": 64}).status_code == 200
    assert len(requests) == count
    other = offline.get("/api/world/landcover", params={**AREA, "maxSize": 64})
    assert other.status_code == 503
    assert offline.get("/api/world/datasets").json()["offline"] is True


def test_imagery_tiles_are_proxied_with_cache_headers(client: TestClient) -> None:
    response = client.get("/api/world/imagery/14/5194/9003.jpg")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert "max-age" in response.headers["cache-control"]
    assert response.content == JPEG
    assert client.get("/api/world/imagery/14/5195/9003.jpg").status_code == 404
    assert client.get("/api/world/imagery/15/0/0.jpg").status_code == 422
    assert client.get("/api/world/imagery/2/9/0.jpg").status_code == 422


def test_responses_are_gzip_compressed(client: TestClient) -> None:
    response = client.get(
        "/api/world/elevation", params={**AREA, "maxSize": 256}, headers={"Accept-Encoding": "gzip"}
    )
    assert response.headers.get("content-encoding") == "gzip"


def test_overpass_configuration_requires_identity() -> None:
    with pytest.raises(pydantic.ValidationError, match="OVERPASS_USER_AGENT"):
        Settings(overpass_url="https://overpass.example.org/api/interpreter")
    with pytest.raises(pydantic.ValidationError, match="HTTPS"):
        Settings(
            overpass_url="http://overpass.example.org/api/interpreter", overpass_user_agent="x"
        )
    with pytest.raises(pydantic.ValidationError, match="HTTPS"):
        Settings(elevation_url="http://dem.example.org")
    assert Settings().overpass_url == ""
