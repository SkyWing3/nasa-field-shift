import asyncio
import math
import struct
from collections.abc import Coroutine
from typing import Any, Literal

import numpy as np
import pytest

from app.data_sources.raster import (
    BBox,
    CogReader,
    MosaicTile,
    RangeNotFoundError,
    TiffFormatError,
    read_mosaic,
)
from app.data_sources.raster.tiff import read_layout
from tests.tiff_writer import GeoTags, write_cog


class MemorySource:
    def __init__(self, data: bytes, url: str = "https://example.org/a.tif") -> None:
        self.data = data
        self._url = url
        self.reads: list[tuple[int, int]] = []

    @property
    def url(self) -> str:
        return self._url

    async def read(self, offset: int, length: int) -> bytes:
        self.reads.append((offset, length))
        return self.data[offset : offset + length]


class MissingSource(MemorySource):
    async def read(self, offset: int, length: int) -> bytes:
        raise RangeNotFoundError(self.url)


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro)


GEO = GeoTags(west=-66.0, north=-17.0, pixel_width=0.01, pixel_height=0.01)


def ramp(height: int, width: int, dtype: str) -> np.ndarray:
    return (np.arange(height * width).reshape(height, width) % 30_000).astype(dtype)


@pytest.mark.parametrize("bigtiff", [False, True])
@pytest.mark.parametrize("order", ["<", ">"])
@pytest.mark.parametrize(
    ("dtype", "compression", "predictor"),
    [("int16", 8, 1), ("int16", 8, 2), ("uint8", 1, 1), ("float32", 8, 1), ("uint16", 8, 2)],
)
def test_reads_windows_across_tiles(
    bigtiff: bool, order: Literal["<", ">"], dtype: str, compression: int, predictor: int
) -> None:
    data = ramp(45, 37, dtype)
    blob = write_cog(
        [data],
        GEO,
        tile=16,
        compression=compression,
        predictor=predictor,
        bigtiff=bigtiff,
        order=order,
    )
    reader = CogReader(MemorySource(blob))
    window = run(reader.read_window(0, 7, 5, 30, 25))
    assert window.dtype == np.dtype(dtype)
    np.testing.assert_array_equal(window, data[7:37, 5:30])


def test_window_outside_image_is_filled_with_nodata() -> None:
    data = ramp(20, 20, "int16")
    blob = write_cog([data], GEO, tile=16, nodata="-32768")
    window = run(CogReader(MemorySource(blob)).read_window(0, -3, 15, 6, 8))
    assert window[0, 0] == -32768
    np.testing.assert_array_equal(window[3:, :5], data[0:3, 15:20])
    assert (window[:, 5:] == -32768).all()


def test_layout_georeference_and_pixel_is_point() -> None:
    geo = GeoTags(-66.0, -17.0, 1 / 3600, 1 / 3600, pixel_is_point=True)
    blob = write_cog([ramp(32, 32, "int16"), ramp(16, 16, "int16")], geo, nodata="-32768")
    layout = run(read_layout(MemorySource(blob).read))
    # NASADEM: el punto de enlace (-66, -17) es el centro del píxel; se pasa a esquina.
    assert layout.georef.west == pytest.approx(-66.0 - 0.5 / 3600)
    assert layout.georef.north == pytest.approx(-17.0 + 0.5 / 3600)
    assert layout.georef.pixel_is_point
    assert layout.nodata == -32768
    assert [level.width for level in layout.levels] == [32, 16]


def test_contiguous_tiles_are_fetched_in_one_request() -> None:
    blob = write_cog([ramp(32, 64, "uint8")], GEO, tile=16)
    source = MemorySource(blob)
    reader = CogReader(source)
    run(reader.layout())
    before = len(source.reads)
    run(reader.read_window(0, 0, 0, 16, 64))  # una fila de 4 mosaicos contiguos
    assert len(source.reads) - before == 1


@pytest.mark.parametrize(
    ("tags", "message"),
    [
        ({259: (3, [5])}, "Compresión"),
        ({317: (3, [3])}, "Predictor"),
        ({277: (3, [3])}, "una banda"),
    ],
)
def test_rejects_unsupported_variants(tags: dict[int, tuple[int, list[int]]], message: str) -> None:
    blob = write_cog([ramp(16, 16, "uint8")], GEO, tile=16, extra_tags=tags)
    with pytest.raises(TiffFormatError, match=message):
        run(read_layout(MemorySource(blob).read))


def test_rejects_other_reference_systems_and_non_tiff() -> None:
    blob = write_cog([ramp(16, 16, "uint8")], GeoTags(0, 0, 1, 1, epsg=32719), tile=16)
    with pytest.raises(TiffFormatError, match="EPSG:32719"):
        run(read_layout(MemorySource(blob).read))
    with pytest.raises(TiffFormatError):
        run(read_layout(MemorySource(b"PK\x03\x04" + b"\0" * 64).read))


def test_rejects_float_with_horizontal_predictor() -> None:
    blob = write_cog([ramp(16, 16, "float32")], GEO, tile=16, extra_tags={317: (3, [2])})
    with pytest.raises(TiffFormatError, match="coma flotante"):
        run(read_layout(MemorySource(blob).read))


def test_mosaic_joins_tiles_sharing_an_edge_like_nasadem() -> None:
    # Dos teselas de 1° con 11 píxeles por lado que comparten la columna del borde (PixelIsPoint).
    step = 0.1
    lon = np.arange(11) * step
    west_tile = np.tile(np.round(lon * 100).astype("int16"), (11, 1))
    east_tile = np.tile(np.round((lon + 1) * 100).astype("int16"), (11, 1))
    readers = [
        MosaicTile(
            CogReader(
                MemorySource(write_cog([west_tile], GeoTags(0, 1, step, step, True), tile=8))
            ),
            "w",
        ),
        MosaicTile(
            CogReader(
                MemorySource(write_cog([east_tile], GeoTags(1, 1, step, step, True), tile=8))
            ),
            "e",
        ),
    ]
    result = run(read_mosaic(readers, BBox(0.2, 0.75, 0.8, 1.35), max_size=64, missing_value=0))
    raster = result.raster
    centers = raster.west + (np.arange(raster.width) + 0.5) * raster.pixel_width
    # El valor de cada columna es la longitud del centro del píxel en centésimas de grado.
    np.testing.assert_array_equal(raster.data[0], np.round(centers * 100).astype("int16"))
    assert set(result.tiles_read) == {"w", "e"}


def test_mosaic_fills_missing_tiles_and_reports_them() -> None:
    data = np.full((10, 10), 7, dtype="int16")
    tiles = [
        MosaicTile(
            CogReader(MemorySource(write_cog([data], GeoTags(0, 1, 0.1, 0.1), tile=8))), "a"
        ),
        MosaicTile(CogReader(MissingSource(b"")), "océano"),
    ]
    result = run(read_mosaic(tiles, BBox(0.5, 0.5, 0.9, 1.5), max_size=64, missing_value=0))
    assert result.tiles_missing == ("océano",)
    assert (result.raster.data[:, :5] == 7).all()
    assert (result.raster.data[:, 5:] == 0).all()
    with pytest.raises(RangeNotFoundError):
        run(read_mosaic(tiles[1:], BBox(0.5, 0.5, 0.9, 1.5), max_size=64, missing_value=0))


def test_mosaic_selects_overview_by_size() -> None:
    full = ramp(64, 64, "uint8")
    half = full[::2, ::2].copy()
    quarter = full[::4, ::4].copy()
    blob = write_cog([full, half, quarter], GeoTags(0, 64, 1, 1), tile=16)
    tiles = [MosaicTile(CogReader(MemorySource(blob)), "t")]
    bbox = BBox(0, 0, 64, 64)
    assert run(read_mosaic(tiles, bbox, max_size=64, missing_value=0)).level == 0
    small = run(read_mosaic(tiles, bbox, max_size=20, missing_value=0))
    assert small.level == 2
    assert small.raster.pixel_width == pytest.approx(4)
    np.testing.assert_array_equal(small.raster.data, quarter)


def test_bbox_validation() -> None:
    with pytest.raises(ValueError):
        BBox(10, 0, 5, 1)
    with pytest.raises(ValueError):
        BBox(0, 10, 1, 5)
    assert BBox(0, 0, 1, 2).width == 2


def test_writer_produces_valid_headers() -> None:
    blob = write_cog([ramp(8, 8, "uint8")], GEO, tile=8)
    assert blob[:2] == b"II"
    assert struct.unpack("<H", blob[2:4])[0] == 42
    assert not math.isnan(GEO.west)
