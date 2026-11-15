"""Balance hídrico diario para ventanas de tres campañas, sin rendimiento ni pronóstico.

FAO-56 (Allen et al. 1998): ET0 Penman-Monteith (ec. 6-58), Kc por etapas (Tabla 11-12),
balance de la zona radicular (cap. 8, ec. 81-88) y evaporación de suelo desnudo con
REW/TEW (cap. 7, ec. 71-77). Escorrentía: curva número USDA-NRCS (TR-55).

El volumen de control es una profundidad de suelo común a todos los cultivos: la humedad
pasa de una campaña a la siguiente y el cierre del balance se comprueba por ventana.
Cada valor que P6 no entregó es un supuesto con fuente, listado en ``MODEL_ASSUMPTIONS``.
"""

import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

type Json = dict[str, Any]

MODEL_VERSION = "fao56-balance-1"
FAO56_URL = "https://www.fao.org/4/x0490e/x0490e0b.htm"
METEOROLOGICAL_KEYS = (
    "T2M",
    "T2M_MIN",
    "T2M_MAX",
    "RH2M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
)
STAGE_REFERENCES = {
    "papa": (25, 30, 45, 30),
    "haba": (90, 45, 40, 60),
    # Tabla 11 no tiene quinua. Proxy explícito de cereales pequeños; no observación local.
    "quinua": (20, 30, 60, 40),
}

# ---------------------------------------------------------------- supuestos con fuente

#: FAO-56 Tabla 22 no tiene quinua; p de cereales pequeños (cebada, avena, trigo).
QUINOA_P_PROXY = 0.55
#: FAO-56 ec. 72 con altura de cultivo 0: Kc máximo tras una lluvia sobre suelo desnudo.
KC_MAX_BARE = 1.20
#: FAO-56 Tabla 19 (Ze = 0,10 m). La clase franco arcillo arenosa no figura: se usa el
#: solape de las clases franco arenosa y franca.
REW_MM = 8.0
TEW_MM = 18.0
#: TR-55 (USDA-NRCS 1986) Tabla 2-2, grupo hidrológico C (aproximación por textura), AMC II.
CN_CROP = 85  # cultivos en hilera, surco recto, condición buena
CN_DESCANSO = 86  # pastura en condición pobre: maleza pastoreada
CN_BARE = 91  # barbecho de suelo desnudo
#: Wischmeier y Smith (1978), RUSLE: lluvia diaria considerada erosiva.
RAIN_EROSIVE_MM = 12.7
#: Fryrear et al. (1998), RWEQ: umbral de viento erosivo a 2 m. POWER da media diaria.
WIND_EROSIVE_MS = 5.0
#: Umbral de la etapa sensible por cultivo (crops.json de P6) aplicado a la Tmin del aire.
FROST_THRESHOLD_KEY = {
    "papa": "frost_lethal_c",
    "quinua": "frost_lethal_anthesis_tolerant_c",
    "haba": "frost_damage_flowering_c",
}
#: Calendario supuesto de cada campaña con cultivo (día, mes).
SEASON_START = (1, 10)
SEASON_END = (15, 4)


@dataclass(frozen=True)
class SoilCase:
    """Supuestos de suelo de una corrida; ninguno está medido en la parcela."""

    id: str
    awc_m_per_m: float
    depth_m: float
    initial_depletion_fraction: float

    @property
    def taw_mm(self) -> float:
        return 1000 * self.awc_m_per_m * self.depth_m


#: Corrida central y extremos para mostrar el rango por supuestos (no es incertidumbre total).
SOIL_CENTRAL = SoilCase("central", 0.15, 0.6, 0.5)
SOIL_LOW = SoilCase("suelo_bajo", 0.14, 0.4, 1.0)
SOIL_HIGH = SoilCase("suelo_alto", 0.16, 1.0, 0.0)

MODEL_ASSUMPTIONS: list[Json] = [
    {
        "source": "assumption_calendar_oct01_apr15",
        "value": (
            "Cultivo del 1 de octubre al 15 de abril; fuera de ese lapso el suelo queda sin cultivo"
            " planificado"
        ),
    },
    {
        "source": "assumption_fao56_t11",
        "value": (
            "Proporciones Tabla 11 escaladas; papa 25/30/45/30, haba seca 90/45/40/60; quinua usa "
            "proxy de cereales pequeños 20/30/60/40"
        ),
    },
    {
        "source": "assumption_control_depth_common",
        "value": (
            "Profundidad de control común de 0,6 m (rango 0,4–1,0 m): papa 0,4–0,6 y haba 0,5–0,7 "
            "(FAO-56 T22, P6); la quinua (1,0–1,5 m) queda subrepresentada"
        ),
        "unit": "m",
        "measured": False,
    },
    {
        "source": "assumption_soil_awc_nrcs_texture",
        "value": [0.14, 0.16],
        "central": 0.15,
        "unit": "m/m",
        "measured": False,
    },
    {
        "source": "assumption_initial_depletion",
        "value": (
            "Inicio de cada ventana el 1 de julio con 50 % del agua disponible agotada; extremos: "
            "suelo seco y a capacidad de campo"
        ),
    },
    {
        "source": "assumption_quinoa_p_cereal_proxy",
        "value": QUINOA_P_PROXY,
        "note": (
            "FAO-56 T22 no tiene quinua; p de cereales pequeños. Papa 0,35 y haba 0,45 vienen de P6"
            " (FAO-56 T22)."
        ),
    },
    {
        "source": "assumption_bare_soil_evaporation_fao56",
        "value": (
            "Suelo sin cultivo y descanso: evaporación en dos etapas, Kc máx "
            f"{str(KC_MAX_BARE).replace('.', ',')}, REW {REW_MM:g} mm, TEW {TEW_MM:g} mm "
            "(FAO-56 ec. 71-77, Tabla 19). No incluye transpiración de la maleza del descanso."
        ),
    },
    {
        "source": "assumption_runoff_scs_cn",
        "value": (
            f"Curva número TR-55, grupo C, AMC II: cultivo {CN_CROP}, descanso {CN_DESCANSO}, suelo"
            f" desnudo {CN_BARE}"
        ),
    },
    {
        "source": "assumption_no_capillary_rise",
        "value": "Sin ascenso capilar: napa freática supuesta profunda",
    },
    {
        "source": "assumption_irrigation_rule",
        "value": (
            "Riego al inicio del día en que el agotamiento supera el agua fácilmente aprovechable; "
            "lámina neta que repone a capacidad de campo hasta agotar el cupo de la campaña"
        ),
    },
    {
        "source": "assumption_heavy_rain_threshold",
        "value": RAIN_EROSIVE_MM,
        "unit": "mm/día",
        "reference": "Wischmeier y Smith 1978 (USDA AH-537), lluvia erosiva",
    },
    {
        "source": "assumption_wind_threshold",
        "value": WIND_EROSIVE_MS,
        "unit": "m/s a 2 m, media diaria",
        "reference": "Fryrear et al. 1998, RWEQ",
    },
    {
        "source": "assumption_frost_thresholds_air",
        "value": (
            "Días con Tmin del aire a 2 m ≤ umbral de la etapa sensible (papa −2,5 °C; quinua −4 "
            "°C; haba −1 °C, P6) en todo el ciclo"
        ),
        "note": (
            "Los umbrales son de tejido vegetal; la celda POWER mide aire regional. Indicador de "
            "exposición, no de daño."
        ),
    },
]

# ---------------------------------------------------------------- utilidades


def days_between(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def et0_penman_monteith(day: date, row: Json, latitude: float, elevation: float) -> float | None:
    """ET0 diaria en mm/día; radiación recibida en MJ/m²/día, viento a 2 m."""
    if any(row.get(key) is None for key in METEOROLOGICAL_KEYS):
        return None
    mean, low, high = (row[key] for key in ("T2M", "T2M_MIN", "T2M_MAX"))
    rh, wind, solar = (row[key] for key in ("RH2M", "WS2M", "ALLSKY_SFC_SW_DWN"))
    if not low <= high or not 0 <= rh <= 100 or wind < 0 or solar < 0:
        raise ValueError("Meteorología fuera de rango")

    def es(temp: float) -> float:
        return 0.6108 * math.exp(17.27 * temp / (temp + 237.3))

    saturated = (es(low) + es(high)) / 2
    actual = saturated * rh / 100  # Aproximación con RH media, FAO-56 eq. 19.
    slope = 4098 * es(mean) / (mean + 237.3) ** 2
    pressure = 101.3 * ((293 - 0.0065 * elevation) / 293) ** 5.26
    gamma = 0.000665 * pressure
    j = day.timetuple().tm_yday
    phi = math.radians(latitude)
    distance = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    declination = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    sunset = math.acos(max(-1, min(1, -math.tan(phi) * math.tan(declination))))
    extraterrestrial = (
        (24 * 60 / math.pi)
        * 0.0820
        * distance
        * (
            sunset * math.sin(phi) * math.sin(declination)
            + math.cos(phi) * math.cos(declination) * math.sin(sunset)
        )
    )
    clear_sky = (0.75 + 0.00002 * elevation) * extraterrestrial
    relative_solar = max(0.3, min(1, solar / clear_sky)) if clear_sky > 0 else 0.3
    net_longwave = (
        4.903e-9
        * ((high + 273.16) ** 4 + (low + 273.16) ** 4)
        / 2
        * (0.34 - 0.14 * math.sqrt(actual))
        * (1.35 * relative_solar - 0.35)
    )
    net_radiation = 0.77 * solar - net_longwave
    numerator = 0.408 * slope * net_radiation + gamma * (900 / (mean + 273)) * wind * (
        saturated - actual
    )
    return max(0.0, float(numerator / (slope + gamma * (1 + 0.34 * wind))))


def scaled_stages(crop_id: str, total: int) -> list[int]:
    """Proporciones Tabla 11 escaladas, conservando exactamente el total de días."""
    reference = STAGE_REFERENCES[crop_id]
    fractions = [total * n / sum(reference) for n in reference]
    stages = [int(n) for n in fractions]
    remaining = total - sum(stages)
    order = sorted(range(4), key=lambda i: fractions[i] - stages[i], reverse=True)
    for i in order[:remaining]:
        stages[i] += 1
    return stages


def kc_for_day(index: int, stages: list[int], kc: Json) -> float:
    initial, development, middle, late = stages
    kc_ini, kc_mid, kc_end = (float(kc[key]) for key in ("ini", "mid", "end"))
    if index < initial:
        return kc_ini
    if index < initial + development:
        return kc_ini + (kc_mid - kc_ini) * (index - initial + 0.5) / development
    if index < initial + development + middle:
        return kc_mid
    return kc_mid + (kc_end - kc_mid) * (index - initial - development - middle + 0.5) / late


def scs_runoff(rain: float, curve_number: float) -> float:
    """Escorrentía diaria (mm) por curva número, Ia = 0,2 S."""
    retention = 25400 / curve_number - 254
    initial = 0.2 * retention
    if rain <= initial:
        return 0.0
    return (rain - initial) ** 2 / (rain - initial + retention)


def depletion_fraction(crop: Json) -> float:
    value = crop.get("depletion_p")
    return float(value) if value is not None else QUINOA_P_PROXY


def irrigated(crop: Json) -> bool:
    """Riego de pozo declarado por el productor (calendario de P6)."""
    text = str(crop.get("calendar", {}).get("irrigation", "")).lower()
    return "pozo" in text and "secano" not in text


def frost_threshold(crop: Json) -> float | None:
    key = FROST_THRESHOLD_KEY.get(crop["id"])
    thresholds = crop.get("thresholds") or {}
    value = thresholds.get(key) if key else None
    return float(value) if value is not None else None


def window_days(year: int) -> list[date]:
    """Treinta y seis meses: 1 de julio del año inicial al 30 de junio del cuarto año."""
    return days_between(date(year, 7, 1), date(year + 3, 6, 30))


def season_bounds(year: int) -> tuple[date, date]:
    return (
        date(year, SEASON_START[1], SEASON_START[0]),
        date(year + 1, SEASON_END[1], SEASON_END[0]),
    )


# ---------------------------------------------------------------- balance


def simulate_window(
    sequence: list[str],
    year: int,
    daily: dict[str, Json],
    et0: dict[str, float | None],
    crops: dict[str, Json],
    soil: SoilCase,
    budget_mm: float | None,
) -> Json:
    """Simula una ventana de tres campañas y devuelve KPI por posición y cierre del balance.

    ``budget_mm`` es el cupo de riego neto por campaña con riego: ``None`` sin límite
    (requerimiento) y 0 para secano. La quinua se maneja en secano según el productor.
    """
    taw = soil.taw_mm
    depletion = soil.initial_depletion_fraction * taw
    surface = min(TEW_MM, depletion)
    storage_start = taw - depletion
    totals = dict.fromkeys(("rain", "runoff", "irrigation", "et", "drainage"), 0.0)

    positions: list[Json] = []
    for k, crop_id in enumerate(sequence):
        crop = crops[crop_id]
        start, end = season_bounds(year + k)
        is_crop = crop_id != "descanso"
        stages = scaled_stages(crop_id, (end - start).days + 1) if is_crop else None
        acc = dict.fromkeys(
            (
                "season_rain",
                "season_runoff",
                "season_drainage",
                "crop_demand",
                "eta",
                "deficit",
                "applied",
            ),
            0.0,
        )
        counts = dict.fromkeys(
            (
                "stress",
                "frost",
                "crop_days",
                "descanso_days",
                "bare_days",
                "bare_rain",
                "bare_wind",
                "days",
            ),
            0,
        )
        remaining = math.inf if budget_mm is None else budget_mm
        can_irrigate = is_crop and irrigated(crop)
        p_table = depletion_fraction(crop) if is_crop else None
        frost = frost_threshold(crop) if is_crop else None

        for day in days_between(date(year + k, 7, 1), date(year + k + 1, 6, 30)):
            key = day.isoformat()
            row = daily[key]
            rain = float(row["PRECTOTCORR"])
            reference = et0[key]
            if reference is None:
                raise ValueError(f"ET0 faltante el {key}")
            in_season = is_crop and start <= day <= end
            counts["days"] += 1

            if in_season:
                assert stages is not None and p_table is not None
                index = (day - start).days
                kc = kc_for_day(index, stages, crop["kc"])
                etc = kc * reference
                p = min(0.8, max(0.1, p_table + 0.04 * (5 - etc)))  # FAO-56, nota Tabla 22
                raw = p * taw
                irrigation = 0.0
                if can_irrigate and depletion > raw and remaining > 0:
                    irrigation = min(depletion, remaining)
                    remaining -= irrigation
                    depletion -= irrigation
                ks = 1.0 if depletion <= raw else max(0.0, (taw - depletion) / ((1 - p) * taw))
                et_actual = ks * etc
                runoff = scs_runoff(rain, CN_CROP)
                acc["crop_demand"] += etc
                acc["deficit"] += etc - et_actual
                acc["applied"] += irrigation
                counts["stress"] += ks < 1
                counts["crop_days"] += 1
                if frost is not None and row["T2M_MIN"] is not None and row["T2M_MIN"] <= frost:
                    counts["frost"] += 1
            else:
                irrigation = 0.0
                kr = 1.0 if surface <= REW_MM else max(0.0, (TEW_MM - surface) / (TEW_MM - REW_MM))
                et_actual = kr * KC_MAX_BARE * reference
                descanso = crop_id == "descanso"
                runoff = scs_runoff(rain, CN_DESCANSO if descanso else CN_BARE)
                if descanso:
                    counts["descanso_days"] += 1
                else:
                    counts["bare_days"] += 1
                    counts["bare_rain"] += rain >= RAIN_EROSIVE_MM
                    wind = row.get("WS2M")
                    counts["bare_wind"] += wind is not None and wind >= WIND_EROSIVE_MS

            infiltration = rain - runoff
            new_depletion = depletion - infiltration + et_actual
            drainage = 0.0
            if new_depletion < 0:
                drainage = -new_depletion
                new_depletion = 0.0
            if new_depletion > taw:  # no se extrae agua bajo el punto de marchitez
                et_actual -= new_depletion - taw
                new_depletion = taw
            if not in_season:
                surface = min(TEW_MM, max(0.0, surface - infiltration + et_actual))
            else:
                surface = min(TEW_MM, new_depletion)
            depletion = new_depletion

            acc["eta"] += et_actual
            if in_season:
                acc["season_rain"] += rain
                acc["season_runoff"] += runoff
                acc["season_drainage"] += drainage
            totals["rain"] += rain
            totals["runoff"] += runoff
            totals["irrigation"] += irrigation
            totals["et"] += et_actual
            totals["drainage"] += drainage

        positions.append(
            {
                "crop": crop_id,
                "campaign": f"{year + k}-{str(year + k + 1)[2:]}",
                "irrigated": can_irrigate,
                "crop_demand_mm": acc["crop_demand"] if is_crop else None,
                "effective_rain_mm": (
                    acc["season_rain"] - acc["season_runoff"] - acc["season_drainage"]
                    if is_crop
                    else None
                ),
                "net_irrigation_applied_mm": acc["applied"] if can_irrigate else None,
                "water_deficit_mm": acc["deficit"] if is_crop else None,
                "water_stress_days": counts["stress"] if is_crop else None,
                "thermal_exposure_days": counts["frost"] if is_crop and frost is not None else None,
                "coverage_pct": 100 * counts["crop_days"] / counts["days"],
                "partial_cover_pct": 100 * counts["descanso_days"] / counts["days"],
                "bare_days": counts["bare_days"],
                "bare_rain_exposure_days": counts["bare_rain"],
                "bare_wind_exposure_days": counts["bare_wind"],
            }
        )

    storage_end = taw - depletion
    closure = (
        totals["rain"] - totals["runoff"] + totals["irrigation"] - totals["et"] - totals["drainage"]
    ) - (storage_end - storage_start)
    return {
        "positions": positions,
        "balance": {
            "rain_mm": totals["rain"],
            "runoff_mm": totals["runoff"],
            "irrigation_mm": totals["irrigation"],
            "et_mm": totals["et"],
            "drainage_mm": totals["drainage"],
            "storage_start_mm": storage_start,
            "storage_end_mm": storage_end,
            "closure_mm": closure,
        },
    }


# ---------------------------------------------------------------- KPI

#: KPI por campaña y por ciclo, con su unidad. El orden es el del contrato v3.
KPI_UNITS: dict[str, str] = {
    "net_irrigation_required_mm": "mm",
    "net_irrigation_applied_mm": "mm",
    "water_deficit_mm": "mm",
    "water_stress_days": "días",
    "crop_demand_mm": "mm",
    "effective_rain_mm": "mm",
    "thermal_exposure_days": "días",
    "coverage_pct": "%",
    "partial_cover_pct": "%",
    "bare_days": "días",
    "bare_rain_exposure_days": "días",
    "bare_wind_exposure_days": "días",
}
KPI_KEYS = tuple(KPI_UNITS)
#: Porcentajes del ciclo: promedio de las tres campañas (años agrícolas de igual longitud aprox.).
AVERAGED_KEYS = ("coverage_pct", "partial_cover_pct")


def cycle_metrics(positions: list[Json]) -> Json:
    """Suma magnitudes aditivas aplicables; un KPI sin ninguna campaña aplicable queda null."""
    output: Json = {}
    for key in KPI_KEYS:
        values = [p[key] for p in positions if p.get(key) is not None]
        if not values:
            output[key] = None
        elif key in AVERAGED_KEYS:
            output[key] = math.fsum(values) / len(values)
        else:
            output[key] = math.fsum(values)
    return output


def summarize(records: list[Json], level: str) -> Json:
    output = {}
    for key in KPI_KEYS:
        values = [r[level][key] for r in records if r[level].get(key) is not None]
        output[key] = {
            "mean": math.fsum(values) / len(values) if values else None,
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "n": len(values),
        }
    return output
