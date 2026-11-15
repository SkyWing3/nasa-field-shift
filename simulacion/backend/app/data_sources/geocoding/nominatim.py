"""Adaptador opcional para Nominatim (OpenStreetMap).

**Desactivado por defecto.** La política de uso del servicio público
(https://operations.osmfoundation.org/policies/nominatim/) permite usarlo solo si quien
desarrolla la aplicación lo decide de forma deliberada e informada y se responsabiliza de
cumplirla. Este adaptador aplica las condiciones técnicas: máximo 1 petición por segundo en
total, User-Agent propio obligatorio, caché de resultados, búsqueda solo por acción explícita
(nunca autocompletado) y URL configurable para poder cambiar de servicio sin actualizar el
software. La atribución «© OpenStreetMap contributors» se muestra junto a los resultados.
"""

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable

import httpx2

from app.data_sources.geocoding.base import (
    GeocodingTimeoutError,
    GeocodingUpstreamError,
    Place,
    PlaceKind,
    normalize_text,
)

MIN_INTERVAL_S = 1.0
CACHE_TTL_S = 24 * 3600
CACHE_SIZE = 512


def _kind(category: str) -> PlaceKind:
    if category == "place":
        return "populated-place"
    if category == "boundary":
        return "administrative"
    return "other"


class NominatimGeocoder:
    name = "nominatim"
    attribution = "© OpenStreetMap contributors (ODbL) · Nominatim"
    attribution_url = "https://www.openstreetmap.org/copyright"

    def __init__(
        self,
        client: httpx2.AsyncClient,
        base_url: str,
        user_agent: str,
        *,
        min_interval_s: float = MIN_INTERVAL_S,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if min_interval_s < MIN_INTERVAL_S:
            raise ValueError("Nominatim admite como máximo 1 petición por segundo")
        if not user_agent.strip():
            raise ValueError("Nominatim exige un User-Agent que identifique la aplicación")
        self._client = client
        self._base_url = base_url.rstrip("/")
        self._user_agent = user_agent
        self._min_interval_s = min_interval_s
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self._last_request: float | None = None
        self._cache: OrderedDict[tuple[str, int], tuple[float, list[Place]]] = OrderedDict()

    def is_available(self) -> bool:
        return True

    async def close(self) -> None:
        await self._client.aclose()

    def _cached(self, key: tuple[str, int]) -> list[Place] | None:
        entry = self._cache.get(key)
        if entry is None:
            return None
        stored_at, places = entry
        if self._clock() - stored_at > CACHE_TTL_S:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return places

    def _store(self, key: tuple[str, int], places: list[Place]) -> None:
        self._cache[key] = (self._clock(), places)
        self._cache.move_to_end(key)
        while len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)

    async def search(self, query: str, limit: int) -> list[Place]:
        key = (normalize_text(query), limit)
        cached = self._cached(key)
        if cached is not None:
            return cached
        # Un único cerrojo: todas las peticiones de la aplicación respetan el intervalo mínimo.
        async with self._lock:
            cached = self._cached(key)
            if cached is not None:
                return cached
            if self._last_request is not None:
                wait = self._min_interval_s - (self._clock() - self._last_request)
                if wait > 0:
                    await self._sleep(wait)
            try:
                response = await self._client.get(
                    f"{self._base_url}/search",
                    params={
                        "q": query,
                        "format": "jsonv2",
                        "limit": str(limit),
                        "accept-language": "es",
                    },
                    headers={"User-Agent": self._user_agent},
                )
            except httpx2.TimeoutException as error:
                raise GeocodingTimeoutError("Nominatim no respondió a tiempo") from error
            except httpx2.RequestError as error:
                raise GeocodingUpstreamError("No se pudo contactar con Nominatim") from error
            finally:
                self._last_request = self._clock()
            if response.status_code != 200:
                raise GeocodingUpstreamError(f"Nominatim respondió HTTP {response.status_code}")
            places = self._parse(response)
            self._store(key, places)
            return places

    @staticmethod
    def _parse(response: httpx2.Response) -> list[Place]:
        try:
            payload = response.json()
            if not isinstance(payload, list):
                raise TypeError("se esperaba una lista")
            places = []
            for item in payload:
                places.append(
                    Place(
                        id=f"osm:{item['osm_type']}/{item['osm_id']}",
                        name=item.get("name") or item["display_name"].split(",")[0],
                        region=", ".join(item["display_name"].split(", ")[1:3]) or None,
                        country_code=None,
                        latitude=float(item["lat"]),
                        longitude=float(item["lon"]),
                        kind=_kind(item.get("category", "")),
                        population=None,
                    )
                )
            return places
        except (ValueError, KeyError, TypeError) as error:
            raise GeocodingUpstreamError("Respuesta de Nominatim no válida") from error
