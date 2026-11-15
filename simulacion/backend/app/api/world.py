"""Datos geográficos para generar el mundo 3D: elevación, cobertura del suelo y elementos OSM."""

import base64
from typing import Annotated, Any, cast

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status

from app.data_sources.datasets import DatasetInfo
from app.data_sources.elevation import NASADEM_INFO, ElevationUnavailableError
from app.data_sources.imagery import EOX_INFO
from app.data_sources.landcover import WORLDCOVER_CLASSES, WORLDCOVER_INFO
from app.data_sources.osm import (
    OSM_INFO,
    OsmTimeoutError,
    OsmUnavailableError,
    OsmUpstreamError,
)
from app.data_sources.raster import (
    BBox,
    RangeNotFoundError,
    RangeSourceError,
    RangeTimeoutError,
    TiffFormatError,
)
from app.data_sources.world import WorldDataService
from app.schemas.world import (
    DatasetMeta,
    GeoFeature,
    GeoFeatures,
    LandCoverClass,
    RasterGrid,
    RasterStats,
    WorldDatasets,
)

router = APIRouter(prefix="/world", tags=["mundo 3D"])

# Límites por petición: el mundo 3D usa ±15 km de relieve (hasta 0,6° de longitud en latitudes
# altas). El tamaño en píxeles se limita con `maxSize` y las teselas vectoriales por petición, a 48.
MAX_RASTER_SPAN_DEG = 0.6
MAX_FEATURE_SPAN_DEG = 0.6

ERRORS: dict[int | str, dict[str, Any]] = {
    422: {"description": "Área no válida, demasiado grande o fuera de cobertura"},
    502: {"description": "El servidor de datos respondió con un error"},
    503: {"description": "Datos no disponibles (sin conexión o sin instantánea)"},
    504: {"description": "El servidor de datos no respondió a tiempo"},
}


def get_world(request: Request) -> WorldDataService:
    return cast(WorldDataService, request.app.state.world)


World = Annotated[WorldDataService, Depends(get_world)]
South = Annotated[float, Query(ge=-90, le=90)]
West = Annotated[float, Query(ge=-180, le=180)]
North = Annotated[float, Query(ge=-90, le=90)]
East = Annotated[float, Query(ge=-180, le=180)]
MaxSize = Annotated[int, Query(alias="maxSize", ge=16, le=2048)]


def _bbox(south: float, west: float, north: float, east: float, max_span: float) -> BBox:
    try:
        bbox = BBox(south, west, north, east)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    if bbox.width > max_span or bbox.height > max_span:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"El área supera el máximo de {max_span}° por lado.",
        )
    return bbox


def _meta(info: DatasetInfo) -> DatasetMeta:
    return DatasetMeta(
        id=info.id,
        name=info.name,
        provider=info.provider,
        attribution=info.attribution,
        citation=info.citation,
        license=info.license,
        license_url=info.license_url,
        source_url=info.source_url,
        resolution_m=info.resolution_m,
        vertical_datum=info.vertical_datum,
        acquired=info.acquired,
        notes=info.notes,
    )


def _upstream_error(error: Exception) -> HTTPException:
    if isinstance(error, RangeTimeoutError):
        return HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, str(error))
    if isinstance(error, RangeNotFoundError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "No hay datos para esta área.")
    if isinstance(error, RangeSourceError) and "Sin conexión" in str(error):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error))
    return HTTPException(status.HTTP_502_BAD_GATEWAY, str(error))


@router.get("/datasets", summary="Datasets usados para generar el mundo 3D y su procedencia")
def read_datasets(world: World) -> WorldDatasets:
    return WorldDatasets(
        elevation=_meta(NASADEM_INFO),
        landcover=_meta(WORLDCOVER_INFO),
        imagery=_meta(EOX_INFO),
        landcover_classes=[
            LandCoverClass(code=code, label=label) for code, label in WORLDCOVER_CLASSES.items()
        ],
        features=_meta(OSM_INFO),
        features_live_enabled=world.features.live_enabled,
        offline=world.offline,
    )


@router.get("/elevation", summary="Elevación NASADEM de un área", responses=ERRORS)
async def read_elevation(
    world: World, south: South, west: West, north: North, east: East, max_size: MaxSize = 1024
) -> RasterGrid:
    bbox = _bbox(south, west, north, east, MAX_RASTER_SPAN_DEG)
    try:
        result = await world.elevation.read(bbox, max_size)
    except ElevationUnavailableError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    except (RangeSourceError, TiffFormatError) as error:
        raise _upstream_error(error) from error
    raster = result.raster
    heights = raster.data.astype("<f4")
    finite = heights[np.isfinite(heights)]
    return RasterGrid(
        dataset=NASADEM_INFO.id,
        west=raster.west,
        north=raster.north,
        pixel_width=raster.pixel_width,
        pixel_height=raster.pixel_height,
        width=raster.width,
        height=raster.height,
        encoding="float32le",
        data=base64.b64encode(heights.tobytes()).decode("ascii"),
        stats=RasterStats(
            min=float(finite.min()) if finite.size else None,
            max=float(finite.max()) if finite.size else None,
            void_fraction=result.void_fraction,
        ),
        level=0,
        tiles=list(result.tiles_read),
        tiles_missing=list(result.tiles_missing),
    )


@router.get("/landcover", summary="Cobertura del suelo ESA WorldCover de un área", responses=ERRORS)
async def read_landcover(
    world: World, south: South, west: West, north: North, east: East, max_size: MaxSize = 1024
) -> RasterGrid:
    bbox = _bbox(south, west, north, east, MAX_RASTER_SPAN_DEG)
    try:
        raster, tiles = await world.landcover.read(bbox, max_size)
    except (RangeSourceError, TiffFormatError) as error:
        raise _upstream_error(error) from error
    classes = raster.data.astype(np.uint8)
    full_pixel = 1 / 12000
    level = round(np.log2(raster.pixel_width / full_pixel)) if raster.pixel_width > 0 else 0
    return RasterGrid(
        dataset=WORLDCOVER_INFO.id,
        west=raster.west,
        north=raster.north,
        pixel_width=raster.pixel_width,
        pixel_height=raster.pixel_height,
        width=raster.width,
        height=raster.height,
        encoding="uint8",
        data=base64.b64encode(classes.tobytes()).decode("ascii"),
        stats=RasterStats(min=None, max=None, void_fraction=float((classes == 0).mean())),
        level=int(level),
        tiles=list(tiles),
        tiles_missing=[],
    )


@router.get("/features", summary="Caminos, agua y edificaciones de OpenStreetMap", responses=ERRORS)
async def read_features(
    world: World,
    south: South,
    west: West,
    north: North,
    east: East,
    zoom: Annotated[int, Query(ge=8, le=14, description="Zoom de las teselas vectoriales")] = 14,
) -> GeoFeatures:
    bbox = _bbox(south, west, north, east, MAX_FEATURE_SPAN_DEG)
    try:
        result = await world.features.features(bbox, zoom)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    except OsmUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    except OsmTimeoutError as error:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, str(error)) from error
    except OsmUpstreamError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error
    snapshot = result.snapshot
    return GeoFeatures(
        origin=result.origin,
        zoom=zoom if result.origin == "vectortiles" else None,
        snapshot_id=snapshot.id,
        osm_timestamp=snapshot.osm_timestamp,
        fetched_at=snapshot.fetched_at,
        bbox=(snapshot.bbox.south, snapshot.bbox.west, snapshot.bbox.north, snapshot.bbox.east),
        features=[
            GeoFeature(
                id=feature.id,
                kind=feature.kind,
                subtype=feature.subtype,
                geometry_type=feature.geometry_type,
                coordinates=list(feature.coordinates),
                holes=[list(hole) for hole in feature.holes],
                tags=feature.tags,
            )
            for feature in result.features
        ],
    )


@router.get(
    "/imagery/{z}/{x}/{y}.jpg",
    summary="Mosaico de la imagen Sentinel-2 cloudless 2016 (EOX) con caché",
    responses={**ERRORS, 404: {"description": "Mosaico inexistente"}},
    response_class=Response,
)
async def read_imagery(
    world: World,
    z: Annotated[int, Path(ge=0, le=14)],
    x: Annotated[int, Path(ge=0)],
    y: Annotated[int, Path(ge=0)],
) -> Response:
    try:
        data = await world.imagery.tile(z, x, y)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    except RangeSourceError as error:
        raise _upstream_error(error) from error
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mosaico inexistente")
    return Response(
        content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"}
    )
