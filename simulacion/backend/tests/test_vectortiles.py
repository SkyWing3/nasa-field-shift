import asyncio
from pathlib import Path

import httpx2
import pytest

from app.data_sources.imagery import ImageryProvider
from app.data_sources.osm.mvt import MvtError, decode_tile, ring_area
from app.data_sources.osm.vectortiles import (
    VectorTileProvider,
    features_from_tile,
    tile_point_to_lonlat,
    tiles_for,
)
from app.data_sources.raster import BBox, RangeSourceError
from app.data_sources.raster.sources import BlobCache
from tests.mvt_writer import Feature, encode_tile

Z, X, Y = 14, 5194, 9003
TEMPLATE = "https://tiles.test/planet/20261101_001001_pt/{z}/{x}/{y}.pbf"

LAKE = [(100, 100), (900, 100), (900, 900), (100, 900), (100, 100)]
ISLAND = [(400, 400), (400, 600), (600, 600), (600, 400), (400, 400)]


def sample_tile() -> bytes:
    return encode_tile(
        {
            "transportation": [
                Feature(
                    "LineString",
                    [[(0, 0), (4096, 4096)]],
                    {"class": "primary", "surface": "paved"},
                    7,
                ),
                Feature(
                    "LineString", [[(0, 10), (50, 10)]], {"class": "minor", "brunnel": "tunnel"}
                ),
                Feature("LineString", [[(5, 5), (40, 90)]], {"class": "track"}),
                Feature(
                    "LineString", [[(5, 5), (40, 90)]], {"class": "path", "subclass": "footway"}
                ),
                Feature("LineString", [[(5, 5), (40, 90)]], {"class": "rail", "subclass": "rail"}),
                Feature(
                    "LineString", [[(5, 5), (40, 90)]], {"class": "secondary", "brunnel": "bridge"}
                ),
            ],
            "building": [
                Feature(
                    "Polygon",
                    [[(10, 10), (60, 10), (60, 60), (10, 60), (10, 10)]],
                    {"render_height": 12, "render_min_height": 0},
                    1,
                ),
                # Centroide fuera de la tesela: pertenece a la vecina.
                Feature("Polygon", [[(-80, 10), (-20, 10), (-20, 60), (-80, 60), (-80, 10)]], {}),
                Feature(
                    "Polygon",
                    [[(200, 200), (260, 200), (260, 260), (200, 260), (200, 200)]],
                    {"hide_3d": True},
                ),
            ],
            "water": [
                Feature(
                    "Polygon",
                    [LAKE, ISLAND],
                    {"class": "lake", "name": "Laguna", "name:es": "Laguna Alalay"},
                ),
                Feature(
                    "Polygon",
                    [[(1, 1), (9, 1), (9, 9), (1, 9), (1, 1)]],
                    {"class": "swimming_pool"},
                ),
            ],
            "waterway": [
                Feature(
                    "LineString", [[(0, 2000), (4096, 2100)]], {"class": "river", "intermittent": 1}
                ),
                Feature(
                    "LineString",
                    [[(0, 2000), (4096, 2100)]],
                    {"class": "river", "brunnel": "tunnel"},
                ),
            ],
            "landcover": [
                Feature(
                    "Polygon", [[(0, 0), (500, 0), (500, 500), (0, 500), (0, 0)]], {"class": "wood"}
                ),
                Feature(
                    "Polygon",
                    [[(0, 0), (500, 0), (500, 500), (0, 500), (0, 0)]],
                    {"class": "unknown"},
                ),
            ],
            "landuse": [
                Feature(
                    "Polygon",
                    [[(0, 0), (500, 0), (500, 500), (0, 500), (0, 0)]],
                    {"class": "residential"},
                ),
            ],
            "place": [
                Feature(
                    "Point", [[(2048, 2048)]], {"class": "city", "name": "Cochabamba", "rank": 3}
                ),
                Feature("Point", [[(5000, 2048)]], {"class": "town", "name": "Fuera"}),
                Feature("Point", [[(100, 100)]], {"class": "country", "name": "Bolivia"}),
            ],
        }
    )


def test_decoder_reads_layers_tags_and_geometry() -> None:
    layers = {layer.name: layer for layer in decode_tile(sample_tile())}
    assert set(layers) >= {"transportation", "building", "water", "place"}
    road = layers["transportation"].features[0]
    assert road.id == 7
    assert road.kind == "LineString"
    assert road.parts == [[(0, 0), (4096, 4096)]]
    assert road.tags == {"class": "primary", "surface": "paved"}
    lake = layers["water"].features[0]
    assert len(lake.parts) == 2
    assert lake.parts[0][0] == lake.parts[0][-1]  # ClosePath cierra el anillo
    assert ring_area(lake.parts[0]) > 0 > ring_area(lake.parts[1])
    assert layers["building"].features[0].tags["render_height"] == 12
    assert layers["building"].features[2].tags["hide_3d"] is True


def test_decoder_rejects_corrupt_tiles() -> None:
    with pytest.raises(MvtError):
        decode_tile(sample_tile()[:-3])


def test_tile_math_round_trips() -> None:
    lon, lat = tile_point_to_lonlat(Z, X, Y, 4096, 0, 0)
    assert tiles_for(BBox(lat - 0.001, lon + 0.001, lat - 0.0005, lon + 0.002), Z) == [(X, Y)]
    cover = tiles_for(BBox(-17.6, -65.9, -17.5, -65.8), Z)
    assert len(cover) == len({c for c in cover}) > 4
    xs = {x for x, _ in cover}
    ys = {y for _, y in cover}
    assert len(cover) == len(xs) * len(ys)


def test_features_are_classified_with_holes_and_deduplicated_buildings() -> None:
    features = features_from_tile(Z, X, Y, sample_tile())
    by_kind: dict[str, list[str]] = {}
    for feature in features:
        by_kind.setdefault(feature.kind, []).append(feature.subtype)
    assert sorted(by_kind["road"]) == ["primary", "secondary"]
    assert by_kind["track"] == ["track"]
    assert by_kind["path"] == ["footway"]
    assert by_kind["railway"] == ["rail"]
    assert by_kind["waterway"] == ["river"]
    assert by_kind["water"] == ["lake"]
    assert sorted(by_kind["landuse"]) == ["forest", "residential"]
    assert by_kind["place"] == ["city"]
    assert by_kind["building"] == ["yes"]

    building = next(f for f in features if f.kind == "building")
    assert building.tags == {"height": "12", "min_height": "0"}
    lake = next(f for f in features if f.kind == "water")
    assert lake.tags["name"] == "Laguna Alalay"
    assert len(lake.holes) == 1
    assert lake.coordinates[0] == lake.coordinates[-1]
    road = next(f for f in features if f.subtype == "primary")
    assert road.tags["surface"] == "paved"
    assert road.coordinates[0] == tile_point_to_lonlat(Z, X, Y, 4096, 0, 0)
    assert next(f for f in features if f.subtype == "secondary").tags["bridge"] == "yes"
    assert next(f for f in features if f.kind == "waterway").tags["intermittent"] == "yes"
    city = next(f for f in features if f.kind == "place")
    assert city.geometry_type == "Point"
    assert city.tags == {"name": "Cochabamba", "rank": "3"}
    assert len({f.id for f in features}) == len(features)


def tile_server(log: list[str], tile: bytes, *, status: int = 200) -> httpx2.MockTransport:
    def handler(request: httpx2.Request) -> httpx2.Response:
        log.append(f"{request.url.path}|{request.headers.get('User-Agent')}")
        if request.url.path == "/planet":
            return httpx2.Response(200, json={"tiles": [TEMPLATE]})
        if request.url.path.endswith(f"/{Z}/{X}/{Y}.pbf"):
            return httpx2.Response(status, content=tile)
        if request.url.path.endswith(".pbf"):
            return httpx2.Response(204)
        if request.url.path.endswith(f"/{Z}/{Y}/{X}.jpg"):
            return httpx2.Response(200, content=b"\xff\xd8jpeg")
        return httpx2.Response(404)

    return httpx2.MockTransport(handler)


def test_provider_downloads_caches_and_works_offline(tmp_path: Path) -> None:
    log: list[str] = []
    lon, lat = tile_point_to_lonlat(Z, X, Y, 4096, 2048, 2048)
    bbox = BBox(lat - 0.002, lon - 0.002, lat + 0.002, lon + 0.002)
    cache = BlobCache(tmp_path)

    async def run(offline: bool) -> tuple[int, int, str | None]:
        async with httpx2.AsyncClient(transport=tile_server(log, sample_tile())) as client:
            provider = VectorTileProvider(
                client, cache, tilejson_url="https://tiles.test/planet", offline=offline
            )
            result = await provider.features(bbox, Z)
            return len(result.features), result.tiles, result.data_date

    count, tiles, date = asyncio.run(run(False))
    assert count > 10
    assert tiles == len(tiles_for(bbox, Z)) >= 1
    assert date == "2026-11-01"
    assert all(entry.endswith("|farm-sim-geodata/0.1") for entry in log)
    requests = len(log)
    # Sin conexión se sirve todo desde la caché (descripción y teselas, también las vacías).
    assert asyncio.run(run(True)) == (count, tiles, date)
    assert len(log) == requests


def test_provider_offline_without_cache_and_limits(tmp_path: Path) -> None:
    async def run(bbox: BBox) -> None:
        async with httpx2.AsyncClient(transport=tile_server([], sample_tile())) as client:
            provider = VectorTileProvider(
                client, BlobCache(tmp_path), tilejson_url="https://tiles.test/planet", offline=True
            )
            await provider.features(bbox, Z)

    with pytest.raises(RangeSourceError):
        asyncio.run(run(BBox(-17.56, -65.87, -17.55, -65.86)))
    with pytest.raises(ValueError, match="demasiadas teselas"):
        asyncio.run(run(BBox(-18, -66, -17, -65)))


def test_provider_reports_invalid_tiles(tmp_path: Path) -> None:
    lon, lat = tile_point_to_lonlat(Z, X, Y, 4096, 2048, 2048)

    async def run() -> None:
        async with httpx2.AsyncClient(transport=tile_server([], b"\x1a\xff\xff")) as client:
            provider = VectorTileProvider(
                client, BlobCache(tmp_path), tilejson_url="https://tiles.test/planet"
            )
            await provider.features(BBox(lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001), Z)

    with pytest.raises(RangeSourceError, match="no válida"):
        asyncio.run(run())


def test_imagery_provider_caches_tiles_and_missing_tiles(tmp_path: Path) -> None:
    log: list[str] = []
    template = "https://imagery.test/{z}/{y}/{x}.jpg"

    async def run(offline: bool) -> tuple[bytes | None, bytes | None]:
        async with httpx2.AsyncClient(transport=tile_server(log, b"")) as client:
            provider = ImageryProvider(
                client, BlobCache(tmp_path), template=template, offline=offline
            )
            return await provider.tile(Z, X, Y), await provider.tile(Z, X + 1, Y)

    assert asyncio.run(run(False)) == (b"\xff\xd8jpeg", None)
    count = len(log)
    assert asyncio.run(run(True)) == (b"\xff\xd8jpeg", None)
    assert len(log) == count

    async def out_of_range() -> None:
        async with httpx2.AsyncClient(transport=tile_server(log, b"")) as client:
            await ImageryProvider(client, None, template=template).tile(15, 0, 0)

    with pytest.raises(ValueError):
        asyncio.run(out_of_range())
