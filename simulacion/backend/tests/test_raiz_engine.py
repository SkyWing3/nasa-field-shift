import json
import math
import random
from datetime import date
from pathlib import Path

import pytest

from app.engine.raiz import (
    CN_CROP,
    MODEL_VERSION,
    SOIL_CENTRAL,
    SOIL_HIGH,
    SOIL_LOW,
    TEW_MM,
    Json,
    SoilCase,
    cycle_metrics,
    et0_penman_monteith,
    scaled_stages,
    scs_runoff,
    simulate_window,
    window_days,
)

ROOT = Path(__file__).resolve().parents[3]
CROPS = {c["id"]: c for c in json.loads((ROOT / "content/p6/crops.json").read_bytes())["crops"]}


def test_penman_monteith_fao56_example_18() -> None:
    # Uccle, 6 julio: FAO-56 capítulo 4, ejemplo 18, ET0 = 3,88 mm/día.
    # RH equivalente a ea=1,409 kPa para probar la entrada RH media que usa POWER.
    row = {
        "T2M": 16.9,
        "T2M_MIN": 12.3,
        "T2M_MAX": 21.5,
        "RH2M": 70.5558,
        "WS2M": 2.078,
        "ALLSKY_SFC_SW_DWN": 22.07,
    }
    actual = et0_penman_monteith(date(2001, 7, 6), row, 50.8, 100)
    assert actual == pytest.approx(3.88, abs=0.03)
    missing = {**row, "ALLSKY_SFC_SW_DWN": None}
    assert et0_penman_monteith(date(2001, 7, 6), missing, 50.8, 100) is None


@pytest.mark.parametrize("crop", ["papa", "haba", "quinua"])
def test_stage_scaling_preserves_calendar_and_all_four_stages(crop: str) -> None:
    for total in (197, 198, 210):
        stages = scaled_stages(crop, total)
        assert sum(stages) == total
        assert len(stages) == 4 and all(n > 0 for n in stages)


def test_scs_curve_number_matches_hand_calculation() -> None:
    # CN 85: S = 25400/85 − 254 = 44,824 mm; Ia = 8,965 mm; Q(50) = 41,035² / 85,859.
    assert scs_runoff(50, CN_CROP) == pytest.approx(41.0353**2 / 85.859, rel=1e-4)
    assert scs_runoff(8.9, CN_CROP) == 0


def weather(
    rain: float | None = None, seed: int = 0, tmin: float = 2.0
) -> tuple[dict[str, Json], dict[str, float | None]]:
    """Clima sintético de 36 meses: lluvia fija o aleatoria (cero en la estación seca)."""
    rng = random.Random(seed)
    daily: dict[str, Json] = {}
    et0: dict[str, float | None] = {}
    for d in window_days(2000):
        wet = d.month in (11, 12, 1, 2, 3)
        value = rain if rain is not None else (rng.choice([0, 0, 0, 2, 6, 15, 30]) if wet else 0)
        daily[d.isoformat()] = {
            "PRECTOTCORR": value,
            "T2M_MIN": tmin,
            "WS2M": 6.0 if not wet else 2.0,
        }
        et0[d.isoformat()] = 4.5
    return daily, et0


SEQUENCES = (
    ["papa", "quinua", "descanso"],
    ["papa", "quinua", "haba"],
    ["papa", "haba", "descanso"],
)


@pytest.mark.parametrize("sequence", SEQUENCES)
@pytest.mark.parametrize("budget", [None, 150.0, 0.0])
@pytest.mark.parametrize("soil", [SOIL_CENTRAL, SOIL_LOW, SOIL_HIGH])
def test_balance_conserves_water_for_every_budget_and_soil(
    sequence: list[str], budget: float | None, soil: SoilCase
) -> None:
    for seed in range(3):
        daily, et0 = weather(seed=seed)
        result = simulate_window(sequence, 2000, daily, et0, CROPS, soil, budget)
        b = result["balance"]
        assert abs(b["closure_mm"]) < 1e-6
        assert 0 <= b["storage_end_mm"] <= soil.taw_mm + 1e-9
        assert b["runoff_mm"] >= 0 and b["drainage_mm"] >= 0 and b["et_mm"] >= 0


def test_unlimited_irrigation_avoids_stress_in_irrigated_crops_only() -> None:
    daily, et0 = weather(rain=0)
    result = simulate_window(
        ["papa", "quinua", "haba"], 2000, daily, et0, CROPS, SOIL_CENTRAL, None
    )
    papa, quinua, haba = result["positions"]
    for irrigated_crop in (papa, haba):
        assert irrigated_crop["net_irrigation_applied_mm"] > 0
        assert irrigated_crop["water_stress_days"] == 0
        assert irrigated_crop["water_deficit_mm"] == pytest.approx(0)
    # La quinua es de secano según el productor: no recibe riego y sufre estrés sin lluvia.
    assert quinua["net_irrigation_applied_mm"] is None
    assert quinua["water_stress_days"] > 0 and quinua["water_deficit_mm"] > 0


def test_budget_caps_irrigation_per_campaign_and_leaves_residual_stress() -> None:
    daily, et0 = weather(rain=0)
    unlimited = simulate_window(
        ["papa", "haba", "descanso"], 2000, daily, et0, CROPS, SOIL_CENTRAL, None
    )
    capped = simulate_window(
        ["papa", "haba", "descanso"], 2000, daily, et0, CROPS, SOIL_CENTRAL, 100.0
    )
    rainfed = simulate_window(
        ["papa", "haba", "descanso"], 2000, daily, et0, CROPS, SOIL_CENTRAL, 0.0
    )
    for i in (0, 1):
        assert capped["positions"][i]["net_irrigation_applied_mm"] <= 100.0 + 1e-9
        assert rainfed["positions"][i]["net_irrigation_applied_mm"] == 0
        assert (
            unlimited["positions"][i]["water_stress_days"]
            <= capped["positions"][i]["water_stress_days"]
            <= rainfed["positions"][i]["water_stress_days"]
        )
    assert rainfed["positions"][0]["water_deficit_mm"] > capped["positions"][0]["water_deficit_mm"]


def test_rest_is_partial_cover_not_bare_and_has_no_crop_kpis() -> None:
    daily, et0 = weather(seed=1)
    result = simulate_window(
        ["descanso", "papa", "quinua"], 2000, daily, et0, CROPS, SOIL_CENTRAL, None
    )
    rest, papa, _ = result["positions"]
    assert rest["partial_cover_pct"] == 100 and rest["coverage_pct"] == 0 and rest["bare_days"] == 0
    assert rest["water_deficit_mm"] is None and rest["net_irrigation_applied_mm"] is None
    # Papa: 1 oct–15 abr con cultivo; el resto del año agrícola queda sin cultivo planificado.
    assert papa["bare_days"] == 365 - 197
    assert papa["coverage_pct"] == pytest.approx(100 * 197 / 365)


def test_exposure_counts_use_documented_thresholds() -> None:
    daily, et0 = weather(rain=0, tmin=-3.0)  # viento 6 m/s fuera de nov–mar
    result = simulate_window(
        ["papa", "quinua", "haba"], 2000, daily, et0, CROPS, SOIL_CENTRAL, None
    )
    papa, quinua, haba = result["positions"]
    assert papa["thermal_exposure_days"] == 197  # −3 ≤ −2,5
    assert quinua["thermal_exposure_days"] == 0  # −3 > −4
    assert haba["thermal_exposure_days"] == 197  # −3 ≤ −1
    assert (
        papa["bare_wind_exposure_days"] == papa["bare_days"]
    )  # sin cultivo y sin lluvia: viento seco
    assert papa["bare_rain_exposure_days"] == 0


def test_moisture_carries_over_between_campaigns() -> None:
    """Tras una sola lluvia (nov–dic 2000) y luego sequía, el descanso conserva agua que la
    haba consume: la papa siguiente, en secano, sufre menos estrés después del descanso."""
    daily, et0 = weather(rain=0)
    for d in window_days(2000):
        if date(2000, 11, 1) <= d <= date(2000, 12, 31):
            daily[d.isoformat()]["PRECTOTCORR"] = 10.0
    after_rest = simulate_window(
        ["descanso", "papa", "quinua"], 2000, daily, et0, CROPS, SOIL_CENTRAL, 0.0
    )
    after_crop = simulate_window(
        ["haba", "papa", "quinua"], 2000, daily, et0, CROPS, SOIL_CENTRAL, 0.0
    )
    rest_papa, crop_papa = after_rest["positions"][1], after_crop["positions"][1]
    assert rest_papa["water_stress_days"] < crop_papa["water_stress_days"]
    assert rest_papa["water_deficit_mm"] < crop_papa["water_deficit_mm"]


def test_surface_evaporation_is_bounded_by_tew_in_a_dry_season() -> None:
    daily, et0 = weather(rain=0)
    start_full = SoilCase("prueba", 0.15, 0.6, 0.0)
    result = simulate_window(
        ["descanso", "descanso", "descanso"], 2000, daily, et0, CROPS, start_full, None
    )
    # Sin lluvia, el suelo desnudo solo pierde el agua evaporable de la capa superficial.
    assert result["balance"]["et_mm"] == pytest.approx(TEW_MM)


def test_cycle_metrics_sum_applicable_and_average_percentages() -> None:
    positions: list[Json] = [
        {"water_deficit_mm": 10.0, "coverage_pct": 50.0, "partial_cover_pct": 0.0},
        {"water_deficit_mm": None, "coverage_pct": 0.0, "partial_cover_pct": 100.0},
        {"water_deficit_mm": 5.0, "coverage_pct": 52.0, "partial_cover_pct": 0.0},
    ]
    cycle = cycle_metrics(positions)
    assert cycle["water_deficit_mm"] == 15.0
    assert cycle["coverage_pct"] == pytest.approx(34.0)
    assert cycle["thermal_exposure_days"] is None


def test_published_package_is_consistent_with_the_balance_model() -> None:
    folder = ROOT / "simulacion/frontend/public/raiz/data"
    catalog = json.loads((folder / "catalog.json").read_bytes())
    climate = json.loads((folder / "climate.json").read_bytes())
    results = json.loads((folder / "results.json").read_bytes())
    assert catalog["build_id"] == climate["build_id"] == results["build_id"]
    assert results["model_version"] == MODEL_VERSION
    budgets = [b["id"] for b in catalog["water_budgets"]]
    assert budgets[0] == "requerimiento" and "secano" in budgets
    assert len(results["records"]) == 9 * len(climate["windows"]) * len(budgets)
    cases = {c["case_id"]: c for c in catalog["cases"]}
    windows = {w["window_id"]: w for w in climate["windows"]}
    for record in results["records"]:
        expected = windows[record["window_id"]]
        assert record["result_id"] == (
            f"{results['build_id']}/{record['case_id']}/{record['water_budget_id']}/{record['window_id']}"
        )
        assert [c["campaign"] for c in record["campaigns"]] == expected["campaigns"]
        assert [c["crop"] for c in record["campaigns"]] == cases[record["case_id"]]["crops"]
        assert record["enso_initial_phase"] == expected["phase"]
        assert abs(record["balance"]["closure_mm"]) < 0.01
        if record["water_budget_id"] == "secano":
            assert record["cycle_kpis"]["net_irrigation_applied_mm"] == 0
    assert all(
        r["period_id"] == "cross_period"
        for r in results["records"]
        if r["window_id"] in {"1999", "2000"}
    )
    assert not any(
        math.isnan(v) for r in results["records"] for v in r["cycle_kpis"].values() if v is not None
    )
