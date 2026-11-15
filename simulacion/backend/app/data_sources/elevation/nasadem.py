"""Elevación NASADEM (NASA JPL, 2020) leída del almacenamiento público de OpenTopography.

- Dataset: NASADEM Merged DEM Global 1 arc second V001
  (doi:10.5067/MEASURES/NASADEM/NASADEM_HGT.001).
- Cobertura: tierra firme entre 56° S y 60° N, teselas de 1° x 1° (3601 x 3601 píxeles que
  comparten la fila y la columna de borde con sus vecinas).
- Resolución: 1 segundo de arco (≈ 30 m en el ecuador). Entero de 16 bits en metros, alturas
  ortométricas sobre el geoide EGM96, píxel como punto (``PixelIsPoint``).
- Origen: radar interferométrico de la misión SRTM (febrero de 2000), reprocesado; los vacíos se
  rellenaron con ASTER GDEM, ALOS PRISM y otros modelos.
- Licencia: datos de la NASA sin restricciones de uso. Acceso autorizado por el usuario el
  2026-11-14 con la condición de OpenTopography: citar a OpenTopography y la fuente del dataset.
"""

import math
from dataclasses import dataclass

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

NASADEM_BASE_URL = "https://opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be"
NASADEM_NODATA = -32768
COVERAGE_SOUTH = -56.0
COVERAGE_NORTH = 60.0


class ElevationUnavailableError(Exception):
    """El área está fuera de la cobertura del dataset."""


NASADEM_INFO = DatasetInfo(
    id="nasadem",
    name="NASADEM HGT v001",
    provider="NASA JPL · distribuido por OpenTopography",
    attribution="Elevación: NASADEM (NASA JPL, 2020) vía OpenTopography",
    citation=(
        "NASA JPL (2020). NASADEM Merged DEM Global 1 arc second V001. NASA EOSDIS Land "
        "Processes DAAC. https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001. "
        "Distribuido por OpenTopography (https://opentopography.org)."
    ),
    license="Datos de la NASA sin restricciones de uso; citar a OpenTopography y a NASA JPL",
    license_url="https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
    source_url="https://portal.opentopography.org/raster?opentopoID=OTSDEM.032021.4326.2",
    resolution_m=30.0,
    vertical_datum="EGM96 (altura ortométrica)",
    acquired="2000-02 (misión SRTM)",
    notes=(
        "Modelo de superficie de radar en banda C: en zonas con árboles o edificios la altura "
        "puede incluir parte de la vegetación o las construcciones. Ruido vertical típico de "
        "algunos metros en terreno llano."
    ),
)


def nasadem_tile_name(lat_south: int, lon_west: int) -> str:
    lat = f"{'n' if lat_south >= 0 else 's'}{abs(lat_south):02d}"
    lon = f"{'e' if lon_west >= 0 else 'w'}{abs(lon_west):03d}"
    return f"NASADEM_HGT_{lat}{lon}"


def nasadem_tiles_for(bbox: BBox) -> list[tuple[int, int]]:
    """Esquinas suroeste de las teselas de 1° que cubren el área."""
    lats = range(math.floor(bbox.south), math.floor(bbox.north - 1e-12) + 1)
    lons = range(math.floor(bbox.west), math.floor(bbox.east - 1e-12) + 1)
    return [(lat, lon) for lat in lats for lon in lons]


@dataclass(frozen=True, slots=True)
class ElevationResult:
    raster: GeoRaster  # float32 en metros; NaN sin dato
    tiles_read: tuple[str, ...]
    tiles_missing: tuple[str, ...]
    void_fraction: float


class NasademProvider:
    info = NASADEM_INFO

    def __init__(
        self,
        client: httpx2.AsyncClient,
        cache: RangeCache | None,
        *,
        base_url: str = NASADEM_BASE_URL,
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
            source = HttpRangeSource(
                self._client,
                f"{self._base_url}/{name}.tif",
                cache=self._cache,
                offline=self._offline,
            )
            reader = CogReader(source)
            self._readers[name] = reader
        return reader

    async def read(self, bbox: BBox, max_size: int) -> ElevationResult:
        if bbox.south < COVERAGE_SOUTH or bbox.north > COVERAGE_NORTH:
            raise ElevationUnavailableError("NASADEM solo cubre tierra firme entre 56° S y 60° N.")
        tiles = [
            MosaicTile(self._reader(nasadem_tile_name(lat, lon)), nasadem_tile_name(lat, lon))
            for lat, lon in nasadem_tiles_for(bbox)
        ]
        # Las teselas que no existen corresponden a océano: se asume el nivel del mar (0 m).
        result = await read_mosaic(tiles, bbox, max_size=max_size, missing_value=0)
        heights = result.raster.data.astype(np.float32)
        voids = result.raster.data == NASADEM_NODATA
        heights[voids] = np.nan
        raster = GeoRaster(
            heights,
            result.raster.west,
            result.raster.north,
            result.raster.pixel_width,
            result.raster.pixel_height,
        )
        return ElevationResult(
            raster=raster,
            tiles_read=result.tiles_read,
            tiles_missing=result.tiles_missing,
            void_fraction=float(voids.mean()),
        )
