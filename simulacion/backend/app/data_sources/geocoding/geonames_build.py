"""Genera el nomenclátor local a partir de los volcados públicos de GeoNames (CC BY 4.0).

Uso: ``python -m app.data_sources.geocoding.geonames_build [--refresh]`` (``make geodata``).

GeoNames publica estos archivos para su descarga (https://download.geonames.org/export/dump/);
se descargan tres archivos una sola vez (≈ 14 MB) y se registran su tamaño, SHA-256 y fecha.
"""

import argparse
import csv
import hashlib
import io
import json
import sqlite3
import sys
import zipfile
from collections.abc import Iterator
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx2

from app.core.config import get_settings
from app.data_sources.geocoding.gazetteer import SCHEMA

GEONAMES_DUMP_URL = "https://download.geonames.org/export/dump/"
CITIES_FILE = "cities500.zip"
SOURCE_FILES = (CITIES_FILE, "admin1CodesASCII.txt", "countryInfo.txt")
# Nombre genérico (sin datos del usuario ni del proyecto); ver ADR-024.
USER_AGENT = "farm-sim-gazetteer-build/0.1"
MAX_ALTERNATE_NAMES_CHARS = 2_000

csv.field_size_limit(sys.maxsize)


@dataclass(frozen=True)
class DownloadedFile:
    name: str
    url: str
    bytes: int
    sha256: str
    last_modified: str | None


def download(name: str, target_dir: Path, refresh: bool) -> DownloadedFile:
    url = f"{GEONAMES_DUMP_URL}{name}"
    target = target_dir / name
    last_modified: str | None = None
    if refresh or not target.is_file():
        with httpx2.Client(timeout=120, headers={"User-Agent": USER_AGENT}) as client:
            response = client.get(url)
            response.raise_for_status()
            last_modified = response.headers.get("Last-Modified")
            partial = target.with_suffix(target.suffix + ".part")
            partial.write_bytes(response.content)
            partial.replace(target)
    data = target.read_bytes()
    return DownloadedFile(
        name=name,
        url=url,
        bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        last_modified=last_modified,
    )


def read_tsv(text: str) -> Iterator[list[str]]:
    for row in csv.reader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE):
        if row and not row[0].startswith("#"):
            yield row


def country_names(text: str) -> dict[str, str]:
    return {row[0]: row[4] for row in read_tsv(text) if len(row) > 4}


def admin1_names(text: str) -> dict[str, str]:
    return {row[0]: row[1] for row in read_tsv(text) if len(row) > 1}


def iter_cities(text: str) -> Iterator[list[str]]:
    for row in read_tsv(text):
        if len(row) >= 15:
            yield row


def build_database(
    database: Path,
    cities_text: str,
    admin1_text: str,
    countries_text: str,
    metadata: dict[str, str],
) -> int:
    """Crea la base en un archivo temporal y la sustituye de forma atómica. Devuelve el total."""
    countries = country_names(countries_text)
    regions = admin1_names(admin1_text)
    database.parent.mkdir(parents=True, exist_ok=True)
    temporary = database.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    count = 0
    # closing(): `with sqlite3.connect()` confirma pero NO cierra la conexión, y en Windows
    # no se puede renombrar un archivo abierto (WinError 32 en temporary.replace).
    with closing(sqlite3.connect(temporary)) as connection, connection:
        connection.executescript(SCHEMA)
        for row in iter_cities(cities_text):
            geoname_id = int(row[0])
            name, ascii_name, alternate = row[1], row[2], row[3]
            country_code = row[8] or None
            region = regions.get(f"{row[8]}.{row[10]}")
            country = countries.get(row[8], "")
            population = int(row[14]) if row[14] else None
            connection.execute(
                "INSERT INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    geoname_id,
                    name,
                    ascii_name,
                    float(row[4]),
                    float(row[5]),
                    row[6],
                    row[7],
                    country_code,
                    region,
                    population,
                ),
            )
            names = " ".join(
                [name, ascii_name, alternate[:MAX_ALTERNATE_NAMES_CHARS].replace(",", " ")]
            )
            area = " ".join(part for part in (region, country, country_code) if part)
            connection.execute(
                "INSERT INTO places_fts (rowid, names, area) VALUES (?, ?, ?)",
                (geoname_id, names, area),
            )
            count += 1
        connection.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [*metadata.items(), ("places", str(count))],
        )
    temporary.replace(database)
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Vuelve a descargar los volcados")
    args = parser.parse_args(argv)

    database = get_settings().gazetteer_path
    source_dir = database.parent / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    files = [download(name, source_dir, args.refresh) for name in SOURCE_FILES]
    for file in files:
        print(f"  {file.name}: {file.bytes:,} B · sha256 {file.sha256[:16]}…")

    with zipfile.ZipFile(source_dir / CITIES_FILE) as archive:
        cities_text = archive.read("cities500.txt").decode("utf-8")
    admin1_text = (source_dir / "admin1CodesASCII.txt").read_text(encoding="utf-8")
    countries_text = (source_dir / "countryInfo.txt").read_text(encoding="utf-8")
    metadata = {
        "source": "GeoNames cities500 + admin1CodesASCII + countryInfo",
        "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "files": json.dumps([file.__dict__ for file in files]),
    }
    count = build_database(database, cities_text, admin1_text, countries_text, metadata)
    (database.parent / "manifest.json").write_text(
        json.dumps(
            {**metadata, "files": [file.__dict__ for file in files], "places": count}, indent=2
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Nomenclátor: {count:,} lugares → {database}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
