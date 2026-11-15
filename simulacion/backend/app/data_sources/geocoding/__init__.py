"""Búsqueda geográfica con proveedores intercambiables (ADR-028)."""

import httpx2

from app.core.config import Settings
from app.data_sources.geocoding.base import (
    GeocodingError,
    GeocodingProvider,
    GeocodingTimeoutError,
    GeocodingUnavailableError,
    GeocodingUpstreamError,
    Place,
)
from app.data_sources.geocoding.gazetteer import GeoNamesGazetteer
from app.data_sources.geocoding.nominatim import NominatimGeocoder

__all__ = [
    "DisabledGeocoder",
    "GeoNamesGazetteer",
    "GeocodingError",
    "GeocodingProvider",
    "GeocodingTimeoutError",
    "GeocodingUnavailableError",
    "GeocodingUpstreamError",
    "NominatimGeocoder",
    "Place",
    "create_geocoder",
]


class DisabledGeocoder:
    name = "disabled"
    attribution = ""
    attribution_url = ""

    def is_available(self) -> bool:
        return False

    async def search(self, query: str, limit: int) -> list[Place]:
        raise GeocodingUnavailableError(
            "La búsqueda de lugares está desactivada en la configuración."
        )


def create_geocoder(settings: Settings) -> GeocodingProvider:
    """Elige el proveedor según ``TERRALAB_GEOCODER``; cambiarlo no requiere tocar el frontend."""
    if settings.geocoder == "geonames":
        return GeoNamesGazetteer(settings.gazetteer_path)
    if settings.geocoder == "nominatim":
        client = httpx2.AsyncClient(timeout=httpx2.Timeout(8.0, connect=4.0))
        return NominatimGeocoder(client, settings.nominatim_url, settings.nominatim_user_agent)
    return DisabledGeocoder()
