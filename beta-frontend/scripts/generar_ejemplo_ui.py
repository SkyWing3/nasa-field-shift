"""Genera el EJEMPLO SINTÉTICO de interfaz (Dev 3).

ADVERTENCIA: todas las cifras de este archivo son INVENTADAS para probar la
interfaz (gráficas, ranking, empates, n<3, faltantes). No son datos NASA POWER,
no son ONI de NOAA y no son resultados de Dev 1. Nunca presentarlas como reales.

Sigue el contrato v3.1 de Dev 2 (contracts/dev2-v31.md) y añade campos
TEMPORALES marcados con «TEMP-D3» que hay que acordar con Dev 1 y Dev 2:
  - climate.data.period_summaries   (resúmenes por periodo para D3-2)
  - climate.data.campaigns          (ONI NDJ y fase ENSO por campaña)
  - catalog.data.enso_rule          (regla ENSO usada)
  - catalog.data.rules.bare_soil    (umbrales del semáforo de suelo, D3-4)
  - results.records[].coverage_calendar (cobertura mensual, D3-4)

Uso (desde beta-frontend/):  python3 scripts/generar_ejemplo_ui.py
Salida: public/ejemplo-ui/current.json y public/ejemplo-ui/releases/<build>/data/*.json
"""
import json
import random
from pathlib import Path

BUILD = "ejemplo-ui-sintetico"
RAIZ = Path(__file__).resolve().parents[1] / "public" / "ejemplo-ui"
SALIDA = RAIZ / "releases" / BUILD / "data"

AVISO = ("FIXTURE · DATOS DE EJEMPLO, NO NASA: cifras inventadas por Dev 3 solo para "
         "probar la interfaz. No son NASA POWER, ni ONI de NOAA, ni resultados de Dev 1.")


def sobre(data):
    return {
        "schema_version": "3.0",
        "build_id": BUILD,
        "mode": "fixture",
        "example_profile": "ui-sintetico",  # TEMP-D3: distingue este ejemplo del fixture vacío de Dev 2
        "generated_at": None,
        "data_as_of": None,
        "model_version": None,
        "sources": [],
        "assumptions": [
            "Secuencias candidatas del alcance v3; no confirmadas en una parcela",
            "Rotación A (papa/quinua/descanso) es base SUPUESTA hasta que P6 confirme orden y riego",
        ],
        "warnings": [AVISO],
        "data": data,
    }


ROTACIONES = {
    "A": ("papa-quinua-descanso", ["papa", "quinua", "descanso"]),
    "B": ("papa-quinua-haba", ["papa", "quinua", "haba"]),
    "C": ("papa-haba-descanso", ["papa", "haba", "descanso"]),
}
PERIODOS = [
    {"period_id": "p1981-2000", "start_campaign_year": 1981, "end_campaign_year": 2000, "label": "1981–2000 (antes)"},
    {"period_id": "p2001-2025", "start_campaign_year": 2001, "end_campaign_year": 2025, "label": "2001–2025 (ahora)"},
]
PRESUPUESTOS = [
    {"water_budget_id": "secano", "net_limit_mm": 0, "label": "Secano (sin riego)"},
    {"water_budget_id": "riego-80", "net_limit_mm": 80, "label": "Hasta 80 mm por campaña"},
    {"water_budget_id": "riego-160", "net_limit_mm": 160, "label": "Hasta 160 mm por campaña"},
]
SUELO = {"soil_profile_id": "franco-arenoso-supuesto", "nature": "scenario_assumption",
         "label": "Franco arenoso (supuesto de escenario)",
         "available_water_mm": 90, "root_depth_m": 0.5,
         "method": "Valor de ejemplo; P6 debe aportar perfil medido o de mapa"}

# Necesidad de agua y estrés relativos por cultivo (inventados, solo forma).
CULTIVO = {
    "papa": {"riego": 120, "estres": 14, "cobertura": 55, "termica": 6},
    "quinua": {"riego": 70, "estres": 9, "cobertura": 50, "termica": 3},
    "haba": {"riego": 95, "estres": 11, "cobertura": 60, "termica": 5},
    "descanso": {"riego": 0, "estres": 0, "cobertura": 30, "termica": None},
}
EFECTO_ENSO = {"Normal": 1.0, "Niño": 1.25, "Niño fuerte": 1.4, "Niña": 0.85}


def campanas():
    """ONI NDJ INVENTADO por campaña (no es NOAA). Fijado para tener casos de n<3."""
    rnd = random.Random(42)
    salida = []
    fuertes = {1982, 1997, 2015}  # 2 en el primer periodo, 1 en el segundo → n<3
    for y in range(1981, 2026):
        if y in fuertes:
            oni = 1.8 + rnd.random() * 0.6
        else:
            oni = rnd.choice([-1.2, -0.8, -0.6, -0.2, 0.0, 0.1, 0.3, 0.7, 0.9, 1.1])
            oni += rnd.uniform(-0.1, 0.1)
        oni = round(oni, 1)
        fase = "Niño" if oni >= 0.5 else "Niña" if oni <= -0.5 else "Normal"
        periodo = "p1981-2000" if y <= 2000 else "p2001-2025"
        salida.append({
            "campaign_year": y, "label": f"{y}–{str(y + 1)[-2:]}",
            "period_id": periodo, "oni_ndj": oni, "enso_phase": fase,
            "strong_nino": oni >= 1.5, "complete": y <= 2024,
            "nature": "fixture", "source_id": None,
            "missing_reason": None if y <= 2024 else "Campaña 2025–26 incompleta",
        })
    return salida


def fase_coincide(c, fase):
    if fase == "Niño fuerte":
        return c["strong_nino"]
    return c["enso_phase"] == fase


def ventanas(camps, periodo, fase):
    por_ano = {c["campaign_year"]: c for c in camps}
    out = []
    for c in camps:
        y = c["campaign_year"]
        if not (periodo["start_campaign_year"] <= y and y + 2 <= periodo["end_campaign_year"] and y <= 2023):
            continue
        if not fase_coincide(c, fase):
            continue
        if not all(por_ano.get(y + k, {}).get("complete") for k in range(3)):
            continue
        out.append({"window_id": f"w{y}", "campaign_years": [y, y + 1, y + 2], "complete": True})
    return out


def kpi(valor, unidad, metodo, motivo=None, extra=None):
    d = {"value": valor, "unit": unidad, "nature": "simulated", "source_ids": ["ejemplo-sintetico"],
         "method": metodo, "missing_reason": motivo}
    if extra:
        d.update(extra)
    return d


def kpis_cultivo(cultivo, factor, presupuesto, rnd):
    base = CULTIVO[cultivo]
    req = round(base["riego"] * factor + rnd.uniform(-4, 4)) if base["riego"] else 0
    aplicado = min(req, presupuesto)
    deficit = max(req - aplicado, 0)
    estres = round(base["estres"] * factor * (0.4 + 0.6 * (deficit / req if req else 0)) + rnd.uniform(0, 2)) if base["estres"] else 0
    cobertura = round(min(100, base["cobertura"] / factor + rnd.uniform(-3, 3)))
    lluvia_desc = round((100 - cobertura) / 6 * (1 / factor) + rnd.uniform(0, 2))
    viento_desc = round((100 - cobertura) / 5 * factor + rnd.uniform(0, 2))
    termica = None if base["termica"] is None else round(base["termica"] * factor + rnd.uniform(0, 2))
    return req, aplicado, estres, cobertura, lluvia_desc, viento_desc, termica


def grupo(req, apl, est, cob, llu, vie, ter, n, pasa, metodo):
    return {
        "net_irrigation_requirement_mm": kpi(req, "mm", metodo),
        "net_irrigation_applied_mm": kpi(apl, "mm", metodo),
        "water_stress_days": kpi(est, "days", metodo),
        "planned_coverage_pct": kpi(cob, "%", metodo),
        "bare_rain_exposure_days": kpi(llu, "days", metodo),
        "bare_wind_exposure_days": kpi(vie, "days", metodo),
        "thermal_exposure_days": kpi(ter, "days", metodo,
                                     None if ter is not None else "Descanso: sin etapa de cultivo sensible al frío"),
        "constraint_pass_frequency": kpi(round(pasa / n, 3), "fraction", metodo,
                                         extra={"numerator": pasa, "denominator": n}),
    }


def calendario(campanas_caso):
    """TEMP-D3: cobertura mensual del año agrícola ago→jul de la campaña de decisión."""
    cultivo = campanas_caso[0]
    meses = []
    for mes in [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7]:
        if cultivo == "descanso":
            estado = "fallow_vegetation" if mes in (12, 1, 2, 3) else "bare"
        elif mes in (8, 9):
            estado = "bare"
        elif mes == 10:
            estado = "bare" if cultivo == "papa" else "residue"
        elif mes in (11, 12, 1, 2, 3):
            estado = "crop"
        elif mes in (4, 5):
            estado = "residue"
        else:
            estado = "bare"
        meses.append({"month": mes, "cover": estado})
    return meses


def main():
    camps = campanas()
    casos = []
    for letra, (rid, seq) in ROTACIONES.items():
        for pos in (1, 2, 3):
            rot = seq[pos - 1:] + seq[:pos - 1]
            casos.append({"case_id": f"{letra}-{pos}", "rotation_id": rid, "position_id": pos,
                          "campaigns": rot, "decision_crop": rot[0]})

    catalog = sobre({
        "analysis_point": {"analysis_point_id": "oruro-pilot", "region": "Oruro", "latitude": None,
                           "longitude": None, "location_status": "unconfirmed",
                           "missing_reason": "P6 debe confirmar el punto y su representatividad"},
        "rotations": [{"rotation_id": rid, "campaigns": seq, "baseline_status": "assumed"}
                      for rid, seq in ROTACIONES.values()],
        "cases": casos,
        "periods": PERIODOS,
        "water_budgets": PRESUPUESTOS,
        "soil_profiles": [SUELO],
        "enso_rule": {  # TEMP-D3
            "index": "ONI", "season": "NDJ", "campaign_of": "decisión (y)",
            "nino_min": 0.5, "nina_max": -0.5, "strong_nino_min": 1.5,
            "source": "Regla del plan v3.1; valores ONI de este ejemplo son INVENTADOS",
        },
        "rules": {  # TEMP-D3
            "bare_soil": {"rain_threshold_mm": 10, "wind_threshold_m_s": 6,
                          "green_max_days": 12, "yellow_max_days": 25,
                          "nature": "assumed",
                          "source": "Umbrales de ejemplo; P6 debe fijarlos"},
        },
    })

    def resumen(variable, label, unit, p, value, sd, mn, mx):
        n = sum(1 for c in camps if c["period_id"] == p and c["complete"])
        return {"variable": variable, "label": label, "unit": unit, "period_id": p,
                "statistic": "media por campaña (nov–mar)", "value": value, "sd": sd,
                "min": mn, "max": mx, "n_campaigns": n, "n_missing": 0,
                "nature": "fixture", "source_id": None,
                "spatial_resolution": "celda regional 0,5° × 0,625° (forma de NASA POWER; aquí inventado)",
                "temporal_resolution": "diaria agregada por campaña",
                "missing_reason": None}

    climate = sobre({
        "series": [],
        "missing_reason": "Ejemplo sintético: sin series diarias NASA POWER",
        "period_summaries": [  # TEMP-D3
            resumen("precip_campaign", "Lluvia por campaña", "mm", "p1981-2000", 268, 61, 150, 390),
            resumen("precip_campaign", "Lluvia por campaña", "mm", "p2001-2025", 251, 70, 130, 400),
            resumen("tmax_mean", "Temperatura máxima media", "°C", "p1981-2000", 17.4, 0.6, 16.3, 18.6),
            resumen("tmax_mean", "Temperatura máxima media", "°C", "p2001-2025", 18.0, 0.7, 16.8, 19.4),
            resumen("tmin_mean", "Temperatura mínima media", "°C", "p1981-2000", 1.1, 0.7, -0.4, 2.3),
            resumen("tmin_mean", "Temperatura mínima media", "°C", "p2001-2025", 1.6, 0.8, 0.0, 3.1),
            resumen("frost_days", "Noches bajo 0 °C", "días", "p1981-2000", 38, 9, 22, 58),
            {**resumen("frost_days", "Noches bajo 0 °C", "días", "p2001-2025", None, None, None, None),
             "missing_reason": "Ejemplo de dato ausente: QA de temperatura mínima pendiente (Dev 1)"},
        ],
        "campaigns": camps,  # TEMP-D3
    })

    rnd = random.Random(7)
    registros = []
    for p in PERIODOS:
        for fase in ["Normal", "Niño", "Niña", "Niño fuerte"]:
            ws = ventanas(camps, p, fase)
            n = len(ws)
            unicos = len({y for w in ws for y in w["campaign_years"]})
            for b in PRESUPUESTOS:
                for caso in casos:
                    rid = f"ej-{p['period_id']}-{fase.lower().replace(' ', '_').replace('ñ', 'n')}-{b['water_budget_id']}-{caso['case_id'].lower()}"
                    rec = {
                        "result_id": rid, "build_id": BUILD, "analysis_point_id": "oruro-pilot",
                        "rotation_id": caso["rotation_id"], "position_id": caso["position_id"],
                        "case_id": caso["case_id"], "decision_crop": caso["decision_crop"],
                        "period_id": p["period_id"], "enso_initial_phase": fase,
                        "water_budget_id": b["water_budget_id"], "soil_profile_id": SUELO["soil_profile_id"],
                        "n_windows": n, "n_unique_campaigns": unicos, "windows": ws,
                        "ranking": None, "missing_reason": None,
                        "sensitivity_status": "not_evaluated",
                        "sensitivity_reason": "Sin segunda fuente climática integrada",
                        "calendar": "Siembra oct–nov, cosecha abr–may (ejemplo)",
                        "initialization": "Suelo a 50 % de agua útil al 1 de agosto (ejemplo)",
                        "residues": "Residuos de cosecha en superficie abr–may (ejemplo)",
                        "coverage_calendar": calendario(caso["campaigns"]),  # TEMP-D3
                    }
                    if n == 0:
                        rec.update(decision_kpis=None, cycle_kpis=None,
                                   missing_reason="Sin ventanas válidas para este escenario y periodo")
                    else:
                        factor = EFECTO_ENSO[fase] * (1.05 if p["period_id"] == "p2001-2025" else 1.0)
                        metodo = "EJEMPLO INVENTADO por Dev 3 (no balance hídrico real)"
                        d = kpis_cultivo(caso["campaigns"][0], factor, b["net_limit_mm"], rnd)
                        pasa_d = max(0, min(n, round(n * (1 - d[2] / 30))))
                        rec["decision_kpis"] = grupo(*d, n, pasa_d, metodo)
                        partes = [kpis_cultivo(c, f, b["net_limit_mm"], rnd)
                                  for c, f in zip(caso["campaigns"], [factor, 1.0, 1.0])]
                        suma = [sum(x[i] for x in partes) for i in range(3)]
                        cob = round(sum(x[3] for x in partes) / 3)
                        llu, vie = sum(x[4] for x in partes), sum(x[5] for x in partes)
                        ters = [x[6] for x in partes if x[6] is not None]
                        pasa_c = max(0, min(n, round(n * (1 - suma[2] / 70))))
                        rec["cycle_kpis"] = grupo(suma[0], suma[1], suma[2], cob, llu, vie,
                                                  sum(ters) if ters else None, n, pasa_c, metodo)
                    registros.append(rec)

    # Ejemplo de empate exacto (para probar la UI): B-1 y C-1 iguales en decisión.
    for r in registros:
        if r["case_id"] == "C-1" and r["decision_kpis"]:
            gemelo = next(x for x in registros if x["case_id"] == "B-1" and x["period_id"] == r["period_id"]
                          and x["enso_initial_phase"] == r["enso_initial_phase"]
                          and x["water_budget_id"] == r["water_budget_id"])
            r["decision_kpis"] = json.loads(json.dumps(gemelo["decision_kpis"]))

    results = sobre({"records": registros})
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, doc in [("catalog.json", catalog), ("climate.json", climate), ("results.json", results)]:
        (SALIDA / nombre).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    manifest = {k: v for k, v in results.items() if k != "data"}
    manifest["data"] = {"status": "fixture_only", "method": "Ejemplo sintético de interfaz (Dev 3)",
                        "files": {f"data/{n}": None for n in ["catalog.json", "climate.json", "results.json"]}}
    (SALIDA / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (RAIZ / "current.json").write_text(json.dumps(
        {"build_id": BUILD, "mode": "fixture", "base_path": f"/releases/{BUILD}/", "manifest_sha256": None},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"OK · {len(registros)} registros · {SALIDA}")


if __name__ == "__main__":
    main()
