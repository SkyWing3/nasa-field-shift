"""Contratos de los datos geográficos para generar el mundo 3D (JSON en camelCase)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(frozen=True, alias_generator=to_camel, populate_by_name=True)


class DatasetMeta(_CamelModel):
    id: str
    name: str
    provider: str
    attribution: str
    citation: str
    license: str
    license_url: str
    source_url: str
    resolution_m: float | None
    vertical_datum: str | None
    acquired: str
    notes: str


class LandCoverClass(_CamelModel):
    code: int
    label: str


class WorldDatasets(_CamelModel):
    elevation: DatasetMeta
    landcover: DatasetMeta
    imagery: DatasetMeta
    landcover_classes: list[LandCoverClass]
    features: DatasetMeta
    features_live_enabled: bool
    offline: bool


class RasterStats(_CamelModel):
    min: float | None
    max: float | None
    void_fraction: float


class RasterGrid(_CamelModel):
    """Ventana ráster EPSG:4326 (filas de norte a sur, convención de área).

    ``data`` contiene los valores en base64: ``float32`` little-endian (NaN = sin dato) para la
    elevación o ``uint8`` para la cobertura del suelo (0 = sin dato).
    """

    dataset: str
    west: float
    north: float
    pixel_width: float
    pixel_height: float
    width: int
    height: int
    encoding: Literal["float32le", "uint8"]
    data: str
    stats: RasterStats
    level: int
    tiles: list[str]
    tiles_missing: list[str]


class GeoFeature(_CamelModel):
    id: str
    kind: Literal[
        "road", "track", "path", "waterway", "water", "building", "landuse", "railway", "place"
    ]
    subtype: str
    geometry_type: Literal["Point", "LineString", "Polygon"]
    coordinates: list[tuple[float, float]]
    holes: list[list[tuple[float, float]]]
    tags: dict[str, str]


class GeoFeatures(_CamelModel):
    origin: Literal["vectortiles", "snapshot", "overpass"]
    zoom: int | None
    snapshot_id: str
    osm_timestamp: str | None
    fetched_at: str
    bbox: tuple[float, float, float, float]
    features: list[GeoFeature]
