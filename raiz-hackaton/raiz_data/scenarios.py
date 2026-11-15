"""Escenarios históricos, ENSO, KPI por ventana y paquete de entrada del contrato v3.1 (tarea D1-6)."""
from datetime import date, datetime, timezone
import json
import math
from statistics import mean, median, pstdev

from . import agro, inputs
from .fetch import DATA, entry
from .registry import POINT, by_id

ROTATIONS = {'papa-quinua-descanso': ['papa', 'quinua', 'descanso'], 'papa-quinua-haba': ['papa', 'quinua', 'haba'],
             'papa-haba-descanso': ['papa', 'haba', 'descanso']}
LETTERS = dict(zip(ROTATIONS, 'ABC'))
PERIODS = [
    {'period_id': '1981-2000', 'start_campaign_year': 1981, 'end_campaign_year': 2000, 'label': 'Histórico 1981–2000'},
    {'period_id': '2001-2025', 'start_campaign_year': 2001, 'end_campaign_year': 2025, 'label': 'Reciente 2001–2025'},
]
BUDGETS = [
    {'water_budget_id': 'secano', 'net_limit_mm': 0, 'label': 'Secano: sin riego (situación más común en Oruro)'},
    {'water_budget_id': 'riego-100', 'net_limit_mm': 100, 'label': 'Riego suplementario hipotético: 100 mm netos por campaña'},
]
SOIL_ID = 'soilgrids-0-60cm'
# Suelo descrito por el productor («medio arcilloso arenoso») e interpretado por P6 como franco arcillo arenoso,
# con agua disponible genérica NRCS 0,14–0,16 m/m (content/soils.json). Solo importa la diferencia CC − PMP.
LOCAL_SOIL = {'soil_profile_id': 'local-obrajes', 'nature': 'scenario_assumption', 'label': 'Descripción del productor (P6): franco arcillo arenoso',
              'theta_fc': 0.30, 'theta_wp': 0.15, 'taw_mm_per_m': 150,
              'source': 'content/soils.json alt-local-1: textura del productor + rango genérico NRCS 0,14–0,16 m/m (no medido)',
              'method': 'Agua disponible = punto medio del rango NRCS (0,15 m/m)'}
LAST_DECISION = 2023
ENSO_RULE = {
    'index': 'ONI (NOAA CPC, ERSSTv5)', 'season': 'NDJ del año de la campaña de decisión (nov y – ene y+1)',
    'thresholds': {'Niño': 'ONI ≥ +0,5 (incluye los fuertes)', 'Niño fuerte': 'ONI ≥ +1,5', 'Niña': 'ONI ≤ −0,5', 'Normal': '−0,5 < ONI < +0,5'},
    'persistence': 'Se usa solo el trimestre NDJ (pico típico); no se exige la persistencia de 5 trimestres de la definición oficial',
    'note': 'Solo la primera campaña de la ventana se clasifica; las otras dos conservan su clima histórico real. ONI no equivale a Niño 1+2.',
}
PHASES = ['Normal', 'Niño', 'Niña', 'Niño fuerte']
SLUG = {'Normal': 'normal', 'Niño': 'nino', 'Niña': 'nina', 'Niño fuerte': 'nino-fuerte'}
RANK_WEIGHTS = {'water_stress_days': 0.30, 'net_irrigation_requirement_mm': 0.20, 'thermal_exposure_days': 0.15,
                'bare_rain_exposure_days': 0.15, 'bare_wind_exposure_days': 0.10, 'planned_coverage_pct': 0.10}
RANK_DIRECTIONS = {name: 'maximize' if name == 'planned_coverage_pct' else 'minimize' for name in RANK_WEIGHTS}
KPI_UNITS = {'net_irrigation_requirement_mm': 'mm', 'net_irrigation_applied_mm': 'mm', 'water_stress_days': 'days',
             'planned_coverage_pct': '%', 'bare_rain_exposure_days': 'days', 'bare_wind_exposure_days': 'days',
             'thermal_exposure_days': 'days', 'constraint_pass_frequency': 'fraction'}
T = agro.THRESHOLDS
METHODS = {
    'net_irrigation_requirement_mm': 'Riego neto para mantener el agotamiento ≤ agua fácilmente disponible en días de cultivo (corrida sin límite de riego); balance FAO-56 diario. No es riego bruto ni extracción.',
    'net_irrigation_applied_mm': 'Riego neto aplicado con el presupuesto de la campaña (corrida restringida).',
    'water_stress_days': f"Días de cultivo con Ks < {T['stress_ks']['value']} (estrés severo, FAO-56 ec. 84) en la corrida restringida. Descanso: no aplica.",
    'planned_coverage_pct': 'Promedio diario de cobertura planificada (curva por etapa; descanso 25 %; rastrojo 10 %) del año agrícola 1-ago a 31-jul.',
    'bare_rain_exposure_days': f"Días con cobertura < {int(T['bare_cover_fraction']['value']*100)} % y lluvia ≥ {T['erosive_rain_mm']['value']} mm (POWER PRECTOTCORR). Proxy, no erosión calibrada.",
    'bare_wind_exposure_days': f"Días con cobertura < {int(T['bare_cover_fraction']['value']*100)} % y viento máximo a 2 m ≥ {T['erosive_wind_ms']['value']} m/s (POWER WS2M_MAX). Proxy.",
    'thermal_exposure_days': 'Días de cultivo con helada dañina: en floración (etapa media) Tmin ≤ umbral de floración (papa −2,5; quinua −2; haba −1 °C) y en el resto del ciclo Tmin ≤ umbral letal (papa −2,5; quinua −8; haba −5 °C), umbrales de P6-2. POWER T2M_MIN es aire a 2 m en celda ~50 km: subestima heladas locales. Descanso: no aplica.',
    'constraint_pass_frequency': f"Ventanas donde la campaña cumple: estrés severo ≤ {int(T['pass_stress_fraction']['value']*100)} % de los días de cultivo, helada ≤ {T['pass_thermal_days']['value']} d y lluvia erosiva con suelo expuesto ≤ {T['pass_bare_rain_days']['value']} d. Frecuencia histórica, no garantía.",
}
KPI_SOURCES = {'net_irrigation_requirement_mm': ['nasa-power-daily', 'isric-soilgrids'], 'net_irrigation_applied_mm': ['nasa-power-daily', 'isric-soilgrids'],
               'water_stress_days': ['nasa-power-daily', 'isric-soilgrids'], 'planned_coverage_pct': ['nasa-power-daily'],
               'bare_rain_exposure_days': ['nasa-power-daily'], 'bare_wind_exposure_days': ['nasa-power-daily'],
               'thermal_exposure_days': ['nasa-power-daily'], 'constraint_pass_frequency': ['nasa-power-daily', 'isric-soilgrids']}
SENAMHI_FILES = [('senamhi-resumen-mensual/resumen-2025-12.pdf', {'start': '2025-12-01', 'end': '2025-12-31'}),
                 ('senamhi-resumen-mensual/resumen-2026-01.pdf', {'start': '2025-11-01', 'end': '2026-01-31'}),
                 ('senamhi-resumen-mensual/resumen-2026-03.pdf', {'start': '2026-01-01', 'end': '2026-03-31'}),
                 ('senamhi-resumen-mensual/resumen-2026-04.pdf', {'start': '2026-04-01', 'end': '2026-04-30'})]
CLIMATE_VARS = ['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'T2MDEW', 'WS2M', 'WS2M_MAX', 'ALLSKY_SFC_SW_DWN', 'PS']


def cases():
    out = []
    for rotation_id, seq in ROTATIONS.items():
        for position in (1, 2, 3):
            campaigns = seq[position - 1:] + seq[:position - 1]
            out.append({'case_id': f'{LETTERS[rotation_id]}-{position}', 'rotation_id': rotation_id, 'position_id': position,
                        'campaigns': campaigns, 'decision_crop': campaigns[0]})
    return out


def phase_of(anom):
    phases = []
    if anom >= 0.5:
        phases.append('Niño')
    if anom >= 1.5:
        phases.append('Niño fuerte')
    if anom <= -0.5:
        phases.append('Niña')
    if -0.5 < anom < 0.5:
        phases.append('Normal')
    return phases


def campaign_pass(c):
    crop = c['crop'] != 'descanso'
    return ((not crop or c['stress_days'] <= T['pass_stress_fraction']['value'] * c['crop_days']) and
            (not crop or c['thermal_days'] <= T['pass_thermal_days']['value']) and
            c['bare_rain_days'] <= T['pass_bare_rain_days']['value'])


def window_kpis(unconstrained, constrained):
    """KPI de la campaña de decisión y del ciclo para una ventana."""
    d, du = constrained[0], unconstrained[0]
    decision = {'net_irrigation_requirement_mm': du['irrigation'], 'net_irrigation_applied_mm': d['irrigation'],
                'water_stress_days': None if d['crop'] == 'descanso' else d['stress_days'],
                'planned_coverage_pct': d['coverage_pct'], 'bare_rain_exposure_days': d['bare_rain_days'],
                'bare_wind_exposure_days': d['bare_wind_days'],
                'thermal_exposure_days': None if d['crop'] == 'descanso' else d['thermal_days'], 'pass': campaign_pass(d)}
    cycle = {'net_irrigation_requirement_mm': sum(c['irrigation'] for c in unconstrained),
             'net_irrigation_applied_mm': sum(c['irrigation'] for c in constrained),
             'water_stress_days': sum(c['stress_days'] for c in constrained), 'planned_coverage_pct': mean(c['coverage_pct'] for c in constrained),
             'bare_rain_exposure_days': sum(c['bare_rain_days'] for c in constrained), 'bare_wind_exposure_days': sum(c['bare_wind_days'] for c in constrained),
             'thermal_exposure_days': sum(c['thermal_days'] for c in constrained), 'pass': all(campaign_pass(c) for c in constrained)}
    diag = {'decision_rain_mm': d['rain'], 'decision_relative_et': d['eta'] / d['etc'] if d['etc'] else None,
            'decision_mild_stress_days': d['mild_stress_days'], 'decision_flowering_frost_days': d['flowering_frost_days'], 'decision_drainage_mm': d['drainage'], 'decision_runoff_mm': d['runoff'],
            'decision_balance_adjust_mm': d['adjust'],
            'decision_balance_closure_mm': (d['storage_end'] - d['storage_start']) - (d['rain'] - d['runoff'] + d['irrigation'] - d['eta'] - d['drainage'] + d['adjust'])}
    return decision, cycle, diag


def aggregate(per_window, scope, n):
    group = {}
    for name, unit in KPI_UNITS.items():
        base = {'unit': unit, 'nature': 'simulated', 'source_ids': KPI_SOURCES[name], 'method': METHODS[name]}
        if name == 'constraint_pass_frequency':
            num = sum(1 for w in per_window if w['pass'])
            group[name] = {**base, 'value': num / n, 'numerator': num, 'denominator': n}
            continue
        values = [w[name] for w in per_window]
        if any(v is None for v in values):
            group[name] = {**base, 'value': None, 'missing_reason': 'Descanso en la campaña de decisión: el indicador de cultivo no aplica'}
            continue
        group[name] = {**base, 'value': round(mean(values), 1), 'statistic': f'media de {n} ventanas', 'min': round(min(values), 1),
                       'max': round(max(values), 1), 'median': round(median(values), 1), 'sd': round(pstdev(values), 1)}
    return group


def rank(records):
    """Ranking del grupo con reglas explícitas, sobre KPI del ciclo, min-max común a los 9 casos."""
    ranges = {}
    for name in RANK_WEIGHTS:
        values = [r['cycle_kpis'][name]['value'] for r in records]
        ranges[name] = {'min': min(values), 'max': max(values)}
    method = {'metric_scope': 'cycle_kpis', 'normalization': 'min_max', 'normalization_ranges': ranges,
              'weights': RANK_WEIGHTS, 'directions': RANK_DIRECTIONS, 'missing_data_policy': 'no_rank_if_missing',
              'tie_rule': 'competition: puntajes iguales (±1e-9) comparten puesto', 'constant_metric_policy': 'tie',
              'score': 'Σ peso × valor normalizado (1 = mejor); pesos de demostración ajustables por el usuario',
              'caveat': 'Las rotaciones con descanso tienen menos campañas cultivadas: menos agua y estrés, pero también menos producción, que no se cuantifica.'}
    scores = {}
    for r in records:
        score = 0.0
        for name, weight in RANK_WEIGHTS.items():
            lo, hi = ranges[name]['min'], ranges[name]['max']
            value = r['cycle_kpis'][name]['value']
            norm = 1.0 if hi == lo else ((hi - value) / (hi - lo) if RANK_DIRECTIONS[name] == 'minimize' else (value - lo) / (hi - lo))
            score += weight * norm
        scores[r['result_id']] = score
    for r in records:
        r['ranking'] = 1 + sum(1 for other in scores.values() if other > scores[r['result_id']] + 1e-9)
        r['ranking_method'] = method
        r['ranking_score'] = round(scores[r['result_id']], 4)


def source_object(source_id, relative, period, units, qa, version=None):
    meta, fetched = by_id(source_id), entry(relative)
    return {'source_id': source_id, 'agency': meta['agency'], 'product': meta['product'], 'version': version or meta.get('version', 's/v'),
            'url': fetched['url'], 'queried_at': fetched['queried_at'], 'period': period,
            'spatial_resolution': meta.get('spatial_resolution', 'n/a'), 'temporal_resolution': meta.get('temporal_resolution', 'n/a'),
            'units': units, 'qa': qa, 'original': f'raw/{relative}', 'sha256': fetched['sha256'], 'bytes': fetched['bytes'],
            'license': meta['license']}


def run_sims(years, case_list, climate_ok, et0, soil):
    sims, diags = {}, {}
    for y in years:
        window = [y, y + 1, y + 2]
        for case in case_list:
            free = agro.simulate(window, case['campaigns'], climate_ok, et0, soil, None)
            for budget in BUDGETS:
                limited = agro.simulate(window, case['campaigns'], climate_ok, et0, soil, budget['net_limit_mm'])
                decision, cycle, diag = window_kpis(free, limited)
                sims[(y, case['case_id'], budget['water_budget_id'])] = (decision, cycle, limited, free)
                diags[(y, case['case_id'], budget['water_budget_id'])] = diag
    return sims, diags


def senamhi_sources(files):
    meta = by_id('senamhi-resumen-mensual')
    out = []
    for relative, period in files:
        fetched = entry(relative)
        out.append({'source_id': 'senamhi-' + relative.split('/')[-1].removesuffix('.pdf'), 'agency': meta['agency'], 'product': meta['product'],
                    'version': 'publicación mensual', 'url': fetched['url'], 'queried_at': fetched['queried_at'], 'period': period,
                    'spatial_resolution': meta['spatial_resolution'], 'temporal_resolution': 'mensual', 'units': {'precipitacion': 'mm'},
                    'qa': 'Cifras leídas del texto del PDF (estación Oruro – Ciudad) y verificadas a mano; normales 1991–2020 citadas por SENAMHI',
                    'original': f'raw/{relative}', 'sha256': fetched['sha256'], 'bytes': fetched['bytes'], 'license': meta['license']})
    return out


def build(precip_scale=None):
    """Calcula todo y escribe datos/{catalog,climate,results}.json. Devuelve (docs, contexto).

    `precip_scale` = {mes: factor} (SENAMHI/POWER) activa la sensibilidad: se repite la simulación
    con la lluvia corregida y cada registro guarda la diferencia de sus KPI de decisión.
    """
    days, climate, meta = inputs.power()
    soil = inputs.soil()
    oni = inputs.oni()
    et0, et0_method, hs_factors = agro.compute_et0(days, climate, meta['latitude'], meta['elevation_m'])
    climate_ok = {d: climate[d] for d in days}
    last_day = days[-1]
    case_list = cases()
    years = [y for y in range(1981, LAST_DECISION + 1) if date(y + 3, 7, 31) <= last_day]
    soils = {SOIL_ID: soil, LOCAL_SOIL['soil_profile_id']: LOCAL_SOIL}
    by_soil = {sid: run_sims(years, case_list, climate_ok, et0, s) for sid, s in soils.items()}
    sims, diags = by_soil[SOIL_ID]
    alt_by_soil = {}
    if precip_scale:
        climate_alt = {d: {**c, 'PRECTOTCORR': c['PRECTOTCORR'] * precip_scale.get(d.month, 1.0)} for d, c in climate_ok.items()}
        alt_by_soil = {sid: run_sims(years, case_list, climate_alt, et0, s)[0] for sid, s in soils.items()}
    build_id = f"raiz-oruro-power-{last_day.strftime('%Y%m%d')}-v1"
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    data_as_of = f'{last_day.isoformat()}T23:59:59-04:00'
    if data_as_of > now:
        data_as_of = now
    power_src = source_object('nasa-power-daily', 'nasa-power-daily/power_daily_oruro.json', {'start': days[0].isoformat(), 'end': last_day.isoformat()},
                              {k: meta['units'][k] for k in CLIMATE_VARS + ['RH2M', 'GWETROOT']},
                              {'fill_value': -999, 'tratamiento': 'relleno → null con motivo', 'radiacion': 'ALLSKY_SFC_SW_DWN disponible desde 1984-01-01; antes se usa Hargreaves calibrada por mes',
                               'dias_et0_hargreaves': sum(1 for m in et0_method.values() if m != 'penman_monteith'), 'hora': 'LST (hora solar local)',
                               'elevacion_celda_m': meta['elevation_m']})
    oni_src = source_object('noaa-cpc-oni', 'noaa-cpc-oni/oni.ascii.txt', {'start': '1950-01-01', 'end': '2026-10-31'}, {'ANOM': '°C (anomalía SST Niño 3.4)'},
                            'Serie oficial ONI v5; última temporada disponible ASO 2026')
    soil_src = source_object('isric-soilgrids', 'isric-soilgrids/soilgrids_oruro.json', {'start': '2020-01-01', 'end': '2020-12-31'},
                             {'wv0033': soil['water_unit_reported'], 'wv1500': soil['water_unit_reported'], 'clay': '%', 'sand': '%'},
                             'Media de predicción 250 m, con cuantiles 5 % y 95 %; producto estático (versión 2.0, 2020)', version='2.0')
    sources = [power_src, oni_src, soil_src] + (senamhi_sources(SENAMHI_FILES) if precip_scale else [])
    envelope = lambda mode, src: {'schema_version': '3.0', 'build_id': build_id, 'mode': mode, 'generated_at': now, 'data_as_of': data_as_of,
                                  'model_version': 'raiz-agua-1.0 (balance diario FAO-56, un depósito)', 'sources': src}
    assumptions = ['Punto de datos en la parcela de un productor de Obrajes (P6-1); el clima es una celda NASA POWER de ~50 km, no una medición de la parcela',
                   'Calendario del productor (P6) con fecha central de cada ventana; las secuencias son escenarios de comparación, no su práctica (P6-1)',
                   'Kc de papa y haba de FAO-56; Kc de quinua de García et al. (2003); umbrales de helada por etapa de P6-2; otros valores marcados como supuesto',
                   'FAO-56 Penman-Monteith no está calibrado sobre 3000 m (García et al. 2003); ET0 puede estar sobrestimada',
                   'POWER es una celda de ~50 km: suaviza lluvias convectivas, ráfagas y heladas locales']
    warnings = ['Evaluación histórica simulada; no es pronóstico ni observación de parcela',
                'No cuantifica rendimiento, ingresos ni erosión en toneladas', 'Revisión agronómica humana pendiente (P6)'] + agro.LIMITS
    soil_profile = {'soil_profile_id': SOIL_ID, 'nature': 'map_estimate', 'label': 'SoilGrids 2.0, promedio 0–60 cm',
                    'theta_fc': round(soil['theta_fc'], 3), 'theta_wp': round(soil['theta_wp'], 3),
                    'taw_mm_per_m': round(1000 * (soil['theta_fc'] - soil['theta_wp'])), 'clay_pct': round(soil['clay_pct'], 1),
                    'sand_pct': round(soil['sand_pct'], 1), 'silt_pct': round(soil['silt_pct'], 1), 'source_id': 'isric-soilgrids',
                    'method': 'Media ponderada por espesor de wv0033 (capacidad de campo) y wv1500 (punto de marchitez) hasta 60 cm'}
    catalog = {**envelope('simulated', [soil_src]), 'assumptions': assumptions, 'warnings': warnings, 'data': {
        'analysis_point': {'analysis_point_id': POINT['analysis_point_id'], 'region': POINT['region'], 'latitude': POINT['latitude'],
                           'longitude': POINT['longitude'], 'location_status': 'regional_point', 'label': POINT['label'],
                           'representativeness': 'Punto de datos en la parcela de un productor de Obrajes (P6-1). El clima viene de una celda NASA POWER de ~50 km que también contiene la ciudad de Oruro y las estaciones SENAMHI: NO es una medición de la parcela.',
                           'elevation_nasadem_m': POINT['elevation_nasadem_m'], 'power_cell_elevation_m': meta['elevation_m'],
                           'coordinate_precision_deg': 0.01, 'source': POINT['source']},
        'rotations': [{'rotation_id': k, 'campaigns': v, 'baseline_status': 'assumed'} for k, v in ROTATIONS.items()],
        'cases': case_list, 'periods': PERIODS, 'water_budgets': BUDGETS, 'soil_profiles': [soil_profile, {k: v for k, v in LOCAL_SOIL.items()}],
        'limits': agro.LIMITS,
        'crops': {name: {k: v for k, v in c.items()} for name, c in agro.CROPS.items()},
        'fallow': agro.FALLOW, 'residue': agro.RESIDUE, 'thresholds': agro.THRESHOLDS, 'enso_rule': ENSO_RULE,
        'et0': {'method': 'FAO-56 Penman-Monteith (ec. 6) con ea del punto de rocío; Hargreaves calibrada por mes si falta radiación',
                'hargreaves_monthly_factors': {str(k): round(v, 3) for k, v in hs_factors.items()}},
        'ranking_rule': {'weights': RANK_WEIGHTS, 'directions': RANK_DIRECTIONS, 'scope': 'cycle_kpis', 'min_windows': 3},
    }}
    series = []
    for var in CLIMATE_VARS:
        values = []
        for day in sorted(climate):
            if day > last_day:
                continue
            v = climate[day].get(var)
            values.append({'date': day.isoformat(), 'value': v} if v is not None else
                          {'date': day.isoformat(), 'value': None, 'missing_reason': 'POWER valor de relleno -999 (sin dato en el producto)'})
        series.append({'variable': var, 'unit': meta['units'][var], 'nature': 'downloaded', 'source_id': 'nasa-power-daily',
                       'longname': meta['longnames'][var], 'values': values})
    climate_doc = {**envelope('downloaded', [power_src]), 'model_version': None, 'assumptions': [], 'warnings': ['Datos de reanálisis/satélite en celda de ~50 km'],
                   'data': {'series': series, 'point': {'latitude': meta['latitude'], 'longitude': meta['longitude']}}}
    records = []
    groups = {}
    for period in PERIODS:
        lo, hi = period['start_campaign_year'], period['end_campaign_year']
        for phase in PHASES:
            window_years = [y for y in years if lo <= y and y + 2 <= hi and phase in phase_of(oni[('NDJ', y)])]
            for soil_id, budget in [(s, b) for s in soils for b in BUDGETS]:
                sims, diags = by_soil[soil_id]
                sims_alt = alt_by_soil.get(soil_id)
                group = []
                for case in case_list:
                    n = len(window_years)
                    windows = [{'window_id': f'w{y}', 'campaign_years': [y, y + 1, y + 2], 'complete': True, 'oni_ndj': oni[('NDJ', y)]} for y in window_years]
                    rid = f"p{period['period_id']}.{SLUG[phase]}.{budget['water_budget_id']}.{case['case_id']}" + ('' if soil_id == SOIL_ID else '.suelo-local')
                    record = {'result_id': rid, 'build_id': build_id, 'analysis_point_id': POINT['analysis_point_id'],
                              'rotation_id': case['rotation_id'], 'position_id': case['position_id'], 'case_id': case['case_id'],
                              'decision_crop': case['decision_crop'], 'period_id': period['period_id'], 'enso_initial_phase': phase,
                              'water_budget_id': budget['water_budget_id'], 'soil_profile_id': soil_id, 'n_windows': n,
                              'n_unique_campaigns': len({c for w in windows for c in w['campaign_years']}), 'windows': windows,
                              'calendar': {crop: f"siembra {c['sowing'][1]:02d}/{c['sowing'][0]:02d}, {agro.season_length(crop)} días" for crop, c in agro.CROPS.items()} | {'descanso': 'todo el año agrícola (1-ago a 31-jul)'},
                              'initialization': 'Suelo a capacidad de campo el 1-ene del año de decisión y spin-up con descanso y clima real hasta el 31-jul; continuidad del agua entre campañas',
                              'residues': 'Rastrojo con 10 % de cobertura entre cosecha y 31-jul; descanso con maleza y pastoreo de animales de vecinos (25 %, P6-1)',
                              'ranking': None, 'missing_reason': None}
                    if n == 0:
                        record.update(decision_kpis=None, cycle_kpis=None, missing_reason=f'Sin campañas {phase} en {period["label"]} con ventana completa')
                    else:
                        per_d = [sims[(y, case['case_id'], budget['water_budget_id'])][0] for y in window_years]
                        per_c = [sims[(y, case['case_id'], budget['water_budget_id'])][1] for y in window_years]
                        record['decision_kpis'] = aggregate(per_d, 'decision', n)
                        record['cycle_kpis'] = aggregate(per_c, 'cycle', n)
                        dg = [diags[(y, case['case_id'], budget['water_budget_id'])] for y in window_years]
                        record['diagnostics'] = {'decision_rain_mm_mean': round(mean(d['decision_rain_mm'] for d in dg), 1),
                                                 'balance_adjust_mm_mean': round(mean(d['decision_balance_adjust_mm'] for d in dg), 1),
                                                 'balance_closure_max_abs_mm': max(abs(d['decision_balance_closure_mm']) for d in dg),
                                                 'balance_note': 'Cierre: ΔAlmacenamiento = lluvia − escorrentía + riego − ETa − drenaje + ajuste por cambio de raíz (aproximación de un depósito)',
                                                 'decision_relative_et_mean': round(mean(d['decision_relative_et'] for d in dg if d['decision_relative_et'] is not None), 3) if any(d['decision_relative_et'] is not None for d in dg) else None,
                                                 'per_window': {f'w{y}': {k: (round(v, 1) if isinstance(v, float) else v) for k, v in sims[(y, case['case_id'], budget['water_budget_id'])][0].items()} for y in window_years}}
                        if n < 3:
                            record['missing_reason'] = f'Muestra insuficiente (n={n} < 3): sin ranking ni conclusión de robustez'
                    if sims_alt and n > 0:
                        alt = aggregate([sims_alt[(y, case['case_id'], budget['water_budget_id'])][0] for y in window_years], 'decision', n)
                        base = record['decision_kpis']
                        record['sensitivity_status'] = 'evaluated'
                        record['sensitivity'] = {
                            'method': 'Lluvia diaria de POWER multiplicada por el factor mensual normal SENAMHI Oruro–Ciudad / normal POWER (1991–2020, periodo común); mismo modelo y suelo',
                            'source_ids': [s['source_id'] for s in senamhi_sources(SENAMHI_FILES)], 'precip_factors': {str(k): v for k, v in precip_scale.items()},
                            'decision_kpis_alt': {k: alt[k]['value'] for k in alt},
                            'delta': {k: (None if base[k]['value'] is None or alt[k]['value'] is None else round(alt[k]['value'] - base[k]['value'], 2)) for k in alt},
                            'note': 'Min–max entre fuentes no es intervalo de confianza; la estación es un punto y POWER una celda de ~50 km'}
                    else:
                        record['sensitivity_status'] = 'not_evaluated'
                        record['sensitivity_reason'] = ('Sin ventanas en este escenario' if n == 0 else
                                                        'Sin segunda serie diaria representativa: SENAMHI no publica series diarias')
                    group.append(record)
                if group[0]['n_windows'] >= 3:
                    rank(group)
                records.extend(group)
                groups[(period['period_id'], phase, budget['water_budget_id'], soil_id)] = window_years
    sims, diags = by_soil[SOIL_ID]
    results = {**envelope('simulated', sources), 'assumptions': assumptions, 'warnings': warnings,
               'data': {'records': records, 'enso_rule': ENSO_RULE, 'groups': {'|'.join(k): v for k, v in groups.items()}}}
    docs = {'catalog.json': catalog, 'climate.json': climate_doc, 'results.json': results}
    for name, doc in docs.items():
        compact = name == 'climate.json'  # 8 series diarias de 45 años: sin sangría para reducir tamaño
        text = json.dumps(doc, ensure_ascii=False, allow_nan=False, **({'separators': (',', ':')} if compact else {'indent': 1}))
        (DATA / name).write_text(text + '\n', encoding='utf-8')
    return docs, {'sims': sims, 'diags': diags, 'et0': et0, 'et0_method': et0_method, 'climate': climate_ok, 'soil': soil,
                  'oni': oni, 'years': years, 'meta': meta}
