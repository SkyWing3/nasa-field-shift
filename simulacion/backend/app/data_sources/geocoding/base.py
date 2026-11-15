"""Contrato común de los proveedores de búsqueda geográfica (geocodificación directa)."""

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal, Protocol

PlaceKind = Literal["populated-place", "administrative", "other"]


@dataclass(frozen=True, slots=True)
class Place:
    """Lugar encontrado. Coordenadas WGS84 en grados."""

    id: str
    name: str
    region: str | None
    country_code: str | None
    latitude: float
    longitude: float
    kind: PlaceKind
    population: int | None


class GeocodingError(Exception):
    """Error base de la búsqueda geográfica."""


class GeocodingUnavailableError(GeocodingError):
    """El proveedor no está configurado o sus datos no existen (p. ej. falta el nomenclátor)."""


class GeocodingUpstreamError(GeocodingError):
    """El servicio externo respondió con un error o una respuesta no válida."""


class GeocodingTimeoutError(GeocodingError):
    """El servicio externo no respondió a tiempo."""


class GeocodingProvider(Protocol):
    """Proveedor intercambiable: la API y el frontend no dependen de cuál se use."""

    @property
    def name(self) -> str: ...

    @property
    def attribution(self) -> str: ...

    @property
    def attribution_url(self) -> str: ...

    def is_available(self) -> bool: ...

    async def search(self, query: str, limit: int) -> list[Place]: ...


_WORD = re.compile(r"\w+", re.UNICODE)


def normalize_text(text: str) -> str:
    """Minúsculas sin diacríticos ni puntuación: «Cochabamba, Perú» → «cochabamba peru»."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(_WORD.findall(without_marks))
