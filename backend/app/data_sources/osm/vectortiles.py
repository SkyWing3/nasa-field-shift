"""Elementos geográficos de cualquier región desde las teselas vectoriales de OpenFreeMap.

OpenFreeMap sirve teselas OpenMapTiles generadas a partir de OpenStreetMap (ODbL), las mismas
que dibuja el mapa base. Sus condiciones (https://openfreemap.org/tos/) permiten descargar
áreas para uso sin conexión si cada descarga tiene como máximo 3 000 teselas o 50 MB, usa como
máximo 4 peticiones paralelas y envía un User-Agent propio. Cada mundo usa unas 10 a 25 teselas
(zoom 14 en el área de detalle y zoom 11 en el contexto), que se guardan en caché en disco.
"""

import asyncio
import json
import math
import re
import time
from dataclasses import dataclass

import httpx2

from app.data_sources.osm.features import OsmFeature
from app.data_sources.osm.mvt import MvtError, MvtFeature, decode_tile, ring_area
from app.data_sources.raster import BBox, RangeSourceError
from app.data_sources.raster.sources import DEFAULT_USER_AGENT, BlobCache, fetch_blob

OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet"
MAX_TILES_PER_REQUEST = 48
TILEJSON_TTL_S = 24 * 3600

ROAD_CLASSES = {
    "motorway": "motorway",
    "trunk": "trunk",
    "primary": "primary",
    "secondary": "secondary",
    "tertiary": "tertiary",
    "minor": "minor",
    "service": "service",
    "busway": "service",
}
LANDCOVER_CLASSES = {
    "wood": "forest",
    "farmland": "farmland",
    "grass": "grass",
    "wetland": "wetland",
    "sand": "sand",
    "rock": "rock",
    "ice": "ice",
}
PLACE_CLASSES = frozenset(
    {"city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood"}
)


@dataclass(frozen=True, slots=True)
class VectorTileResult:
    features: list[OsmFeature]
    tiles: int
    data_date: str | None
    zoom: int


def tiles_for(bbox: BBox, zoom: int) -> list[tuple[int, int]]:
    """Teselas XYZ (Web Mercator) que cubren el área."""
    n = 2**zoom

    def tile_x(lon: float) -> int:
        return int(min(n - 1, max(0, math.floor((lon + 180) / 360 * n))))

    def tile_y(lat: float) -> int:
        lat = max(-85.05112878, min(85.05112878, lat))
        rad = math.radians(lat)
        return int(
            min(n - 1, max(0, math.floor((1 - math.asinh(math.tan(rad)) / math.pi) / 2 * n)))
        )

    x0, x1 = tile_x(bbox.west), tile_x(bbox.east)
    y0, y1 = tile_y(bbox.north), tile_y(bbox.south)
    return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


def tile_point_to_lonlat(
    z: int, x: int, y: int, extent: int, px: float, py: float
) -> tuple[float, float]:
    n = 2**z
    lon = (x + px / extent) / n * 360 - 180
    merc = math.pi * (1 - 2 * (y + py / extent) / n)
    lat = math.degrees(math.atan(math.sinh(merc)))
    return round(lon, 7), round(lat, 7)


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _flag(value: object) -> bool:
    return value in (1, True, "1", "yes")


def _classify(layer: str, feature: MvtFeature) -> tuple[str, str] | None:
    """(kind, subtype) de la escena para una entidad de OpenMapTiles, o ``None``."""
    tags = feature.tags
    cls = _text(tags.get("class")) or ""
    if layer == "transportation" and feature.kind == "LineString":
        if tags.get("brunnel") == "tunnel":
            return None
        if cls in ROAD_CLASSES:
            return ("road", ROAD_CLASSES[cls])
        if cls == "track":
            return ("track", "track")
        if cls == "path":
            return ("path", _text(tags.get("subclass")) or "path")
        if cls in ("rail", "transit") and tags.get("subclass") in (
            "rail",
            "light_rail",
            "narrow_gauge",
        ):
            return ("railway", "rail")
        return None
    if layer == "building" and feature.kind == "Polygon":
        return None if _flag(tags.get("hide_3d")) else ("building", "yes")
    if layer == "water" and feature.kind == "Polygon":
        return ("water", cls or "water") if cls != "swimming_pool" else None
    if layer == "waterway" and feature.kind == "LineString":
        if tags.get("brunnel") == "tunnel":
            return None
        return ("waterway", cls) if cls in ("river", "stream", "canal", "drain", "ditch") else None
    if layer == "landuse" and feature.kind == "Polygon":
        return ("landuse", cls) if cls else None
    if layer == "landcover" and feature.kind == "Polygon":
        return ("landuse", LANDCOVER_CLASSES[cls]) if cls in LANDCOVER_CLASSES else None
    if layer == "park" and feature.kind == "Polygon":
        return ("landuse", "park")
    if layer == "place" and feature.kind == "Point":
        return ("place", cls) if cls in PLACE_CLASSES else None
    return None


def _tags(layer: str, feature: MvtFeature) -> dict[str, str]:
    tags = feature.tags
    out: dict[str, str] = {}
    name = _text(tags.get("name:es")) or _text(tags.get("name"))
    if name is not None:
        out["name"] = name
    surface = _text(tags.get("surface"))
    if surface is not None:
        out["surface"] = surface
    if _flag(tags.get("intermittent")):
        out["intermittent"] = "yes"
    if layer == "building":
        for source, target in (("render_height", "height"), ("render_min_height", "min_height")):
            value = tags.get(source)
            if isinstance(value, int | float) and not isinstance(value, bool):
                out[target] = f"{float(value):g}"
    if layer == "transportation" and tags.get("brunnel") == "bridge":
        out["bridge"] = "yes"
    if layer == "place" and isinstance(tags.get("rank"), int):
        out["rank"] = str(tags["rank"])
    return out


def features_from_tile(z: int, x: int, y: int, data: bytes) -> list[OsmFeature]:
    out: list[OsmFeature] = []
    for layer in decode_tile(data):
        extent = layer.extent
        for index, feature in enumerate(layer.features):
            category = _classify(layer.name, feature)
            if category is None:
                continue
            kind, subtype = category
            tags = _tags(layer.name, feature)
            base_id = (
                f"vt/{z}/{x}/{y}/{layer.name}/{feature.id if feature.id is not None else index}"
            )
            if feature.kind == "Polygon":
                # Anillos exteriores (área positiva en coordenadas de tesela) con sus agujeros.
                polygons: list[tuple[list[tuple[int, int]], list[list[tuple[int, int]]]]] = []
                for ring in feature.parts:
                    if len(ring) < 4:
                        continue
                    if ring_area(ring) > 0 or not polygons:
                        polygons.append((ring, []))
                    else:
                        polygons[-1][1].append(ring)
                for k, (ring, holes) in enumerate(polygons):
                    if kind == "building":
                        # Una edificación cortada por el borde se conserva solo en la tesela que
                        # contiene su centroide (evita duplicados en el margen de las teselas).
                        cx = sum(p[0] for p in ring) / len(ring)
                        cy = sum(p[1] for p in ring) / len(ring)
                        if not (0 <= cx < extent and 0 <= cy < extent):
                            continue
                    coordinates = tuple(
                        tile_point_to_lonlat(z, x, y, extent, px, py) for px, py in ring
                    )
                    hole_coords = tuple(
                        tuple(tile_point_to_lonlat(z, x, y, extent, px, py) for px, py in hole)
                        for hole in holes
                        if len(hole) >= 4
                    )
                    out.append(
                        OsmFeature(
                            id=f"{base_id}/{k}",
                            kind=kind,  # type: ignore[arg-type]
                            subtype=subtype,
                            geometry_type="Polygon",
                            coordinates=coordinates,
                            tags=tags,
                            holes=hole_coords,
                        )
                    )
            else:
                for k, part in enumerate(feature.parts):
                    if feature.kind == "Point":
                        px, py = part[0]
                        if not (0 <= px < extent and 0 <= py < extent):
                            continue
                    elif len(part) < 2:
                        continue
                    out.append(
                        OsmFeature(
                            id=f"{base_id}/{k}",
                            kind=kind,  # type: ignore[arg-type]
                            subtype=subtype,
                            geometry_type="Point" if feature.kind == "Point" else "LineString",
                            coordinates=tuple(
                                tile_point_to_lonlat(z, x, y, extent, px, py) for px, py in part
                            ),
                            tags=tags,
                        )
                    )
    return out


class VectorTileProvider:
    name = "openfreemap"

    def __init__(
        self,
        client: httpx2.AsyncClient,
        cache: BlobCache | None,
        *,
        tilejson_url: str = OPENFREEMAP_TILEJSON,
        offline: bool = False,
    ) -> None:
        self._client = client
        self._cache = cache
        self._tilejson_url = tilejson_url
        self._offline = offline
        self._limiter = asyncio.Semaphore(4)  # condición de OpenFreeMap: ≤ 4 peticiones paralelas
        self._template: tuple[float, str] | None = None
        self._lock = asyncio.Lock()

    async def _tile_template(self) -> str:
        async with self._lock:
            now = time.monotonic()
            if self._template is not None and now - self._template[0] < TILEJSON_TTL_S:
                return self._template[1]
            raw: bytes | None = None
            if not self._offline:
                try:
                    async with self._limiter:
                        response = await self._client.get(
                            self._tilejson_url, headers={"User-Agent": DEFAULT_USER_AGENT}
                        )
                    if response.status_code == 200:
                        raw = response.content
                        if self._cache is not None:
                            self._cache.put(f"tilejson|{self._tilejson_url}", raw)
                except httpx2.HTTPError:
                    raw = None
            if raw is None and self._cache is not None:
                raw = self._cache.get(f"tilejson|{self._tilejson_url}")
            if raw is None:
                raise RangeSourceError(
                    "No se pudo obtener la descripción de las teselas de OpenFreeMap"
                )
            tiles = json.loads(raw).get("tiles")
            if not isinstance(tiles, list) or not tiles or not isinstance(tiles[0], str):
                raise RangeSourceError("Descripción de teselas de OpenFreeMap no válida")
            self._template = (now, tiles[0])
            return tiles[0]

    async def features(self, bbox: BBox, zoom: int) -> VectorTileResult:
        coords = tiles_for(bbox, zoom)
        if len(coords) > MAX_TILES_PER_REQUEST:
            raise ValueError("El área necesita demasiadas teselas vectoriales")
        template = await self._tile_template()

        async def load(x: int, y: int) -> list[OsmFeature]:
            url = template.replace("{z}", str(zoom)).replace("{x}", str(x)).replace("{y}", str(y))
            data = await fetch_blob(
                self._client,
                url,
                cache=self._cache,
                offline=self._offline,
                limiter=self._limiter,
                accept_missing=True,
            )
            if not data:
                return []
            try:
                return features_from_tile(zoom, x, y, data)
            except MvtError as error:
                raise RangeSourceError(f"Tesela vectorial no válida: {url}") from error

        results = await asyncio.gather(*(load(x, y) for x, y in coords))
        match = re.search(r"/(\d{4})(\d{2})(\d{2})_", template)
        date = f"{match.group(1)}-{match.group(2)}-{match.group(3)}" if match else None
        return VectorTileResult(
            features=[feature for chunk in results for feature in chunk],
            tiles=len(coords),
            data_date=date,
            zoom=zoom,
        )
