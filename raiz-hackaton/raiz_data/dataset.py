"""Dataset local consolidado (SQLite, biblioteca estándar): todo lo descargado y procesado.

Se regenera sin red desde datos/raw/. Es la copia de respaldo consultable del equipo (D1); la web
no la consulta en vivo: sirve los JSON precalculados del paquete.
"""
import json
import sqlite3
from contextlib import closing

from . import inputs, xlsx
from .fetch import DATA, RAW, _registry
from .registry import SOURCES

DB = DATA / 'raiz_oruro.sqlite3'

SCHEMA = """
CREATE TABLE fuentes (source_id TEXT PRIMARY KEY, capa TEXT, agencia TEXT, producto TEXT, cobertura TEXT, acceso TEXT, licencia TEXT, url TEXT, uso TEXT, estado TEXT);
CREATE TABLE descargas (archivo TEXT PRIMARY KEY, source_id TEXT, url TEXT, consultado TEXT, sha256 TEXT, bytes INTEGER);
CREATE TABLE clima_diario (fecha TEXT, variable TEXT, valor REAL, PRIMARY KEY (fecha, variable));
CREATE TABLE et0_diaria (fecha TEXT PRIMARY KEY, et0_mm REAL, metodo TEXT);
CREATE TABLE oni (temporada TEXT, anio INTEGER, anomalia REAL, PRIMARY KEY (temporada, anio));
CREATE TABLE suelo (propiedad TEXT, profundidad TEXT, media REAL, q05 REAL, q95 REAL, unidad TEXT);
CREATE TABLE campanas_simuladas (anio_decision INTEGER, caso TEXT, presupuesto TEXT, posicion INTEGER, anio INTEGER, cultivo TEXT,
  riego_mm REAL, estres_severo_dias INTEGER, estres_leve_dias INTEGER, helada_dias INTEGER, lluvia_expuesta_dias INTEGER, viento_expuesto_dias INTEGER,
  cobertura_pct REAL, lluvia_mm REAL, eta_mm REAL, etc_mm REAL, drenaje_mm REAL, escorrentia_mm REAL);
CREATE TABLE resultados (result_id TEXT PRIMARY KEY, periodo TEXT, fase_enso TEXT, presupuesto TEXT, caso TEXT, rotacion TEXT, cultivo_decision TEXT,
  n_ventanas INTEGER, ranking INTEGER, puntaje REAL, estres_decision REAL, riego_req_decision REAL, helada_decision REAL, lluvia_expuesta_decision REAL,
  viento_expuesto_decision REAL, cobertura_decision REAL, frecuencia_cumple_decision REAL, estres_ciclo REAL, riego_req_ciclo REAL, sensibilidad TEXT, registro_json TEXT);
CREATE TABLE ine_oruro (indicador TEXT, cultivo TEXT, campana INTEGER, valor REAL, unidad TEXT);
CREATE TABLE verificaciones (tipo TEXT, clave TEXT, coincide INTEGER, detalle_json TEXT);
CREATE TABLE localidades (geonameid INTEGER PRIMARY KEY, nombre TEXT, lat REAL, lon REAL, poblacion INTEGER, elevacion INTEGER);
CREATE TABLE IF NOT EXISTS alertas (alert_id TEXT PRIMARY KEY, creada TEXT, tipo TEXT, nivel TEXT, estado TEXT, aprobada_por TEXT, aprobada_en TEXT, texto TEXT, detalle_json TEXT);
CREATE TABLE IF NOT EXISTS boletines (boletin_id TEXT PRIMARY KEY, creado TEXT, tipo TEXT, estado TEXT, texto TEXT, detalle_json TEXT);
"""


def build(docs, ctx, verification):
    old_alerts, old_bulletins = [], []
    if DB.exists():
        with closing(sqlite3.connect(DB)) as old:
            for table, bucket in (('alertas', old_alerts), ('boletines', old_bulletins)):
                try:
                    bucket.extend(old.execute(f'SELECT * FROM {table}').fetchall())
                except sqlite3.Error:
                    pass
        DB.unlink()
    db = sqlite3.connect(DB)
    db.executescript(SCHEMA)
    db.executemany('INSERT INTO fuentes VALUES (?,?,?,?,?,?,?,?,?,?)', [(s['source_id'], s['layer'], s['agency'], s['product'], s.get('coverage'),
                   s.get('access'), s.get('license'), s.get('url'), s.get('use'), s.get('status', 'activo')) for s in SOURCES])
    db.executemany('INSERT INTO descargas VALUES (?,?,?,?,?,?)', [(k, v['source_id'], v['url'], v['queried_at'], v['sha256'], v['bytes'])
                                                                  for k, v in _registry().items()])
    rows = [(d.isoformat(), var, val) for d, c in ctx['climate'].items() for var, val in c.items() if val is not None]
    db.executemany('INSERT INTO clima_diario VALUES (?,?,?)', rows)
    db.executemany('INSERT INTO et0_diaria VALUES (?,?,?)', [(d.isoformat(), round(v, 3), ctx['et0_method'][d]) for d, v in ctx['et0'].items()])
    db.executemany('INSERT INTO oni VALUES (?,?,?)', [(s, y, v) for (s, y), v in ctx['oni'].items()])
    for prop, detail in ctx['soil']['layers'].items():
        db.executemany('INSERT INTO suelo VALUES (?,?,?,?,?,?)', [(prop, l['depth'], l['mean'], l['q05'], l['q95'], detail['unit']) for l in detail['layers']])
    camp = []
    for (y, case, budget), (_, _, limited, _) in ctx['sims'].items():
        for i, c in enumerate(limited):
            camp.append((y, case, budget, i + 1, c['year'], c['crop'], round(c['irrigation'], 1), c['stress_days'], c['mild_stress_days'], c['thermal_days'],
                         c['bare_rain_days'], c['bare_wind_days'], round(c['coverage_pct'], 1), round(c['rain'], 1), round(c['eta'], 1), round(c['etc'], 1),
                         round(c['drainage'], 1), round(c['runoff'], 1)))
    db.executemany(f'INSERT INTO campanas_simuladas VALUES ({",".join("?" * 18)})', camp)
    res = []
    for r in docs['results.json']['data']['records']:
        d, c = r['decision_kpis'] or {}, r['cycle_kpis'] or {}
        val = lambda g, k: (g.get(k) or {}).get('value')
        res.append((r['result_id'], r['period_id'], r['enso_initial_phase'], r['water_budget_id'], r['case_id'], r['rotation_id'], r['decision_crop'],
                    r['n_windows'], r.get('ranking'), r.get('ranking_score'), val(d, 'water_stress_days'), val(d, 'net_irrigation_requirement_mm'),
                    val(d, 'thermal_exposure_days'), val(d, 'bare_rain_exposure_days'), val(d, 'bare_wind_exposure_days'), val(d, 'planned_coverage_pct'),
                    val(d, 'constraint_pass_frequency'), val(c, 'water_stress_days'), val(c, 'net_irrigation_requirement_mm'), r['sensitivity_status'],
                    json.dumps(r, ensure_ascii=False)))
    db.executemany(f'INSERT INTO resultados VALUES ({",".join("?" * 21)})', res)
    for name, indicator, unit in (('ine_rendimiento_kg_ha_1984_2025.xlsx', 'rendimiento', 'kg/ha'), ('ine_superficie_ha_1984_2025.xlsx', 'superficie', 'ha'),
                                  ('ine_produccion_t_1984_2025.xlsx', 'produccion', 't')):
        path = RAW / 'ine-estadisticas-agricolas' / name
        if not path.exists():
            continue
        sheet = xlsx.read(path)['Oruro']
        years = [int(str(h).strip()[:4]) for h in sheet[2][2:]]
        for row in sheet:
            if len(row) > 1 and isinstance(row[1], str) and row[1].strip() in ('Papa', 'Quínua', 'Haba'):
                db.executemany('INSERT INTO ine_oruro VALUES (?,?,?,?,?)', [(indicator, row[1].strip().lower().replace('í', 'i'), y, v, unit)
                                                                           for y, v in zip(years, row[2:]) if isinstance(v, float)])
    ver = []
    for row in verification['senamhi']['filas']:
        ver.append(('senamhi', row['periodo'], int(bool(row['mismo_signo'])), json.dumps(row, ensure_ascii=False)))
    for crop, row in verification['ine'].items():
        ver.append(('ine', crop, int((row['spearman_etrel_vs_anomalia_rendimiento'] or 0) > 0.2), json.dumps(row, ensure_ascii=False)))
    for row in verification['eventos']:
        ver.append(('evento', f"{row['campana']}-{row['tipo']}", None if row['coincide'] is None else int(row['coincide']), json.dumps(row, ensure_ascii=False)))
    for row in verification['calendario']['filas']:
        ver.append(('calendario', row['cultivo'], int(row['coincide']), json.dumps(row, ensure_ascii=False)))
    ver.append(('merra2', 'GWETROOT', int(verification['merra2']['spearman'] > 0.5), json.dumps(verification['merra2'], ensure_ascii=False)))
    db.executemany('INSERT INTO verificaciones VALUES (?,?,?,?)', ver)
    places = json.loads((RAW / 'geonames' / 'oruro_localidades.json').read_text(encoding='utf-8'))['places']
    db.executemany('INSERT INTO localidades VALUES (?,?,?,?,?,?)', [(p['geonameid'], p['name'], p['lat'], p['lon'], p['population'], p['elevation']) for p in places])
    db.executemany('INSERT OR REPLACE INTO alertas VALUES (?,?,?,?,?,?,?,?,?)', old_alerts)
    db.executemany('INSERT OR REPLACE INTO boletines VALUES (?,?,?,?,?,?)', old_bulletins)
    db.commit()
    counts = {t: db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in
              ('fuentes', 'descargas', 'clima_diario', 'et0_diaria', 'oni', 'campanas_simuladas', 'resultados', 'ine_oruro', 'verificaciones', 'localidades')}
    db.close()
    return counts
