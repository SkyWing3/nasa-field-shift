"""Cobertura del suelo ESA WorldCover 10 m 2021 v200 (AWS Open Data, CC BY 4.0).

Mapa global de 11 clases a 10 m derivado de Sentinel-1 y Sentinel-2 de 2021, en teselas COG de
3° x 3° (36000 x 36000 píxeles, ``PixelIsArea``) con vistas reducidas. Exactitud global
publicada ≈ 76,7 %: es una clasificación automática, no un levantamiento de campo, y no
distingue tipos de cultivo.
"""

import math

import httpx2
import numpy as np

from app.data_sources.datasets import DatasetInfo
from app.data_sources.raster import (
    BBox,
    CogReader,
    GeoRaster,
    HttpRangeSource,
    MosaicTile,
    RangeCache,
    read_mosaic,
)

WORLDCOVER_BASE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
WATER_CLASS = 80

WORLDCOVER_CLASSES: dict[int, str] = {
    10: "Árboles",
    20: "Arbustos",
    30: "Pastizal",
    40: "Cultivos",
    50: "Construido",
    60: "Suelo desnudo o vegetación escasa",
    70: "Nieve y hielo",
    80: "Agua permanente",
    90: "Humedal herbáceo",
    95: "Manglar",
    100: "Musgos y líquenes",
}

WORLDCOVER_INFO = DatasetInfo(
    id="esa-worldcover-2021",
    name="ESA WorldCover 10 m 2021 v200",
    provider="ESA WorldCover consortium · AWS Open Data",
    attribution=(
        "Cobertura del suelo: © ESA WorldCover project 2021 / Contains modified Copernicus "
        "Sentinel data (2021) processed by ESA WorldCover consortium"
    ),
    citation=(
        "Zanaga, D. et al. (2022). ESA WorldCover 10 m 2021 v200. "
        "https://doi.org/10.5281/zenodo.7254221"
    ),
    license="CC BY 4.0",
    license_url="https://creativecommons.org/licenses/by/4.0/",
    source_url="https://registry.opendata.aws/esa-worldcover-vito/",
    resolution_m=10.0,
    vertical_datum="",
    acquired="2021 (Sentinel-1 y Sentinel-2)",
    notes=(
        "Clasificación automática con una exactitud global publicada del 76,7 %. No identifica "
        "el tipo de cultivo ni los límites de las parcelas."
    ),
)


def worldcover_tile_name(lat_south: int, lon_west: int) -> str:
    lat = f"{'N' if lat_south >= 0 else 'S'}{abs(lat_south):02d}"
    lon = f"{'E' if lon_west >= 0 else 'W'}{abs(lon_west):03d}"
    return f"{lat}{lon}"


def worldcover_tiles_for(bbox: BBox) -> list[tuple[int, int]]:
    lats = range(math.floor(bbox.south / 3) * 3, math.floor((bbox.north - 1e-12) / 3) * 3 + 1, 3)
    lons = range(math.floor(bbox.west / 3) * 3, math.floor((bbox.east - 1e-12) / 3) * 3 + 1, 3)
    return [(lat, lon) for lat in lats for lon in lons]


class WorldCoverProvider:
    info = WORLDCOVER_INFO

    def __init__(
        self,
        client: httpx2.AsyncClient,
        cache: RangeCache | None,
        *,
        base_url: str = WORLDCOVER_BASE_URL,
        offline: bool = False,
    ) -> None:
        self._client = client
        self._cache = cache
        self._base_url = base_url.rstrip("/")
        self._offline = offline
        self._readers: dict[str, CogReader] = {}

    def _reader(self, name: str) -> CogReader:
        reader = self._readers.get(name)
        if reader is None:
            url = f"{self._base_url}/ESA_WorldCover_10m_2021_v200_{name}_Map.tif"
            reader = CogReader(
                HttpRangeSource(self._client, url, cache=self._cache, offline=self._offline)
            )
            self._readers[name] = reader
        return reader

    async def read(self, bbox: BBox, max_size: int) -> tuple[GeoRaster, tuple[str, ...]]:
        tiles = [
            MosaicTile(self._reader(worldcover_tile_name(lat, lon)), worldcover_tile_name(lat, lon))
            for lat, lon in worldcover_tiles_for(bbox)
        ]
        # WorldCover cubre toda la tierra firme: una tesela inexistente es océano.
        result = await read_mosaic(tiles, bbox, max_size=max_size, missing_value=WATER_CLASS)
        raster = result.raster
        return (
            GeoRaster(
                raster.data.astype(np.uint8),
                raster.west,
                raster.north,
                raster.pixel_width,
                raster.pixel_height,
            ),
            result.tiles_read,
        )
