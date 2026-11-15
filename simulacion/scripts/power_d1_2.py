"""Regenera D1-2 sin red a partir de los originales y sus metadatos de descarga.

Uso: backend/.venv/bin/python scripts/power_d1_2.py backend/data/power/obrajes/2026-11-14
"""

import argparse
import csv
import hashlib
import json
import math
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

PARAMETERS = (
    "PRECTOTCORR", "T2M_MIN", "T2M_MAX", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN", "T2M",
)
MIN_VALID_DAYS = 140
PUBLIC_LATITUDE = -17.83
PUBLIC_LONGITUDE = -67.00
COORDINATE_PRECISION_DEG = 0.01
PRIVACY_NOTE = "punto redondeado por privacidad del productor"


def dates_between(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def phase(oni: float | None) -> str | None:
    if oni is None:
        return None
    if oni >= 0.5:
        return "Niño"
    if oni <= -0.5:
        return "Niña"
    return "Normal"


def normalize(value: float | None, fill: float) -> float | None:
    if value is None or value in (-999, fill):
        return None
    if not math.isfinite(value):
        raise ValueError(f"Valor no finito en el original: {value}")
    return value


def campaign(year: int, rainfall: dict, oni: dict, last_date: date) -> dict:
    start, end = date(year, 11, 1), date(year + 1, 3, 31)
    elapsed = dates_between(start, min(end, last_date))
    valid = [rainfall.get(day.isoformat()) for day in elapsed]
    valid = [v for v in valid if v is not None]
    complete = end <= last_date
    included = complete and len(valid) >= MIN_VALID_DAYS
    anomaly = oni.get(year)
    return {
        "campania": f"{year}-{str(year + 1)[2:]}",
        "anio_inicio": year,
        "fecha_inicio": start.isoformat(),
        "fecha_fin": end.isoformat(),
        "dias_esperados": (end - start).days + 1,
        "dias_transcurridos": len(elapsed),
        "dias_validos_lluvia": len(valid),
        "dias_faltantes_transcurridos": len(elapsed) - len(valid),
        "completa": complete,
        "incluida_analisis": included,
        "oni_ndj_c": anomaly,
        "fase_enso": phase(anomaly),
        "nino_fuerte": None if anomaly is None else anomaly >= 1.5,
        "lluvia_observada_mm": math.fsum(valid) if valid else None,
        "lluvia_campania_mm": math.fsum(valid) if included else None,
        "causa_exclusion": "" if included else (
            "campaña parcial" if not complete else "menos de 140 días válidos de lluvia"
        ),
    }


def write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def write_csv(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        for row in records:
            writer.writerow({
                k: round(v, 4) if isinstance(v, float) else v for k, v in row.items()
            })


def evidence(path: Path) -> dict:
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def validate_public_point(latitude: float, longitude: float) -> None:
    if latitude != PUBLIC_LATITUDE or longitude != PUBLIC_LONGITUDE:
        raise ValueError("La entrega pública requiere el punto redondeado de Obrajes")


def build(directory: Path) -> dict:
    original = directory / "power_original.json"
    raw = json.loads(original.read_bytes())
    metadata = json.loads((directory / "download_metadata.json").read_bytes())
    if evidence(original)["sha256"] != metadata["sha256"]:
        raise ValueError("El checksum del JSON original cambió desde la descarga")
    oni_download = json.loads((directory / "oni_download_metadata.json").read_bytes())
    if evidence(directory / "oni_original.txt")["sha256"] != oni_download["sha256"]:
        raise ValueError("El checksum del archivo ONI cambió desde la descarga")
    request = metadata["request_params"]
    validate_public_point(request["latitude"], request["longitude"])
    lon, lat = raw["geometry"]["coordinates"][:2]
    validate_public_point(lat, lon)
    if request["community"] != "AG" or raw["header"]["time_standard"] != "LST":
        raise ValueError("Se esperaba la comunidad AG y días en hora solar local LST")
    expected_units = {
        "PRECTOTCORR": "mm/day", "T2M_MIN": "C", "T2M_MAX": "C", "WS2M": "m/s",
        "RH2M": "%", "ALLSKY_SFC_SW_DWN": "MJ/m^2/day", "T2M": "C",
    }
    for parameter, unit in expected_units.items():
        if raw["parameters"][parameter]["units"] != unit:
            raise ValueError(f"Unidad inesperada para {parameter}")
    values = raw["properties"]["parameter"]
    start, end = (datetime.strptime(raw["header"][key], "%Y%m%d").date()
                  for key in ("start", "end"))
    if start != date(1981, 1, 1) or end.strftime("%Y%m%d") != request["end"]:
        raise ValueError("El período del original no coincide con la consulta de D1-2")
    days = dates_between(start, end)
    rows = [{"date": day.isoformat(), **{
        p: normalize(values[p].get(day.strftime("%Y%m%d")), raw["header"]["fill_value"])
        for p in PARAMETERS
    }} for day in days]
    coverage = {}
    for parameter in PARAMETERS:
        available = [r["date"] for r in rows if r[parameter] is not None]
        available_set = set(available)
        coverage[parameter] = {
            "units": expected_units[parameter], "total_days": len(rows),
            "valid_days": len(available), "missing_days": len(rows) - len(available),
            "first_valid_date": min(available) if available else None,
            "last_valid_date": max(available) if available else None,
            "missing_within_valid_span": sum(
                available[0] <= r["date"] <= available[-1] and r["date"] not in available_set
                for r in rows
            ) if available else 0,
            "missing_dates_within_valid_span": [
                r["date"] for r in rows
                if available and available[0] <= r["date"] <= available[-1]
                and r["date"] not in available_set
            ],
        }
    qc = {
        "negative_precipitation": sum(r["PRECTOTCORR"] is not None and r["PRECTOTCORR"] < 0 for r in rows),
        "inverted_temperature_extremes": sum(
            r["T2M_MIN"] is not None and r["T2M_MAX"] is not None
            and r["T2M_MIN"] > r["T2M_MAX"] for r in rows
        ),
        "relative_humidity_outside_0_100": sum(
            r["RH2M"] is not None and not 0 <= r["RH2M"] <= 100 for r in rows
        ),
        "negative_wind_speed": sum(r["WS2M"] is not None and r["WS2M"] < 0 for r in rows),
        "negative_solar_radiation": sum(
            r["ALLSKY_SFC_SW_DWN"] is not None and r["ALLSKY_SFC_SW_DWN"] < 0 for r in rows
        ),
    }
    if any(qc.values()):
        raise ValueError(f"Revisar datos fuera de rango antes de analizar: {qc}")
    oni = {}
    for line in (directory / "oni_original.txt").read_text().splitlines()[1:]:
        fields = line.split()
        if fields and fields[0] == "NDJ":
            year = int(fields[1])
            if year in oni:
                raise ValueError(f"ONI NDJ duplicado: {year}")
            oni[year] = float(fields[3])
    rainfall = {r["date"]: r["PRECTOTCORR"] for r in rows}
    campaigns = [campaign(y, rainfall, oni, end) for y in range(1981, end.year + 1)
                 if date(y, 11, 1) <= end]
    normals = [c for c in campaigns if c["incluida_analisis"] and c["fase_enso"] == "Normal"]
    if not normals:
        raise ValueError("No hay campañas Normal válidas para calcular la referencia")
    reference = math.fsum(c["lluvia_campania_mm"] for c in normals) / len(normals)
    for record in campaigns:
        rain = record["lluvia_campania_mm"]
        record.update({
            "normal_referencia_mm": reference,
            "anomalia_mm": None if rain is None else rain - reference,
            "anomalia_pct": None if rain is None else 100 * (rain / reference - 1),
            "menor_normal": None if rain is None else rain < reference,
        })
    strong = [c for c in campaigns if c["incluida_analisis"] and c["nino_fuerte"]]
    result = {
        "interpretation": "Campañas Niño fuerte (ONI NDJ >= 1.5) con lluvia nov-mar menor al promedio de campañas Normal",
        "comparison_operator": "<", "normal_reference_mm": reference,
        "normal_campaign_count": len(normals),
        "normal_campaigns": [c["campania"] for c in normals],
        "strong_campaign_count": len(strong),
        "strong_campaigns_below_normal": sum(c["menor_normal"] for c in strong),
        "strong_campaigns": strong,
        "colab_executed": False,
        "method": "Cálculo local con las reglas de D1-2; P6 confirmó el mismo resultado en su cuaderno",
        "p6_verification": {"status": "confirmed_by_p6", "source": "P6_correcciones.md, introducción"},
    }
    write_json(directory / "daily_normalized.json", {
        "point": {"name": "Obrajes", "latitude": request["latitude"], "longitude": request["longitude"]},
        "coordinate_precision_deg": COORDINATE_PRECISION_DEG, "note": PRIVACY_NOTE,
        "time_standard": "LST", "missing_value": None,
        "parameters": raw["parameters"], "daily": rows,
    })
    write_csv(directory / "daily_normalized.csv", rows)
    write_csv(directory / "lluvia_campanias.csv", campaigns)
    write_csv(directory / "ninos_fuertes.csv", strong)
    write_json(directory / "resultado_4de5.json", result)
    elevation = json.loads((directory / "elevacion_nasadem.json").read_bytes())
    manifest = {
        "dataset": "D1-2 · NASA POWER diario · Obrajes, Soracachi",
        "coordinate_precision_deg": COORDINATE_PRECISION_DEG,
        "note": PRIVACY_NOTE,
        "download": metadata, "derived_at_utc": datetime.now(UTC).isoformat(),
        "point": {"latitude": request["latitude"], "longitude": request["longitude"],
                  "nasadem_elevation_m_egm96": elevation["elevation_m"]},
        "power_geometry_as_returned": raw["geometry"],
        "power_geometry_note": "La geometría redondeada de la respuesta no acredita el centro ni la identidad de la celda. Su elevación no sustituye NASADEM.",
        "api_header": raw["header"], "api_messages": raw.get("messages", []),
        "coverage": coverage, "quality_checks": qc,
        "campaign_rules": {"start": "11-01", "end_next_year": "03-31", "minimum_valid_rainfall_days": 140,
                           "partial_campaigns_excluded": True, "enso_season": "NDJ", "enso_year": "campaign_start_year",
                           "nino_threshold": 0.5, "nina_threshold": -0.5, "strong_nino_threshold": 1.5,
                           "missing_rainfall_policy": "null; no imputación ni reescalado; suma observada si >=140 días válidos y campaña completa"},
        "complete_campaigns_included": sum(c["incluida_analisis"] for c in campaigns),
        "partial_campaigns": [c["campania"] for c in campaigns if not c["completa"]],
        "et0": {"computed": False, "solar_first_valid_date": coverage["ALLSKY_SFC_SW_DWN"]["first_valid_date"],
                "note": "Sin ET0 Penman–Monteith antes de 1984 con este conjunto; no se usa Hargreaves como sustituto."},
        "oni_source": "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
        "oni_download": oni_download,
        "four_of_five": result,
        "comparison_with_oruro_p6_3": {
            "status": "same_meteorological_cell_reported_by_p6",
            "source": "P6_correcciones.md, sección 2", "independently_verified": False,
            "scope": "Comparación Obrajes–Oruro informada por P6; no se recibió la consulta original de Oruro",
            "ui_notice": "Dato regional de la celda NASA POWER, no medición de la parcela",
        },
        "privacy_rounding_comparison": json.loads((directory / "rounding_comparison.json").read_bytes()),
        "chirps_contrast": {"status": "unavailable", "task": "D1-2b cancelled", "source": "P6_correcciones.md, sección 6"},
        "analysis_script": {"file": "scripts/power_d1_2.py", "sha256": evidence(Path(__file__))["sha256"]},
        "files": [evidence(directory / name) for name in (
            "power_original.json", "download_metadata.json", "availability_probe_original.json",
            "oni_original.txt", "oni_download_metadata.json", "D1-2_especificacion_POWER.md", "elevacion_nasadem.json",
            "P6_correcciones.md", "rounding_comparison.json",
            "daily_normalized.json", "daily_normalized.csv", "lluvia_campanias.csv",
            "ninos_fuertes.csv", "resultado_4de5.json",
        )],
    }
    write_json(directory / "manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    arguments = parser.parse_args()
    manifest = build(arguments.directory)
    result = manifest["four_of_five"]
    print(f"{manifest['complete_campaigns_included']} campañas completas; normal = {result['normal_reference_mm']:.4f} mm")
    print(f"Niños fuertes con lluvia menor que la normal: {result['strong_campaigns_below_normal']} de {result['strong_campaign_count']}")
