"""Precalcula nueve casos × cuatro presupuestos con el balance FAO-56 desde POWER y P6.
No consulta servicios en internet.

Desde simulacion/: backend/.venv/bin/python scripts/build_raiz.py
"""

import csv
import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path

SIM = Path(__file__).resolve().parents[1]
REPO = SIM.parent
sys.path.insert(0, str(SIM / "backend"))
from app.engine.raiz import (
    FAO56_URL,
    KPI_KEYS,
    KPI_UNITS,
    MODEL_ASSUMPTIONS,
    MODEL_VERSION,
    SOIL_CENTRAL,
    SOIL_HIGH,
    SOIL_LOW,
    cycle_metrics,
    et0_penman_monteith,
    simulate_window,
    summarize,
    window_days,
)
from app.engine.rotation_request import prepare_rotation_request

CONTENT = REPO / "content/p6"
POWER = SIM / "backend/data/power/obrajes/2026-11-14"
OUTPUT = SIM / "frontend/public/raiz"


def read(path: Path):
    return json.loads(path.read_bytes())


def write(path: Path, obj, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    layout = {"separators": (",", ":")} if compact else {"indent": 2}
    path.write_text(
        json.dumps(obj, ensure_ascii=False, allow_nan=False, **layout) + "\n"
    )


#: Presupuestos precalculados: requerimiento, dos cupos hipotéticos y secano. Los cupos son
#: un tercio y dos tercios de la mediana del requerimiento central de papa y haba (291 mm,
#: 1984–2023), redondeados a 100 mm: entradas de escenario, no límites agronómicos oficiales.
WATER_BUDGETS = [
    {
        "id": "requerimiento",
        "label": "Sin límite (requerimiento)",
        "per_campaign_mm": None,
        "kind": "requirement",
        "note": "Riego neto que evita el estrés en papa y haba; no es una dotación disponible.",
    },
    {
        "id": "cupo_200",
        "label": "Cupo de 200 mm por campaña",
        "per_campaign_mm": 200,
        "kind": "hypothetical_cap",
        "note": "Hipotético: unos 2/3 de la mediana del requerimiento (291 mm). 200 mm = 2 000 m³/ha.",
    },
    {
        "id": "cupo_100",
        "label": "Cupo de 100 mm por campaña",
        "per_campaign_mm": 100,
        "kind": "hypothetical_cap",
        "note": "Hipotético: alrededor de 1/3 de la mediana del requerimiento. 100 mm = 1 000 m³/ha.",
    },
    {
        "id": "secano",
        "label": "Secano, sin riego",
        "per_campaign_mm": 0,
        "kind": "rainfed",
        "note": "Papa y haba sin agua de pozo.",
    },
]
ASSUMPTION_RUN_KEYS = (
    "net_irrigation_required_mm",
    "net_irrigation_applied_mm",
    "water_stress_days",
)
NULL_REASONS = {
    "net_irrigation_required_mm": "Solo papa y haba se riegan con pozo; quinua es de secano y el descanso no se riega.",
    "net_irrigation_applied_mm": "Solo papa y haba se riegan con pozo.",
    "water_deficit_mm": "El descanso no tiene coeficiente de cultivo.",
    "water_stress_days": "El descanso no tiene coeficiente de cultivo.",
    "crop_demand_mm": "El descanso no tiene coeficiente de cultivo.",
    "effective_rain_mm": "Se calcula solo durante el ciclo de un cultivo.",
    "thermal_exposure_days": "Sin cultivo no hay umbral de helada.",
}


def merged_positions(runs: dict, soil_id: str, budget_id: str) -> list[dict]:
    """KPI por campaña de una corrida, con el requerimiento de la corrida sin límite."""
    required = runs[soil_id, "requerimiento"]["positions"]
    return [
        {**p, "net_irrigation_required_mm": required[i]["net_irrigation_applied_mm"]}
        for i, p in enumerate(runs[soil_id, budget_id]["positions"])
    ]


def rounded(obj):
    """Dos decimales en la salida: suficiente para mm y días, y archivos más livianos."""
    if isinstance(obj, float):
        return round(obj, 2)
    if isinstance(obj, dict):
        return {k: rounded(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [rounded(v) for v in obj]
    return obj


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def credit_sections(text: str) -> list[dict]:
    """Conservar solo las secciones públicas indicadas por P6, con tablas y listas."""
    result = []
    for section in text.split("\n## ")[1:]:
        heading, _, body = section.partition("\n")
        if heading.split(".", 1)[0] not in {"1", "3", "4", "5"}:
            continue
        # El original de P6 queda intacto; la publicación distingue cobertura y evidencia real.
        if heading.startswith("1."):
            body = body.replace(
                "Lluvia, Tmin, Tmax, viento, humedad, radiación diarias desde 1981",
                "Lluvia, Tmin, Tmax, viento y humedad desde 1981; radiación diaria desde 1984",
            )
        if heading.startswith("3."):
            body = body.replace(
                "Meta **MMS-TTS** (`facebook/mms-tts-spa`, `facebook/mms-tts-quz`)",
                "Meta **MMS-TTS** (`facebook/mms-tts-spa`; referencia para español)",
            ).replace(
                "Voz sintética del boletín",
                "Voz sintética de referencia en español; MP3 español no incluido",
            )
            body += (
                "\n| Grabación de un productor de la comunidad | "
                "Audio quechua entregado, con voz humana | Autorización escrita, sin nombre |\n"
            )
        if heading.startswith("4."):
            body = (
                body.replace(
                    "Todas las cifras del proyecto salen de datos descargados de NASA POWER y NOAA "
                    "y de cálculos reproducidos por dos integrantes del equipo; ninguna cifra fue generada por IA.",
                    "El análisis histórico 4 de 5 fue reproducido por P6 y Dev 1 a partir de NASA POWER "
                    "y NOAA ONI. Los nueve escenarios de demanda de esta entrega son cálculos "
                    "preliminares con supuestos, pendientes de revisión agronómica de P6. "
                    "Los valores calculados se distinguen del reanálisis y de los parámetros asumidos.",
                )
                .replace(
                    "La voz en español del boletín es sintética (Meta MMS-TTS).",
                    "Meta MMS-TTS es la referencia para español; el MP3 español no se incluyó en esta entrega.",
                )
                .replace("código en Python.", "código en Python y TypeScript/React.")
                .replace("escrita..", "escrita.")
            )
        result.append({"title": heading.split(". ", 1)[-1], "markdown": body.strip()})
    return result


def build() -> dict:
    point = read(CONTENT / "point.json")
    crops_doc = read(CONTENT / "crops.json")
    soils = read(CONTENT / "soils.json")
    rotations = read(CONTENT / "rotations.json")
    assert (point["lat"], point["lon"]) == (-17.83, -67.00)
    crop_map = {c["id"]: c for c in crops_doc["crops"]}
    source_manifest = read(POWER / "manifest.json")
    for item in source_manifest["files"]:
        assert digest(POWER / item["file"]) == item["sha256"], item["file"]
    daily = {r["date"]: r for r in read(POWER / "daily_normalized.json")["daily"]}
    et0 = {
        key: et0_penman_monteith(
            date.fromisoformat(key), row, point["lat"], point["elevation_m"]["value"]
        )
        for key, row in daily.items()
    }
    with (POWER / "lluvia_campanias.csv").open() as handle:
        campaigns = [
            r for r in csv.DictReader(handle) if r["incluida_analisis"] == "True"
        ]
    valid_campaigns = {int(r["anio_inicio"]): r for r in campaigns}
    cases = []
    for rotation in rotations["sequences"]:
        for position, sequence in enumerate(rotation["positions_proposed"]):
            request = prepare_rotation_request(rotation["id"], start_position=position)
            base = rotation["campaigns"]
            assert sequence == base[position:] + base[:position]
            cases.append(
                {
                    "case_id": f"{rotation['id']}-{position}",
                    "sequence_id": rotation["id"],
                    "start_position": request.start_position,
                    "crops": sequence,
                    "baseline_status": rotation["baseline_status"],
                }
            )
    assert len(cases) == 9
    inputs = [
        CONTENT / n
        for n in (
            "point.json",
            "crops.json",
            "soils.json",
            "rotations.json",
            "registro_fuentes_afirmaciones.md",
            "P6-6_fuentes_licencias_IA.md",
        )
    ]
    inputs += [
        SIM / "frontend/package.json",
        POWER / "daily_normalized.json",
        Path(__file__),
        SIM / "backend/app/engine/raiz.py",
    ]
    build_id = (
        "raiz-p6-v3-"
        + hashlib.sha256("".join(digest(p) for p in inputs).encode()).hexdigest()[:12]
    )
    windows = []
    excluded = []
    for year, climate in valid_campaigns.items():
        if not all(y in valid_campaigns for y in (year, year + 1, year + 2)):
            excluded.append(
                {"year": year, "reason": "Faltan tres campañas completas consecutivas"}
            )
            continue
        if any(
            d.isoformat() not in daily
            or et0.get(d.isoformat()) is None
            or daily[d.isoformat()]["PRECTOTCORR"] is None
            for d in window_days(year)
        ):
            excluded.append(
                {
                    "year": year,
                    "reason": "Sin ET0 completa para los 36 meses del balance; radiación disponible desde 1984",
                }
            )
            continue
        period = (
            "historical"
            if year + 2 <= 2000
            else "recent"
            if year >= 2001
            else "cross_period"
        )
        windows.append(
            {
                "window_id": str(year),
                "year": year,
                "campaigns": [
                    valid_campaigns[y]["campania"] for y in range(year, year + 3)
                ],
                "phase": climate["fase_enso"],
                "oni_ndj": float(climate["oni_ndj_c"]),
                "period_id": period,
                "phase_source": "NOAA ONI NDJ del primer año",
            }
        )

    soils_runs = {
        "central": SOIL_CENTRAL,
        "suelo_bajo": SOIL_LOW,
        "suelo_alto": SOIL_HIGH,
    }
    records = []
    for window in windows:
        year = window["year"]
        for case in cases:
            runs = {
                (soil_id, b["id"]): simulate_window(
                    case["crops"],
                    year,
                    daily,
                    et0,
                    crop_map,
                    soil,
                    b["per_campaign_mm"],
                )
                for soil_id, soil in soils_runs.items()
                for b in WATER_BUDGETS
            }

            for budget in WATER_BUDGETS:
                seasons = merged_positions(runs, "central", budget["id"])
                stress_free = all(
                    p["water_stress_days"] == 0 for p in seasons if p["irrigated"]
                )
                records.append(
                    {
                        "result_id": f"{build_id}/{case['case_id']}/{budget['id']}/{window['window_id']}",
                        "case_id": case["case_id"],
                        "window_id": window["window_id"],
                        "water_budget_id": budget["id"],
                        "start_position": case["start_position"],
                        "phase": window["phase"],
                        "enso_initial_phase": window["phase"],
                        "period_id": window["period_id"],
                        "decision_kpis": {k: seasons[0].get(k) for k in KPI_KEYS},
                        "cycle_kpis": cycle_metrics(seasons),
                        "campaigns": [
                            {
                                "crop": p["crop"],
                                "campaign": p["campaign"],
                                **{k: p.get(k) for k in KPI_KEYS},
                            }
                            for p in seasons
                        ],
                        "balance": runs["central", budget["id"]]["balance"],
                        "constraint_pass": stress_free,
                        "assumption_runs": {
                            soil_id: {
                                k: cycle_metrics(
                                    merged_positions(runs, soil_id, budget["id"])
                                )[k]
                                for k in ASSUMPTION_RUN_KEYS
                            }
                            for soil_id in ("suelo_bajo", "suelo_alto")
                        },
                        "source": "simulated_with_downloaded_power",
                    }
                )

    aggregates = []
    for budget in WATER_BUDGETS:
        for period in ("all", "historical", "recent"):
            for phase in ("Normal", "Niño", "Niña"):
                for case in cases:
                    selection = [
                        r
                        for r in records
                        if r["case_id"] == case["case_id"]
                        and r["water_budget_id"] == budget["id"]
                        and r["phase"] == phase
                        and (period == "all" or r["period_id"] == period)
                    ]
                    unique = sorted(
                        {c["campaign"] for r in selection for c in r["campaigns"]}
                    )
                    cycle = summarize(selection, "cycle_kpis")
                    ranges = {}
                    for key in ASSUMPTION_RUN_KEYS:
                        means = [cycle[key]["mean"]] + [
                            sum(v) / len(v)
                            for v in (
                                [
                                    r["assumption_runs"][s][key]
                                    for r in selection
                                    if r["assumption_runs"][s][key] is not None
                                ]
                                for s in ("suelo_bajo", "suelo_alto")
                            )
                            if v
                        ]
                        means = [m for m in means if m is not None]
                        ranges[key] = [min(means), max(means)] if means else None
                    passed = sum(r["constraint_pass"] for r in selection)
                    aggregates.append(
                        {
                            "result_id": f"{build_id}/{case['case_id']}/{budget['id']}/{phase}/{period}",
                            "case_id": case["case_id"],
                            "water_budget_id": budget["id"],
                            "phase": phase,
                            "enso_initial_phase": phase,
                            "period_id": period,
                            "n_windows": len(selection),
                            "n_unique_campaigns": len(unique),
                            "sample_status": "insufficient"
                            if len(selection) < 3
                            else "available",
                            "decision_kpis": summarize(selection, "decision_kpis"),
                            "cycle_kpis": cycle,
                            "constraint_pass": {
                                "rule": "Sin días de estrés hídrico en los cultivos con riego",
                                "numerator": passed,
                                "denominator": len(selection),
                                "frequency": passed / len(selection)
                                if selection
                                else None,
                            },
                            "assumption_range": ranges,
                        }
                    )
    common = {
        "schema_version": "3.2-d1",
        "build_id": build_id,
        "data_as_of": "2026-11-11",
        "model_version": MODEL_VERSION,
        "generated_at": None,
    }
    assumptions = MODEL_ASSUMPTIONS
    model_limits = [
        "Balance diario de un solo depósito con profundidad común de 0,6 m: no es un modelo de cultivo ni un programa de riego aplicado.",
        "Suelo no medido: agua disponible genérica (NRCS) y profundidad supuesta. Las corridas «suelo bajo» y «suelo alto» muestran el efecto de esos supuestos, no toda la incertidumbre.",
        "La quinua (raíces de 1,0–1,5 m) queda subrepresentada por la profundidad común y usa p y etapas de cereales pequeños como proxy.",
        "Descanso: solo evaporación del suelo; la transpiración de la maleza no se calcula, así que la humedad que traslada es un máximo.",
        "Helada: Tmin del aire de una celda regional contra umbrales de tejido vegetal en todo el ciclo. Mide exposición, no daño; sin fechas de floración.",
        "Suelo descubierto: días sin cultivo planificado con lluvia ≥ 12,7 mm o viento medio ≥ 5 m/s. Es exposición, no erosión en toneladas.",
        "La lluvia nov–mar clasifica las campañas; el balance corre del 1 de julio al 30 de junio con cultivo del 1 de octubre al 15 de abril.",
        "Las ventanas se solapan: no son observaciones independientes. Ordenar por prioridades no es una garantía futura.",
        "Los cupos de 100 y 200 mm son valores hipotéticos de entrada, no límites agronómicos oficiales.",
        "Sin contraste con estación ni segunda fuente: la sensibilidad entre fuentes no está evaluada.",
        "La radiación del punto público es la reconsulta redondeada de D1-2; no se mezcla con la serie solar anterior.",
    ]
    sources = [
        {
            "id": "nasa_power",
            "agency": "NASA LaRC",
            "product": "POWER Daily API, comunidad AG (MERRA-2)",
            "url": "https://power.larc.nasa.gov",
            "use": "lluvia, temperatura, viento, humedad y radiación diarias",
        },
        {
            "id": "noaa_oni",
            "agency": "NOAA CPC",
            "product": "Oceanic Niño Index (oni.ascii.txt)",
            "url": "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
            "use": "fase de la campaña de decisión",
        },
        {
            "id": "fao56",
            "agency": "FAO",
            "product": "Irrigation and Drainage Paper 56 (Allen et al. 1998)",
            "url": FAO56_URL,
            "use": "ET0, Kc, p, balance y evaporación de suelo desnudo",
        },
        {
            "id": "nrcs",
            "agency": "USDA NRCS",
            "product": "TR-55 curva número; agua disponible por textura",
            "url": "https://www.nrcs.usda.gov",
            "use": "escorrentía y retención de agua",
        },
        {
            "id": "p6_productor",
            "agency": "Equipo Raíz (P6)",
            "product": "content/p6: punto, cultivos, suelo y rotaciones",
            "url": None,
            "use": "calendario, riego, umbrales y secuencias",
        },
    ]
    warnings = [
        "Escenarios simulados con supuestos explícitos; revisión agronómica de P6 pendiente.",
        "Datos regionales de una celda NASA POWER de unos 50 km, no mediciones de la parcela.",
    ]
    kpis = [
        {
            "key": "net_irrigation_required_mm",
            "unit": "mm",
            "direction": "lower",
            "definition": "Riego neto que evita el estrés en papa y haba (corrida sin límite).",
        },
        {
            "key": "net_irrigation_applied_mm",
            "unit": "mm",
            "direction": "lower",
            "definition": "Riego neto aplicado con el presupuesto elegido.",
        },
        {
            "key": "water_deficit_mm",
            "unit": "mm",
            "direction": "lower",
            "definition": "Evapotranspiración que el cultivo no pudo cubrir: Σ (1 − Ks) · Kc · ET0.",
        },
        {
            "key": "water_stress_days",
            "unit": "días",
            "direction": "lower",
            "definition": "Días del ciclo con Ks < 1 (agotamiento mayor que el agua fácilmente aprovechable).",
        },
        {
            "key": "crop_demand_mm",
            "unit": "mm",
            "direction": "neutral",
            "definition": "Σ Kc · ET0 durante el ciclo.",
        },
        {
            "key": "effective_rain_mm",
            "unit": "mm",
            "direction": "neutral",
            "definition": "Lluvia del ciclo menos escorrentía y drenaje profundo.",
        },
        {
            "key": "thermal_exposure_days",
            "unit": "días",
            "direction": "lower",
            "definition": "Días del ciclo con Tmin del aire ≤ umbral de la etapa sensible del cultivo.",
        },
        {
            "key": "coverage_pct",
            "unit": "%",
            "direction": "higher",
            "definition": "Parte del año agrícola con cultivo planificado (calendario supuesto).",
        },
        {
            "key": "partial_cover_pct",
            "unit": "%",
            "direction": "neutral",
            "definition": "Parte del año agrícola en descanso con maleza pastoreada (cobertura parcial).",
        },
        {
            "key": "bare_days",
            "unit": "días",
            "direction": "lower",
            "definition": "Días sin cultivo planificado ni descanso.",
        },
        {
            "key": "bare_rain_exposure_days",
            "unit": "días",
            "direction": "lower",
            "definition": "Días sin cultivo con lluvia ≥ 12,7 mm.",
        },
        {
            "key": "bare_wind_exposure_days",
            "unit": "días",
            "direction": "lower",
            "definition": "Días sin cultivo con viento medio a 2 m ≥ 5 m/s.",
        },
    ]
    assert [k["key"] for k in kpis] == list(KPI_UNITS)
    catalog = {
        **common,
        "mode": "downloaded",
        "sources": sources,
        "warnings": warnings,
        "point": {
            key: point[key]
            for key in (
                "lat",
                "lon",
                "comunidad",
                "municipio",
                "departamento",
                "elevation_m",
                "representativeness",
                "coordinate_precision_deg",
            )
        },
        "point_source": "content/p6/point.json",
        "crops": [
            {
                key: c.get(key)
                for key in (
                    "id",
                    "name",
                    "calendar",
                    "duration_days",
                    "kc",
                    "root_depth_m",
                    "depletion_p",
                    "thresholds",
                )
            }
            for c in crops_doc["crops"]
        ],
        "soils": soils,
        "cases": cases,
        "water_budgets": WATER_BUDGETS,
        "kpis": kpis,
        "null_reasons": NULL_REASONS,
        "assumptions": assumptions,
        "model_limits": model_limits,
        "periods": [
            {"id": "all", "label": "Todas las ventanas completas"},
            {"id": "historical", "label": "Campañas 1981–2000"},
            {"id": "recent", "label": "Campañas 2001–2025"},
        ],
        "sensitivity_status": "not_evaluated",
        "chirps_status": "unavailable",
    }
    climate = {
        **common,
        "mode": "downloaded",
        "sources": sources[:2],
        "warnings": warnings[1:],
        "four_of_five": source_manifest["four_of_five"],
        "campaigns": campaigns,
        "windows": windows,
        "exclusions": excluded,
        "phase_rule": "ONI NDJ: Niño ≥0,5; Niña ≤−0,5; Normal entre ambos. Año inicial; sin persistencia adicional.",
        "campaign_rule": "Lluvia 1 nov–31 mar; mínimo 140 días válidos; 2026–27 parcial excluida",
        "water_model_first_year": min(w["year"] for w in windows),
    }
    oni_meta = read(POWER / "oni_download_metadata.json")
    enso = {
        **common,
        "mode": "downloaded",
        "source": {
            "agency": "NOAA CPC",
            "product": "Oceanic Niño Index (ERSSTv5)",
            "url": oni_meta["request_url"],
            "downloaded_at_utc": oni_meta["downloaded_at_utc"],
            "sha256": oni_meta["sha256"],
            "original_file": "simulacion/backend/data/power/obrajes/2026-11-14/oni_original.txt",
            "classifier": "simulacion/scripts/power_d1_2.py",
        },
        "rule": {
            "season": "NDJ del año inicial de la campaña (nov y–ene y+1)",
            "nino_c": 0.5,
            "nina_c": -0.5,
            "strong_nino_c": 1.5,
            "persistence": "ninguna adicional",
            "campaign": "1 nov–31 mar; mínimo 140 días válidos de lluvia",
        },
        "groups": {
            phase: sum(1 for c in campaigns if c["fase_enso"] == phase)
            for phase in ("Normal", "Niño", "Niña")
        }
        | {"Niño fuerte": sum(1 for c in campaigns if c["nino_fuerte"] == "True")},
        "campaigns": [
            {
                "campaign": c["campania"],
                "start_year": int(c["anio_inicio"]),
                "oni_ndj": float(c["oni_ndj_c"]),
                "phase": c["fase_enso"],
                "strong_nino": c["nino_fuerte"] == "True",
            }
            for c in campaigns
        ],
        "window_rule": "La fase de una ventana es la de su primera campaña; las otras dos conservan su clima histórico.",
    }
    result = {
        **common,
        "mode": "simulated",
        "sources": sources,
        "warnings": warnings,
        "kpi_units": KPI_UNITS,
        "records": records,
        "aggregates": aggregates,
        "assumptions": assumptions,
        "limits": model_limits,
        "nine_cases_approved": True,
        "approval_source": "PROMPT_DEV1_IA.md y content/p6/rotations.json",
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, data in [
        ("catalog.json", catalog),
        ("climate.json", climate),
        ("enso_campaigns.json", enso),
        ("results.json", result),
    ]:
        # Solo la salida simulada se redondea; los datos descargados (clima, ONI) quedan exactos.
        simulated = name == "results.json"
        write(OUTPUT / "data" / name, rounded(data) if simulated else data, compact=simulated)
    package = read(SIM / "frontend/package.json")
    write(
        OUTPUT / "data/credits.json",
        {
            **common,
            "sections": credit_sections(
                (CONTENT / "P6-6_fuentes_licencias_IA.md").read_text()
            ),
            "framework": f"React {package['dependencies']['react']} · MIT",
            "library": f"Vite {package['devDependencies']['vite']} · MIT",
            "backend": "FastAPI · MIT",
            "spanish_audio_status": "not_supplied_user_requested_skip",
        },
    )
    audio = OUTPUT / "audio"
    audio.mkdir(exist_ok=True)
    for name in ("boletin_qu_productor.mp3", "boletin_qu_productor.txt"):
        shutil.copyfile(CONTENT / "audio" / name, audio / name)
    spanish = (
        (CONTENT / "P6-5_boletin.md").read_text().split("## Boletín en español", 1)[1]
    )
    spanish = spanish.split("**Prohibido agregar:**", 1)[0]
    transcript = "\n".join(
        line[2:] for line in spanish.splitlines() if line.startswith("> ")
    )
    (audio / "boletin_es.txt").write_text(transcript + "\n")
    write(
        OUTPUT / "data/audio.json",
        {
            **common,
            "quechua_text": (audio / "boletin_qu_productor.txt").read_text(),
            "spanish_text": transcript,
            "spanish_mp3": None,
            "quechua_mp3": "/raiz/audio/boletin_qu_productor.mp3",
            "distribution_status": "prepared_not_broadcast",
        },
    )
    download = OUTPUT / "downloads"
    download.mkdir(exist_ok=True)
    scientific_zip = SIM / "docs/validaciones/obrajes-D1-2-privacidad-2026-11-14.zip"
    assert (
        digest(scientific_zip)
        == "2b75d03c73d9467b148280d0709e54e640a5a69a2f455615ecd25cb4fe135d57"
    )
    shutil.copyfile(scientific_zip, download / scientific_zip.name)
    manifest = {
        **common,
        "inputs": [
            {"path": str(p.relative_to(REPO)), "sha256": digest(p)} for p in inputs
        ],
        "files": [
            {
                "path": str(p.relative_to(OUTPUT)),
                "sha256": digest(p),
                "bytes": p.stat().st_size,
            }
            for p in sorted(OUTPUT.rglob("*"))
            if p.is_file() and p.name != "manifest.json"
        ],
        "private_permission_not_published": True,
        "n_cases": len(cases),
        "n_windows": len(windows),
        "n_records": len(records),
    }
    write(OUTPUT / "data/manifest.json", manifest)
    return {
        "build_id": build_id,
        "cases": len(cases),
        "windows": len(windows),
        "records": len(records),
    }


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False))
