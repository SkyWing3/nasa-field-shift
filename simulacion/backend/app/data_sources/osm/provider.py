"""Origen de los elementos OSM: instantáneas locales y, opcionalmente, una instancia Overpass.

Las instancias públicas de Overpass piden no usarse como backend de aplicaciones para el
público general (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Por eso:

- La región demostrativa usa una **instantánea** descargada una sola vez con ``make worlddata``.
- Para otras regiones, la consulta en vivo está **desactivada** salvo que se configure
  ``TERRALAB_OVERPASS_URL`` (idealmente una instancia propia). Cada respuesta se guarda como
  instantánea y nunca se repite la misma consulta.
"""

import asyncio
import json
import os
import tempfile
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import httpx2

from app.data_sources.osm.features import (
    OsmFeature,
    feature_from_json,
    feature_to_json,
    intersects,
    overpass_query,
    parse_overpass,
)
from app.data_sources.osm.vectortiles import OPENFREEMAP_TILEJSON, VectorTileProvider
from app.data_sources.raster import BBox, RangeSourceError

SNAPSHOT_SCHEMA = 1
MIN_INTERVAL_S = 10.0
MAX_LIVE_BBOX_DEG = 0.08


class OsmUnavailableError(Exception):
    """No hay datos OSM para el área y la consulta en vivo está desactivada."""


class OsmUpstreamError(Exception):
    """La instancia Overpass respondió con un error."""


class OsmTimeoutError(Exception):
    """La instancia Overpass no respondió a tiempo."""


@dataclass(frozen=True, slots=True)
class OsmSnapshot:
    id: str
    bbox: BBox
    osm_timestamp: str | None
    fetched_at: str
    source_url: str
    features: tuple[OsmFeature, ...]

    def contains(self, bbox: BBox) -> bool:
        return (
            self.bbox.south <= bbox.south
            and self.bbox.west <= bbox.west
            and self.bbox.north >= bbox.north
            and self.bbox.east >= bbox.east
        )


@dataclass(frozen=True, slots=True)
class FeatureResult:
    origin: Literal["vectortiles", "snapshot", "overpass"]
    snapshot: OsmSnapshot
    features: tuple[OsmFeature, ...]


class OsmSnapshotStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self._loaded: dict[Path, tuple[float, OsmSnapshot]] = {}

    def save(self, snapshot: OsmSnapshot) -> Path:
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self.directory / f"{snapshot.id}.json"
        payload = {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "id": snapshot.id,
            "bbox": [
                snapshot.bbox.south,
                snapshot.bbox.west,
                snapshot.bbox.north,
                snapshot.bbox.east,
            ],
            "osmTimestamp": snapshot.osm_timestamp,
            "fetchedAt": snapshot.fetched_at,
            "sourceUrl": snapshot.source_url,
            "license": "ODbL 1.0 · © OpenStreetMap contributors",
            "features": [feature_to_json(feature) for feature in snapshot.features],
        }
        handle, temporary = tempfile.mkstemp(dir=self.directory, prefix=".tmp-")
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        return path

    def _load(self, path: Path) -> OsmSnapshot | None:
        mtime = path.stat().st_mtime
        cached = self._loaded.get(path)
        if cached is not None and cached[0] == mtime:
            return cached[1]
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("schemaVersion") != SNAPSHOT_SCHEMA:
                return None
            south, west, north, east = (float(v) for v in data["bbox"])
            snapshot = OsmSnapshot(
                id=str(data["id"]),
                bbox=BBox(south, west, north, east),
                osm_timestamp=data.get("osmTimestamp"),
                fetched_at=str(data["fetchedAt"]),
                source_url=str(data["sourceUrl"]),
                features=tuple(feature_from_json(item) for item in data["features"]),
            )
        except (OSError, ValueError, KeyError, TypeError):
            return None
        self._loaded[path] = (mtime, snapshot)
        return snapshot

    def find(self, bbox: BBox) -> OsmSnapshot | None:
        if not self.directory.is_dir():
            return None
        candidates = []
        for path in sorted(self.directory.glob("*.json")):
            snapshot = self._load(path)
            if snapshot is not None and snapshot.contains(bbox):
                candidates.append(snapshot)
        # La instantánea más reciente que cubre el área.
        return max(candidates, key=lambda s: s.fetched_at, default=None)


class OverpassClient:
    def __init__(
        self,
        client: httpx2.AsyncClient,
        url: str,
        user_agent: str,
        *,
        min_interval_s: float = MIN_INTERVAL_S,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if not url.startswith("https://"):
            raise ValueError("La URL de Overpass debe usar HTTPS")
        self._client = client
        self.url = url
        self._user_agent = user_agent
        self._min_interval_s = min_interval_s
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self._last: float | None = None

    async def fetch(self, bbox: BBox) -> tuple[list[OsmFeature], str | None]:
        async with self._lock:
            if self._last is not None:
                wait = self._min_interval_s - (self._clock() - self._last)
                if wait > 0:
                    await self._sleep(wait)
            self._last = self._clock()
            try:
                response = await self._client.post(
                    self.url,
                    data={"data": overpass_query(bbox)},
                    headers={"User-Agent": self._user_agent},
                )
            except httpx2.TimeoutException as error:
                raise OsmTimeoutError("Overpass no respondió a tiempo.") from error
            except httpx2.RequestError as error:
                raise OsmUpstreamError("No se pudo conectar con Overpass.") from error
        if response.status_code != 200:
            raise OsmUpstreamError(f"Overpass respondió con el estado {response.status_code}.")
        try:
            return parse_overpass(response.json())
        except ValueError as error:
            raise OsmUpstreamError("Respuesta de Overpass no válida.") from error

    async def close(self) -> None:
        await self._client.aclose()


def snapshot_id_for(bbox: BBox) -> str:
    return (
        f"area_{bbox.south:+.4f}_{bbox.west:+.4f}_{bbox.north:+.4f}_{bbox.east:+.4f}".replace(
            "+", "p"
        )
        .replace("-", "m")
        .replace(".", "_")
    )


class OsmFeatureProvider:
    """Cadena de orígenes: teselas vectoriales de OpenFreeMap (cualquier región, con caché) →
    instantánea local → Overpass si está configurado."""

    def __init__(
        self,
        store: OsmSnapshotStore,
        overpass: OverpassClient | None,
        vector_tiles: VectorTileProvider | None = None,
    ) -> None:
        self.store = store
        self.overpass = overpass
        self.vector_tiles = vector_tiles

    @property
    def live_enabled(self) -> bool:
        return self.overpass is not None

    async def features(self, bbox: BBox, zoom: int = 14) -> FeatureResult:
        vector_error: Exception | None = None
        if self.vector_tiles is not None:
            try:
                result = await self.vector_tiles.features(bbox, zoom)
            except (RangeSourceError, httpx2.HTTPError) as error:
                vector_error = error
            else:
                snapshot = OsmSnapshot(
                    id=f"openfreemap-z{result.zoom}",
                    bbox=bbox,
                    osm_timestamp=result.data_date,
                    fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
                    source_url=OPENFREEMAP_TILEJSON,
                    features=tuple(result.features),
                )
                selected = tuple(f for f in result.features if intersects(f, bbox))
                return FeatureResult("vectortiles", snapshot, selected)
        stored = self.store.find(bbox)
        if stored is not None:
            selected = tuple(f for f in stored.features if intersects(f, bbox))
            return FeatureResult("snapshot", stored, selected)
        if self.overpass is None:
            detail = "" if vector_error is None else f" ({vector_error})"
            raise OsmUnavailableError(
                "No se pudieron obtener los elementos de OpenStreetMap para esta área"
                + detail
                + "."
            )
        if bbox.width > MAX_LIVE_BBOX_DEG or bbox.height > MAX_LIVE_BBOX_DEG:
            raise OsmUnavailableError("El área es demasiado grande para consultar Overpass.")
        features, timestamp = await self.overpass.fetch(bbox)
        snapshot = OsmSnapshot(
            id=snapshot_id_for(bbox),
            bbox=bbox,
            osm_timestamp=timestamp,
            fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
            source_url=self.overpass.url,
            features=tuple(features),
        )
        self.store.save(snapshot)
        return FeatureResult("overpass", snapshot, snapshot.features)
