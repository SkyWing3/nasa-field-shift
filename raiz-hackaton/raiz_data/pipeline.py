"""Orquestación de las tareas D1: descargar → verificar → escenarios/KPI → dataset → resumen."""
import json
from pathlib import Path

from . import agro, dataset, download, inputs, scenarios, verify
from .fetch import DATA, FetchError

TERRALAB_CITIES = Path(__file__).resolve().parents[2] / 'simulacion' / 'backend' / 'data' / 'geonames' / 'source' / 'cities500.zip'


def descargar(refresh=False):
    report = {'ok': [], 'fallos': []}
    for name, fn in (('NASA POWER', download.power), ('NOAA ONI', download.oni), ('SoilGrids', download.soilgrids)):
        try:
            report['ok'].append(f'{name}: {fn(refresh=refresh).name}')
        except FetchError as error:
            report['fallos'].append(f'{name}: {error}')
    ok, failed = download.senamhi(refresh=refresh)
    report['ok'] += [f'SENAMHI: {p.name}' for p in ok]
    report['fallos'] += failed
    if TERRALAB_CITIES.exists():
        report['ok'].append(f'GeoNames: {download.geonames_oruro(TERRALAB_CITIES, refresh=refresh).name}')
    else:
        report['fallos'].append('GeoNames: falta simulacion/backend/data/geonames/source/cities500.zip (make geodata en TerraLab)')
    return report


def procesar():
    days, climate, meta = inputs.power()
    soil = inputs.soil()
    et0, _, _ = agro.compute_et0(days, climate, meta['latitude'], meta['elevation_m'])
    clim = {d: climate[d] for d in days}
    verification = verify.run(clim, et0, soil, days[-1])
    factors = {int(m): v['factor'] for m, v in verification['senamhi']['factores_mensuales'].items()}
    docs, ctx = scenarios.build(precip_scale=factors)
    counts = dataset.build(docs, ctx, verification)
    from . import report
    report.build()
    summary = resumen(docs, verification, counts)
    (DATA / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return summary


def resumen(docs, verification, counts):
    records = docs['results.json']['data']['records']
    current = [r for r in records if r['period_id'] == '2001-2025' and r['enso_initial_phase'] == 'Niño fuerte' and r['water_budget_id'] == 'secano' and r['soil_profile_id'] == 'local-obrajes']
    top = sorted((r for r in current if r.get('ranking')), key=lambda r: r['ranking'])
    return {'build_id': docs['results.json']['build_id'], 'datos_hasta': docs['results.json']['data_as_of'], 'registros': len(records),
            'dataset': counts, 'escenario_actual': {'periodo': '2001-2025', 'enso': 'Niño fuerte', 'presupuesto': 'secano',
                                                    'ventanas': current[0]['n_windows'] if current else 0,
                                                    'orden': [{'puesto': r['ranking'], 'caso': r['case_id'], 'rotacion': r['rotation_id'],
                                                               'cultivo_decision': r['decision_crop'], 'puntaje': r['ranking_score']} for r in top]},
            'verificacion': {'senamhi': verification['senamhi']['resumen'],
                             'ine_spearman': {k: v['spearman_etrel_vs_anomalia_rendimiento'] for k, v in verification['ine'].items()},
                             'eventos': [f"{e['campana']} {e['tipo']}: {e['veredicto']}" for e in verification['eventos']],
                             'merra2_spearman': verification['merra2']['spearman']}}
