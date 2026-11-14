"""Elementos geográficos de OpenStreetMap: consulta Overpass, clasificación y geometría.

OpenStreetMap no contiene mapas de cultivos ni imágenes: solo se extraen caminos, cursos y
masas de agua, edificaciones, vías férreas y usos del suelo declarados por la comunidad, con
la fecha de los datos. La completitud de OSM varía mucho entre zonas.
"""

import math
from dataclasses import dataclass
from typing import Any, Literal

from app.data_sources.datasets import DatasetInfo
from app.data_sources.raster import BBox

FeatureKind = Literal[
    "road", "track", "path", "waterway", "water", "building", "landuse", "railway"
]
GeometryType = Literal["LineString", "Polygon"]

OSM_INFO = DatasetInfo(
    id="openstreetmap",
    name="OpenStreetMap",
    provider="Colaboradores de OpenStreetMap · Overpass API",
    attribution="Caminos, agua y edificaciones: © OpenStreetMap contributors (ODbL)",
    citation="OpenStreetMap contributors. https://www.openstreetmap.org",
    license="Open Database License (ODbL) 1.0",
    license_url="https://www.openstreetmap.org/copyright",
    source_url="https://www.openstreetmap.org",
    resolution_m=None,
    vertical_datum=None,
    acquired="Instantánea con la fecha de los datos indicada",
    notes=(
        "Datos colaborativos: la cobertura y la exactitud varían. No incluye cultivos ni "
        "anchos medidos; el ancho de los caminos se estima por categoría."
    ),
)

ROAD_TYPES = frozenset(
    {
        "motorway",
        "trunk",
        "primary",
        "secondary",
        "tertiary",
        "unclassified",
        "residential",
        "service",
        "living_street",
        "motorway_link",
        "trunk_link",
        "primary_link",
        "secondary_link",
        "tertiary_link",
        "road",
    }
)
PATH_TYPES = frozenset({"path", "footway", "bridleway", "cycleway", "steps", "pedestrian"})
WATERWAY_TYPES = frozenset({"river", "stream", "canal", "ditch", "drain", "brook"})
LANDUSE_TYPES = frozenset(
    {
        "farmland",
        "orchard",
        "vineyard",
        "meadow",
        "grass",
        "forest",
        "residential",
        "farmyard",
        "greenhouse_horticulture",
        "industrial",
        "quarry",
        "reservoir",
        "basin",
    }
)
KEPT_TAGS = (
    "highway",
    "waterway",
    "natural",
    "water",
    "landuse",
    "building",
    "railway",
    "surface",
    "tracktype",
    "intermittent",
    "seasonal",
    "width",
    "lanes",
    "layer",
    "bridge",
    "tunnel",
    "name",
)

MAX_FEATURES = 20_000


@dataclass(frozen=True, slots=True)
class OsmFeature:
    id: str
    kind: FeatureKind
    subtype: str
    geometry_type: GeometryType
    coordinates: tuple[tuple[float, float], ...]  # (longitud, latitud)
    tags: dict[str, str]


def overpass_query(bbox: BBox, timeout_s: int = 60) -> str:
    """Consulta acotada al área: solo las categorías que representa la escena."""
    box = f"{bbox.south:.6f},{bbox.west:.6f},{bbox.north:.6f},{bbox.east:.6f}"
    return (
        f"[out:json][timeout:{timeout_s}][bbox:{box}];\n"
        "(\n"
        '  way["highway"];\n'
        '  way["waterway"];\n'
        '  way["natural"="water"];\n'
        '  way["landuse"="reservoir"];\n'
        '  way["building"];\n'
        '  way["landuse"];\n'
        '  way["railway"="rail"];\n'
        ");\n"
        "out tags geom qt;"
    )


def classify(tags: dict[str, str], closed: bool) -> tuple[FeatureKind, str, GeometryType] | None:
    """Categoría de la escena para un elemento OSM, o ``None`` si no se representa."""
    highway = tags.get("highway")
    if highway is not None and tags.get("area") != "yes":
        if highway in ROAD_TYPES:
            return ("road", highway, "LineString")
        if highway == "track":
            return ("track", tags.get("tracktype", "track"), "LineString")
        if highway in PATH_TYPES:
            return ("path", highway, "LineString")
        return None
    waterway = tags.get("waterway")
    if waterway in WATERWAY_TYPES and not closed:
        return ("waterway", waterway, "LineString")
    if closed and (tags.get("natural") == "water" or tags.get("landuse") in ("reservoir", "basin")):
        return ("water", tags.get("water", tags.get("landuse", "water")), "Polygon")
    if closed and "building" in tags:
        return ("building", tags["building"], "Polygon")
    if closed and tags.get("landuse") in LANDUSE_TYPES:
        return ("landuse", tags["landuse"], "Polygon")
    if tags.get("railway") == "rail" and not closed:
        return ("railway", "rail", "LineString")
    return None


def parse_overpass(payload: dict[str, Any]) -> tuple[list[OsmFeature], str | None]:
    """Convierte la respuesta ``out geom`` de Overpass. Devuelve los elementos y la fecha OSM."""
    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise ValueError("Respuesta de Overpass sin elementos")
    features: list[OsmFeature] = []
    for element in elements:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue
        geometry = element.get("geometry")
        raw_tags = element.get("tags")
        if not isinstance(geometry, list) or not isinstance(raw_tags, dict) or len(geometry) < 2:
            continue
        coordinates: list[tuple[float, float]] = []
        for node in geometry:
            if not isinstance(node, dict):
                break
            lon, lat = node.get("lon"), node.get("lat")
            if not isinstance(lon, int | float) or not isinstance(lat, int | float):
                break
            if not (math.isfinite(lon) and math.isfinite(lat)):
                break
            coordinates.append((round(float(lon), 7), round(float(lat), 7)))
        else:
            tags = {k: str(v) for k, v in raw_tags.items() if k in KEPT_TAGS}
            closed = len(coordinates) >= 4 and coordinates[0] == coordinates[-1]
            category = classify(tags, closed)
            if category is None:
                continue
            kind, subtype, geometry_type = category
            features.append(
                OsmFeature(
                    id=f"way/{element.get('id')}",
                    kind=kind,
                    subtype=subtype,
                    geometry_type=geometry_type,
                    coordinates=tuple(coordinates),
                    tags=tags,
                )
            )
            if len(features) >= MAX_FEATURES:
                break
    osm3s = payload.get("osm3s")
    timestamp = osm3s.get("timestamp_osm_base") if isinstance(osm3s, dict) else None
    return features, timestamp if isinstance(timestamp, str) else None


def intersects(feature: OsmFeature, bbox: BBox) -> bool:
    lons = [lon for lon, _ in feature.coordinates]
    lats = [lat for _, lat in feature.coordinates]
    return not (
        max(lons) < bbox.west
        or min(lons) > bbox.east
        or max(lats) < bbox.south
        or min(lats) > bbox.north
    )


def feature_to_json(feature: OsmFeature) -> dict[str, Any]:
    return {
        "id": feature.id,
        "kind": feature.kind,
        "subtype": feature.subtype,
        "geometryType": feature.geometry_type,
        "coordinates": [list(point) for point in feature.coordinates],
        "tags": feature.tags,
    }


def feature_from_json(data: dict[str, Any]) -> OsmFeature:
    return OsmFeature(
        id=str(data["id"]),
        kind=data["kind"],
        subtype=str(data["subtype"]),
        geometry_type=data["geometryType"],
        coordinates=tuple((float(lon), float(lat)) for lon, lat in data["coordinates"]),
        tags={str(k): str(v) for k, v in data["tags"].items()},
    )
