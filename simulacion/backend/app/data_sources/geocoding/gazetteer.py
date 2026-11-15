"""Nomenclátor local construido con datos de GeoNames (CC BY 4.0).

La búsqueda se resuelve en una base SQLite con índice de texto completo (FTS5): no hay peticiones
a servicios externos en tiempo de ejecución, ni límites de uso que respetar. La base se genera con
``python -m app.data_sources.geocoding.geonames_build`` (``make geodata``).
"""

import asyncio
import sqlite3
from contextlib import closing
from pathlib import Path

from app.data_sources.geocoding.base import (
    GeocodingUnavailableError,
    Place,
    PlaceKind,
    normalize_text,
)

SCHEMA = """
CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ascii_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    feature_class TEXT NOT NULL,
    feature_code TEXT NOT NULL,
    country_code TEXT,
    region TEXT,
    population INTEGER
);
CREATE VIRTUAL TABLE places_fts USING fts5(
    names, area, content='', tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def build_match_expression(query: str) -> str | None:
    """Expresión FTS5: cada palabra como prefijo y todas obligatorias. Sin sintaxis del usuario."""
    tokens = normalize_text(query).split()
    if not tokens:
        return None
    return " ".join(f'"{token}"*' for token in tokens[:8])


def _kind(feature_class: str) -> PlaceKind:
    if feature_class == "P":
        return "populated-place"
    if feature_class == "A":
        return "administrative"
    return "other"


class GeoNamesGazetteer:
    """Proveedor predeterminado: nomenclátor GeoNames ``cities500`` en SQLite."""

    name = "geonames"
    attribution = "GeoNames (CC BY 4.0)"
    attribution_url = "https://www.geonames.org/"

    def __init__(self, database: Path) -> None:
        self._database = database

    def is_available(self) -> bool:
        return self._database.is_file()

    def _search_sync(self, query: str, limit: int) -> list[Place]:
        expression = build_match_expression(query)
        if expression is None:
            return []
        exact = normalize_text(query)
        # Primero, coincidencias en el nombre; después, las que solo coinciden por región o país
        # («Cochabamba Peru», o localidades del departamento de Cochabamba).
        stages = (f"names : ({expression})", expression)
        rows: list[tuple[int, str, str | None, str | None, float, float, str, int | None]] = []
        seen: set[int] = set()
        # Modo solo lectura: la API nunca modifica el nomenclátor.
        uri = f"{self._database.resolve().as_uri()}?mode=ro"
        # closing(): cierra la conexión al terminar; en Windows un archivo abierto
        # no se puede reemplazar al regenerar el nomenclátor.
        with closing(sqlite3.connect(uri, uri=True)) as connection:
            for stage in stages:
                for row in connection.execute(
                    """
                    SELECT p.id, p.name, p.region, p.country_code, p.latitude, p.longitude,
                           p.feature_class, p.population
                    FROM places_fts
                    JOIN places AS p ON p.id = places_fts.rowid
                    WHERE places_fts MATCH ?
                    ORDER BY (lower(p.ascii_name) = ?) DESC, p.population DESC, p.name
                    LIMIT ?
                    """,
                    (stage, exact, limit),
                ):
                    if row[0] not in seen and len(rows) < limit:
                        seen.add(row[0])
                        rows.append(row)
        return [
            Place(
                id=f"geonames:{row[0]}",
                name=row[1],
                region=row[2],
                country_code=row[3],
                latitude=row[4],
                longitude=row[5],
                kind=_kind(row[6]),
                population=row[7],
            )
            for row in rows
        ]

    async def search(self, query: str, limit: int) -> list[Place]:
        if not self.is_available():
            raise GeocodingUnavailableError(
                "El nomenclátor local no está generado: ejecuta «make geodata»."
            )
        return await asyncio.to_thread(self._search_sync, query, limit)
