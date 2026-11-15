"""Elementos geográficos de OpenStreetMap (instantáneas y Overpass opcional)."""

from app.data_sources.osm.features import OSM_INFO, OsmFeature, feature_to_json
from app.data_sources.osm.provider import (
    FeatureResult,
    OsmFeatureProvider,
    OsmSnapshot,
    OsmSnapshotStore,
    OsmTimeoutError,
    OsmUnavailableError,
    OsmUpstreamError,
    OverpassClient,
)

__all__ = [
    "OSM_INFO",
    "FeatureResult",
    "OsmFeature",
    "OsmFeatureProvider",
    "OsmSnapshot",
    "OsmSnapshotStore",
    "OsmTimeoutError",
    "OsmUnavailableError",
    "OsmUpstreamError",
    "OverpassClient",
    "feature_to_json",
]
