import asyncio
from pathlib import Path

import pytest

from app.data_sources.geocoding import GeocodingUnavailableError, GeoNamesGazetteer
from app.data_sources.geocoding.base import normalize_text
from app.data_sources.geocoding.gazetteer import build_match_expression
from app.data_sources.geocoding.geonames_build import build_database

# Extracto con el formato de las columnas de GeoNames (geoname table).
CITIES = "\n".join(
    "\t".join(row)
    for row in [
        # id, name, ascii, alternatenames, lat, lon, class, code, cc, cc2, admin1, a2, a3, a4, pop
        [
            "3919968",
            "Cochabamba",
            "Cochabamba",
            "Cochabamba,Kochabamba",
            "-17.3895",
            "-66.1568",
            "P",
            "PPLA",
            "BO",
            "",
            "04",
            "",
            "",
            "",
            "841276",
        ],
        [
            "3920016",
            "Cliza",
            "Cliza",
            "",
            "-17.5878",
            "-65.9325",
            "P",
            "PPL",
            "BO",
            "",
            "04",
            "",
            "",
            "",
            "8654",
        ],
        [
            "3694564",
            "Cochabamba",
            "Cochabamba",
            "",
            "-9.0950",
            "-76.8366",
            "P",
            "PPL",
            "PE",
            "",
            "10",
            "",
            "",
            "",
            "588",
        ],
        [
            "3448439",
            "São Paulo",
            "Sao Paulo",
            "Sampa",
            "-23.5475",
            "-46.6361",
            "P",
            "PPLA",
            "BR",
            "",
            "27",
            "",
            "",
            "",
            "12400232",
        ],
    ]
)
ADMIN1 = "BO.04\tCochabamba\tCochabamba\t3919966\nPE.10\tHuánuco\tHuanuco\t3696416\n"
ADMIN1 += "BR.27\tSão Paulo\tSao Paulo\t3448433\n"
COUNTRIES = (
    "#ISO\tISO3\tISO-Numeric\tfips\tCountry\n"
    "BO\tBOL\t068\tBL\tBolivia\nPE\tPER\t604\tPE\tPeru\nBR\tBRA\t076\tBR\tBrazil\n"
)


@pytest.fixture
def gazetteer(tmp_path: Path) -> GeoNamesGazetteer:
    database = tmp_path / "gazetteer.sqlite3"
    count = build_database(database, CITIES, ADMIN1, COUNTRIES, {"source": "prueba"})
    assert count == 4
    return GeoNamesGazetteer(database)


def search(gazetteer: GeoNamesGazetteer, query: str, limit: int = 5) -> list[str]:
    places = asyncio.run(gazetteer.search(query, limit))
    return [f"{place.name}/{place.country_code}" for place in places]


def test_normalizes_case_diacritics_and_punctuation() -> None:
    assert normalize_text("  São Paulo, BRASIL! ") == "sao paulo brasil"
    assert build_match_expression("Coch Bol") == '"coch"* "bol"*'
    assert build_match_expression("¿?") is None


def test_finds_places_by_prefix_without_accents(gazetteer: GeoNamesGazetteer) -> None:
    assert search(gazetteer, "cli") == ["Cliza/BO"]
    assert search(gazetteer, "sao paulo") == ["São Paulo/BR"]
    assert search(gazetteer, "Sampa") == ["São Paulo/BR"]


def test_ranks_by_population_and_filters_by_region_or_country(
    gazetteer: GeoNamesGazetteer,
) -> None:
    # El nombre pesa más que la región: Cliza (departamento de Cochabamba) queda después.
    assert search(gazetteer, "Cochabamba") == ["Cochabamba/BO", "Cochabamba/PE", "Cliza/BO"]
    assert search(gazetteer, "Cochabamba Peru") == ["Cochabamba/PE"]
    assert search(gazetteer, "cochabamba huanuco") == ["Cochabamba/PE"]
    assert search(gazetteer, "Cochabamba", limit=1) == ["Cochabamba/BO"]


def test_returns_coordinates_region_and_kind(gazetteer: GeoNamesGazetteer) -> None:
    [place] = asyncio.run(gazetteer.search("Cliza", 1))
    assert place.id == "geonames:3920016"
    assert (place.latitude, place.longitude) == (-17.5878, -65.9325)
    assert place.region == "Cochabamba"
    assert place.kind == "populated-place"
    assert place.population == 8654


def test_user_input_cannot_inject_fts_syntax(gazetteer: GeoNamesGazetteer) -> None:
    assert search(gazetteer, 'cliza" OR "x') == []
    assert search(gazetteer, "NEAR(cliza)") == []


def test_missing_database_is_reported_as_unavailable(tmp_path: Path) -> None:
    gazetteer = GeoNamesGazetteer(tmp_path / "no-existe.sqlite3")
    assert gazetteer.is_available() is False
    with pytest.raises(GeocodingUnavailableError, match="make geodata"):
        asyncio.run(gazetteer.search("Cliza", 5))
