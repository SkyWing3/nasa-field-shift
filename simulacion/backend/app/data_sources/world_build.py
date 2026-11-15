"""Prepara los datos de una región para generar su mundo 3D sin depender de la red.

Uso (``make worlddata`` usa la región demostrativa del Valle Alto de Cochabamba)::

    python -m app.data_sources.world_build --name cochabamba-valle-alto-demo \\
        --lat -17.551334 --lon -65.861983

1. Lee de NASADEM (OpenTopography) y ESA WorldCover (AWS) solo los mosaicos COG que cubren
   la región ampliada y los guarda en la caché de rangos (``backend/data/world/cache``).
2. Descarga **una sola vez** los elementos de OpenStreetMap del área de detalle desde la
   instancia pública de Overpass y los guarda como instantánea (``backend/data/world/osm``).
   Si la instantánea ya existe no se repite la consulta (``--refresh-osm`` para forzarla).
"""

import argparse
import asyncio
import json
import math
from datetime import UTC, datetime
from pathlib import Path

import httpx2

from app.core.config import get_settings
from app.data_sources.elevation import NasademProvider
from app.data_sources.landcover import WorldCoverProvider
from app.data_sources.osm import OsmSnapshot, OsmSnapshotStore, OverpassClient
from app.data_sources.raster import BBox, RangeCache
from app.data_sources.raster.sources import DEFAULT_USER_AGENT
from app.data_sources.world import world_paths

PUBLIC_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
METERS_PER_DEGREE_LAT = 111_320.0


def bbox_around(lat: float, lon: float, half_m: float) -> BBox:
    dlat = half_m / METERS_PER_DEGREE_LAT
    dlon = half_m / (METERS_PER_DEGREE_LAT * math.cos(math.radians(lat)))
    return BBox(lat - dlat, lon - dlon, lat + dlat, lon + dlon)


def _cache_bytes(directory: Path) -> int:
    return sum(path.stat().st_size for path in directory.rglob("*") if path.is_file())


async def prepare(
    name: str,
    lat: float,
    lon: float,
    *,
    context_half_m: float,
    osm_half_m: float,
    refresh_osm: bool,
) -> dict[str, object]:
    settings = get_settings()
    cache_dir, snapshot_dir = world_paths(settings.world_data_dir)
    cache = RangeCache(cache_dir)
    context = bbox_around(lat, lon, context_half_m)
    detail = bbox_around(lat, lon, osm_half_m)
    report: dict[str, object] = {"name": name, "center": [lat, lon]}
    async with httpx2.AsyncClient(timeout=httpx2.Timeout(60.0, connect=10.0)) as client:
        dem = await NasademProvider(client, cache, base_url=settings.elevation_url).read(
            context, 4096
        )
        report["elevation"] = {
            "bbox": [context.south, context.west, context.north, context.east],
            "shape": list(dem.raster.data.shape),
            "tiles": list(dem.tiles_read),
            "voidFraction": dem.void_fraction,
        }
        landcover = WorldCoverProvider(client, cache, base_url=settings.landcover_url)
        # Resolución completa y las vistas reducidas que puede pedir el frontend.
        levels = []
        for max_size in (4096, 1200, 600):
            raster, tiles = await landcover.read(context, max_size)
            levels.append(
                {"maxSize": max_size, "shape": list(raster.data.shape), "tiles": list(tiles)}
            )
        report["landcover"] = levels

    store = OsmSnapshotStore(snapshot_dir)
    existing = store.find(detail)
    if existing is not None and not refresh_osm:
        report["osm"] = {
            "snapshot": existing.id,
            "features": len(existing.features),
            "reused": True,
        }
    else:
        async with httpx2.AsyncClient(timeout=httpx2.Timeout(120.0, connect=10.0)) as client:
            overpass = OverpassClient(client, PUBLIC_OVERPASS_URL, DEFAULT_USER_AGENT)
            features, timestamp = await overpass.fetch(detail)
        snapshot = OsmSnapshot(
            id=name,
            bbox=detail,
            osm_timestamp=timestamp,
            fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
            source_url=PUBLIC_OVERPASS_URL,
            features=tuple(features),
        )
        store.save(snapshot)
        report["osm"] = {
            "snapshot": snapshot.id,
            "features": len(features),
            "osmTimestamp": timestamp,
            "reused": False,
        }
    report["cacheBytes"] = _cache_bytes(cache_dir)
    report["preparedAt"] = datetime.now(UTC).isoformat(timespec="seconds")
    manifest = settings.world_data_dir / "manifest.json"
    entries: dict[str, object] = {}
    if manifest.exists():
        entries = json.loads(manifest.read_text(encoding="utf-8"))
    entries[name] = report
    manifest.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument("--name", required=True)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument(
        "--context-km", type=float, default=16.0, help="Semilado del área de relieve"
    )
    parser.add_argument("--osm-km", type=float, default=3.0, help="Semilado del área OSM")
    parser.add_argument("--refresh-osm", action="store_true")
    args = parser.parse_args()
    report = asyncio.run(
        prepare(
            args.name,
            args.lat,
            args.lon,
            context_half_m=args.context_km * 1000,
            osm_half_m=args.osm_km * 1000,
            refresh_osm=args.refresh_osm,
        )
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
