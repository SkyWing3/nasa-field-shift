"""Genera docs/datos/RESULTADOS.md desde datos/results.json y datos/verificacion/verificacion.json.

Las cifras del informe salen de los archivos: no se copian a mano y no pueden desalinearse.
"""
import json
from pathlib import Path

from .fetch import DATA

DOC = Path(__file__).resolve().parents[1] / 'docs' / 'datos' / 'RESULTADOS.md'


def _v(group, key, digits=1):
    metric = (group or {}).get(key) or {}
    value = metric.get('value')
    if value is None:
        return '—'
    if key == 'constraint_pass_frequency':
        return f"{metric['numerator']}/{metric['denominator']}"
    return f'{value:.{digits}f}'.replace('.', ',')


def build():
    results = json.loads((DATA / 'results.json').read_text(encoding='utf-8'))
    ver = json.loads((DATA / 'verificacion' / 'verificacion.json').read_text(encoding='utf-8'))
    records = results['data']['records']
    lines = [f"# Resultados del modelo (generado automáticamente)", '',
             f"Build `{results['build_id']}` · datos hasta {results['data_as_of'][:10]} · generado {results['generated_at']}.",
             'No editar a mano: `python -m raiz_data procesar` y luego `python -m raiz_data informe`.', '',
             '## 1. Papa en secano por periodo y fase ENSO (campaña de decisión, caso A-1)', '',
             '| Periodo | ENSO | n | Años | Lluvia campaña (mm) | ETa/ETc | Estrés severo (días) | Riego necesario (mm) | Campaña aceptable | Estrés con lluvia SENAMHI |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in records:
        if r['case_id'] == 'A-1' and r['water_budget_id'] == 'secano' and r['soil_profile_id'] == 'local-obrajes':
            d = r['decision_kpis']
            alt = (r.get('sensitivity') or {}).get('decision_kpis_alt', {}).get('water_stress_days')
            diag = r.get('diagnostics') or {}
            years = ', '.join(str(w['campaign_years'][0]) for w in r['windows'])
            lines.append(f"| {r['period_id']} | {r['enso_initial_phase']} | {r['n_windows']} | {years} | {diag.get('decision_rain_mm_mean', '—')} | "
                         f"{diag.get('decision_relative_et_mean', '—')} | {_v(d, 'water_stress_days')} | {_v(d, 'net_irrigation_requirement_mm', 0)} | "
                         f"{_v(d, 'constraint_pass_frequency')} | {'—' if alt is None else f'{alt:.1f}'.replace('.', ',')} |")
    lines += ['', '## 2. Escenario actual: 2001–2025, Niño fuerte, secano (orden por ciclo de 3 campañas)', '',
              'El Niño en curso: ONI ASO 2026 = +2,46 (NOAA CPC). Las ventanas análogas son las campañas con ONI NDJ ≥ 1,5.', '',
              '| Puesto | Caso | Rotación | Cultivo este año | Puntaje | Estrés decisión (d) | Riego decisión (mm) | Estrés ciclo (d) | Riego ciclo (mm) | Lluvia erosiva expuesta ciclo (d) |',
              '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    current = sorted((r for r in records if r['period_id'] == '2001-2025' and r['enso_initial_phase'] == 'Niño fuerte' and r['water_budget_id'] == 'secano' and r['soil_profile_id'] == 'local-obrajes'),
                     key=lambda r: (r.get('ranking') or 99, r['case_id']))
    for r in current:
        d, c = r['decision_kpis'], r['cycle_kpis']
        lines.append(f"| {r.get('ranking', '—')} | {r['case_id']} | {r['rotation_id']} | {r['decision_crop']} | {r.get('ranking_score', '—')} | "
                     f"{_v(d, 'water_stress_days')} | {_v(d, 'net_irrigation_requirement_mm', 0)} | {_v(c, 'water_stress_days')} | "
                     f"{_v(c, 'net_irrigation_requirement_mm', 0)} | {_v(c, 'bare_rain_exposure_days')} |")
    if current and current[0].get('ranking_method'):
        lines += ['', f"Pesos: {json.dumps(current[0]['ranking_method']['weights'], ensure_ascii=False)}. "
                      f"{current[0]['ranking_method']['caveat']}"]
    s = ver['senamhi']
    lines += ['', '## 3. Verificación externa', '', '### SENAMHI (estación Oruro – Ciudad) frente a NASA POWER', '',
              f"Normal nov–mar 1991–2020: SENAMHI {s['resumen']['normal_nov_mar_senamhi_mm']} mm · POWER {s['resumen']['normal_nov_mar_power_mm']} mm "
              f"(sesgo {s['resumen']['sesgo_power_pct']:+d} %). {s['resumen']['coincidencia_signo']}.", '',
              '| Periodo | SENAMHI (mm) | Anomalía SENAMHI | POWER (mm) | Anomalía POWER | Mismo signo |', '| --- | --- | --- | --- | --- | --- |']
    for row in s['filas']:
        lines.append(f"| {row['periodo']} | {row['observado_mm']} | {row['anomalia_senamhi_pct']:+d} % | {row['power_mm']} | "
                     f"{row['anomalia_power_pct']:+d} % | {'sí' if row['mismo_signo'] else 'no'} |")
    lines += ['', 'Factores de corrección mensual usados en la sensibilidad (normal SENAMHI / normal POWER): ' +
              ', '.join(f"mes {m}: {v['factor']}" for m, v in s['factores_mensuales'].items()) + '.', '',
              '### INE: rendimiento departamental de Oruro frente al agua simulada', '',
              '| Cultivo | Campañas | Spearman (ETa/ETc vs. anomalía de rendimiento) | 3 campañas más secas simuladas (anomalía kg/ha) |', '| --- | --- | --- | --- |']
    for crop, row in ver['ine'].items():
        dry = '; '.join(f"{x['campana']} ({x['anomalia_rendimiento_kg_ha']:+d})" for x in row['campanas_mas_secas_simuladas'][:3])
        lines.append(f"| {crop} | {row['campanas']} | {row['spearman_etrel_vs_anomalia_rendimiento']} | {dry} |")
    lines += ['', '### Eventos reportados (VIDECI y prensa que lo cita)', '', '| Campaña | Tipo | Lluvia nov–mar POWER (mm) | Percentil | Veredicto |', '| --- | --- | --- | --- | --- |']
    for row in ver['eventos']:
        lines.append(f"| {row['campana']} | {row['tipo']} | {row['lluvia_nov_mar_power_mm']} | {row['percentil_lluvia']} | {row['veredicto']} |")
    lines += ['', f"### Calendario: {sum(1 for r in ver['calendario']['filas'] if r['coincide'])}/{len(ver['calendario']['filas'])} fechas de siembra dentro de las épocas reportadas.",
              '', f"### NASA MERRA-2: Spearman {ver['merra2']['spearman']} entre humedad de zona radicular (GWETROOT) y ETa/ETc simulada ({ver['merra2']['n_campanas']} campañas). {ver['merra2']['nota']}.", '']
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return DOC
