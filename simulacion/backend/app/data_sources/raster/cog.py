"""Lectura de ventanas geográficas de uno o varios COG (mosaico de teselas de un dataset)."""

import asyncio
import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.data_sources.raster.sources import BlockReader, RangeNotFoundError, RangeSource
from app.data_sources.raster.tiff import CogLayout, TiffLevel, decode_tile, read_layout

MAX_MERGED_REQUEST_BYTES = 8 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class BBox:
    """Rectángulo geográfico en grados WGS84 (sin cruce del antimeridiano)."""

    south: float
    west: float
    north: float
    east: float

    def __post_init__(self) -> None:
        if not (-90 <= self.south < self.north <= 90):
            raise ValueError("Latitudes no válidas: se requiere -90 ≤ sur < norte ≤ 90")
        if not (-180 <= self.west < self.east <= 180):
            raise ValueError("Longitudes no válidas: se requiere -180 ≤ oeste < este ≤ 180")

    @property
    def width(self) -> float:
        return self.east - self.west

    @property
    def height(self) -> float:
        return self.north - self.south


@dataclass(frozen=True, slots=True)
class GeoRaster:
    """Ventana ráster en EPSG:4326, filas de norte a sur, convención de área.

    El centro del píxel ``(fila, columna)`` está en
    ``(north - (fila + 0.5) · pixel_height, west + (columna + 0.5) · pixel_width)``.
    """

    data: np.ndarray
    west: float
    north: float
    pixel_width: float
    pixel_height: float

    @property
    def height(self) -> int:
        return int(self.data.shape[0])

    @property
    def width(self) -> int:
        return int(self.data.shape[1])


class CogReader:
    """Lector de un COG remoto; la cabecera se lee una sola vez."""

    def __init__(self, source: RangeSource) -> None:
        self._source = source
        self._layout: CogLayout | None = None
        self._lock = asyncio.Lock()

    @property
    def url(self) -> str:
        return self._source.url

    async def layout(self) -> CogLayout:
        async with self._lock:
            if self._layout is None:
                self._layout = await read_layout(BlockReader(self._source).read)
            return self._layout

    async def read_window(
        self, level_index: int, row0: int, col0: int, rows: int, cols: int
    ) -> np.ndarray:
        """Lee la ventana de píxeles indicada (recortada a la imagen) de una resolución."""
        layout = await self.layout()
        level = layout.levels[level_index]
        out = np.empty((rows, cols), dtype=level.dtype.newbyteorder("="))
        out.fill(_fill_value(layout, level))
        r0, c0 = max(row0, 0), max(col0, 0)
        r1, c1 = min(row0 + rows, level.height), min(col0 + cols, level.width)
        if r0 >= r1 or c0 >= c1:
            return out
        tile_rows = range(r0 // level.tile_height, (r1 - 1) // level.tile_height + 1)
        tile_cols = range(c0 // level.tile_width, (c1 - 1) // level.tile_width + 1)
        wanted = [ty * level.tiles_across + tx for ty in tile_rows for tx in tile_cols]
        tiles = await self._fetch_tiles(level, wanted)
        for index, tile in tiles.items():
            ty, tx = divmod(index, level.tiles_across)
            tr0, tc0 = ty * level.tile_height, tx * level.tile_width
            sr0, sr1 = max(r0, tr0), min(r1, tr0 + level.tile_height)
            sc0, sc1 = max(c0, tc0), min(c1, tc0 + level.tile_width)
            out[sr0 - row0 : sr1 - row0, sc0 - col0 : sc1 - col0] = tile[
                sr0 - tr0 : sr1 - tr0, sc0 - tc0 : sc1 - tc0
            ]
        return out

    async def _fetch_tiles(self, level: TiffLevel, wanted: list[int]) -> dict[int, np.ndarray]:
        # Mosaicos contiguos en el archivo se piden en una sola petición.
        present = sorted(
            (level.tile_offsets[i], level.tile_byte_counts[i], i)
            for i in wanted
            if level.tile_byte_counts[i] > 0
        )
        groups: list[list[tuple[int, int, int]]] = []
        for item in present:
            if groups:
                last = groups[-1]
                start = last[0][0]
                end = last[-1][0] + last[-1][1]
                if item[0] == end and item[0] + item[1] - start <= MAX_MERGED_REQUEST_BYTES:
                    last.append(item)
                    continue
            groups.append([item])

        async def fetch(group: list[tuple[int, int, int]]) -> list[tuple[int, np.ndarray]]:
            start = group[0][0]
            end = group[-1][0] + group[-1][1]
            raw = await self._source.read(start, end - start)
            return [
                (index, decode_tile(level, raw[offset - start : offset - start + size]))
                for offset, size, index in group
            ]

        results = await asyncio.gather(*(fetch(group) for group in groups))
        return {index: tile for chunk in results for index, tile in chunk}


def _fill_value(layout: CogLayout, level: TiffLevel) -> float | int:
    if layout.nodata is not None:
        return layout.nodata
    return math.nan if level.dtype.kind == "f" else 0


@dataclass(frozen=True, slots=True)
class MosaicTile:
    """Una tesela del dataset; ``reader`` es ``None`` si se sabe que no existe (p. ej. océano)."""

    reader: CogReader | None
    name: str


@dataclass(frozen=True, slots=True)
class MosaicResult:
    raster: GeoRaster
    level: int
    tiles_read: tuple[str, ...]
    tiles_missing: tuple[str, ...]


async def read_mosaic(
    tiles: Sequence[MosaicTile],
    bbox: BBox,
    *,
    max_size: int,
    missing_value: float | int,
) -> MosaicResult:
    """Lee ``bbox`` de un conjunto de teselas que comparten la misma malla de píxeles.

    Elige la vista reducida más fina cuya ventana no supere ``max_size`` píxeles por lado.
    Las teselas que no existen en el servidor se rellenan con ``missing_value``.
    """
    available: list[tuple[MosaicTile, CogLayout]] = []
    missing: list[str] = []
    for tile in tiles:
        if tile.reader is None:
            missing.append(tile.name)
            continue
        try:
            available.append((tile, await tile.reader.layout()))
        except RangeNotFoundError:
            missing.append(tile.name)
    if not available:
        raise RangeNotFoundError("Ninguna tesela del área existe en el servidor")

    reference = available[0][1]
    level_index = _choose_level(reference, bbox, max_size)
    level = reference.levels[level_index]
    full = reference.levels[0]
    pixel_width = reference.georef.pixel_width * full.width / level.width
    pixel_height = reference.georef.pixel_height * full.height / level.height

    # Malla de salida alineada con la malla de píxeles de la tesela de referencia.
    ref_west, ref_north = reference.georef.west, reference.georef.north
    col_start = math.floor((bbox.west - ref_west) / pixel_width + 1e-9)
    col_end = math.ceil((bbox.east - ref_west) / pixel_width - 1e-9)
    row_start = math.floor((ref_north - bbox.north) / pixel_height + 1e-9)
    row_end = math.ceil((ref_north - bbox.south) / pixel_height - 1e-9)
    cols, rows = col_end - col_start, row_end - row_start
    if cols <= 0 or rows <= 0:
        raise ValueError("El área solicitada es más pequeña que un píxel")
    if cols > max_size * 2 or rows > max_size * 2:
        raise ValueError("El área solicitada supera el tamaño máximo de lectura")

    out = np.full((rows, cols), missing_value, dtype=level.dtype.newbyteorder("="))
    out_west = ref_west + col_start * pixel_width
    out_north = ref_north - row_start * pixel_height

    async def place(tile: MosaicTile, layout: CogLayout) -> str | None:
        assert tile.reader is not None
        tile_level = layout.levels[level_index]
        tile_pw = layout.georef.pixel_width * layout.levels[0].width / tile_level.width
        tile_ph = layout.georef.pixel_height * layout.levels[0].height / tile_level.height
        col_offset = round((out_west - layout.georef.west) / tile_pw)
        row_offset = round((layout.georef.north - out_north) / tile_ph)
        # Solo se copian los píxeles dentro de la tesela: fuera de ella la ventana es relleno.
        r0, c0 = max(0, -row_offset), max(0, -col_offset)
        r1 = min(rows, tile_level.height - row_offset)
        c1 = min(cols, tile_level.width - col_offset)
        if r0 >= r1 or c0 >= c1:
            return None
        window = await tile.reader.read_window(level_index, row_offset, col_offset, rows, cols)
        out[r0:r1, c0:c1] = window[r0:r1, c0:c1]
        return tile.name

    names = await asyncio.gather(*(place(tile, layout) for tile, layout in available))
    return MosaicResult(
        raster=GeoRaster(out, out_west, out_north, pixel_width, pixel_height),
        level=level_index,
        tiles_read=tuple(name for name in names if name is not None),
        tiles_missing=tuple(missing),
    )


def _choose_level(layout: CogLayout, bbox: BBox, max_size: int) -> int:
    full = layout.levels[0]
    for index, level in enumerate(layout.levels):
        pixel_width = layout.georef.pixel_width * full.width / level.width
        pixel_height = layout.georef.pixel_height * full.height / level.height
        if bbox.width / pixel_width <= max_size and bbox.height / pixel_height <= max_size:
            return index
    return len(layout.levels) - 1
