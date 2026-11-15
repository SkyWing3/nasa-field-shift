"""Metadatos de procedencia de los datasets geográficos (se muestran en la app y en la API)."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DatasetInfo:
    id: str
    name: str
    provider: str
    attribution: str
    citation: str
    license: str
    license_url: str
    source_url: str
    resolution_m: float | None
    vertical_datum: str | None
    acquired: str
    notes: str
