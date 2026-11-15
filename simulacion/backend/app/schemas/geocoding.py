"""Contratos de la búsqueda geográfica (JSON en camelCase, como el cliente TypeScript)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(frozen=True, alias_generator=to_camel, populate_by_name=True)


class PlaceResult(_CamelModel):
    id: str
    name: str
    region: str | None
    country_code: str | None
    latitude: float
    longitude: float
    kind: Literal["populated-place", "administrative", "other"]
    population: int | None


class GeocodingInfo(_CamelModel):
    provider: str
    attribution: str
    attribution_url: str
    available: bool


class GeocodingResults(_CamelModel):
    provider: str
    attribution: str
    attribution_url: str
    query: str
    results: list[PlaceResult]
