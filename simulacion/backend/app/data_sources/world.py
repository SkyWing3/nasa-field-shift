"""Servicio de datos geográficos para generar el mundo 3D (elevación, cobertura y elementos)."""

from dataclasses import dataclass
from pathlib import Path

import httpx2

from app.core.config import Settings
from app.data_sources.elevation import NasademProvider
from app.data_sources.landcover import WorldCoverProvider
from app.data_sources.osm import OsmFeatureProvider, OsmSnapshotStore, OverpassClient
from app.data_sources.raster import RangeCache


@dataclass(slots=True)
class WorldDataService:
    elevation: NasademProvider
    landcover: WorldCoverProvider
    features: OsmFeatureProvider
    client: httpx2.AsyncClient
    offline: bool

    async def close(self) -> None:
        await self.client.aclose()
        if self.features.overpass is not None:
            await self.features.overpass.close()


def world_paths(data_dir: Path) -> tuple[Path, Path]:
    """Directorios de la caché de rangos COG y de las instantáneas OSM."""
    return data_dir / "cache", data_dir / "osm"


def create_world_service(settings: Settings) -> WorldDataService:
    cache_dir, snapshot_dir = world_paths(settings.world_data_dir)
    cache = RangeCache(cache_dir)
    client = httpx2.AsyncClient(timeout=httpx2.Timeout(30.0, connect=8.0))
    overpass = None
    if settings.overpass_url:
        overpass = OverpassClient(
            httpx2.AsyncClient(timeout=httpx2.Timeout(90.0, connect=8.0)),
            settings.overpass_url,
            settings.overpass_user_agent,
        )
    return WorldDataService(
        elevation=NasademProvider(
            client, cache, base_url=settings.elevation_url, offline=settings.world_offline
        ),
        landcover=WorldCoverProvider(
            client, cache, base_url=settings.landcover_url, offline=settings.world_offline
        ),
        features=OsmFeatureProvider(OsmSnapshotStore(snapshot_dir), overpass),
        client=client,
        offline=settings.world_offline,
    )
