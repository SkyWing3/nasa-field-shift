"""Verificación externa (capa 3): SENAMHI, INE, VIDECI/prensa, calendario y NASA MERRA-2.

Ninguna de estas fuentes alimenta el modelo. Se usan para comprobar si lo simulado coincide con
lo observado u oficialmente reportado. Cada comprobación guarda la cita, el archivo y el resultado,
incluso cuando no coincide.
"""
from datetime import date, timedelta
from statistics import mean
import json

from . import agro, inputs, xlsx
from .fetch import DATA, RAW, entry

OUT = DATA / 'verificacion'

# Valores leídos de los PDF de SENAMHI (resúmenes climáticos mensuales), estación Oruro – Ciudad.
# «normal» = normal 1991–2020 que cita el propio documento.
SENAMHI_ORURO = [
    {'periodo': '2025-12', 'meses': [(2025, 12)], 'observado_mm': 115.6, 'normal_mm': 56.7, 'archivo': 'senamhi-resumen-mensual/resumen-2025-12.pdf',
     'cita': 'la estación de Oruro – Ciudad registró valores significativamente por encima de su normal, superando los 115.6 mm. frente a una media de 56.7 mm.'},
    {'periodo': '2026-01', 'meses': [(2026, 1)], 'observado_mm': 142.3, 'normal_mm': 98.5, 'archivo': 'senamhi-resumen-mensual/resumen-2026-01.pdf',
     'cita': 'la estación de Oruro – Ciudad registró valores significativamente por encima de su normal de 98.5 mm, registrando 142.3 mm'},
    {'periodo': '2025-11..2026-01', 'meses': [(2025, 11), (2025, 12), (2026, 1)], 'observado_mm': 306.7, 'normal_mm': 182.0,
     'archivo': 'senamhi-resumen-mensual/resumen-2026-01.pdf', 'cita': 'la estación de Oruro - Ciudad, que acumuló 306.7 mm frente a una normal de 182.0 mm'},
    {'periodo': '2026-03', 'meses': [(2026, 3)], 'observado_mm': 90.6, 'normal_mm': 53.9, 'archivo': 'senamhi-resumen-mensual/resumen-2026-03.pdf',
     'cita': 'la estación de Oruro – Ciudad ... llegando a registrar 90.6 mm, a su vez, sobrepasó su respectivo valor normal de 53.9 mm'},
    {'periodo': '2026-01..2026-03', 'meses': [(2026, 1), (2026, 2), (2026, 3)], 'observado_mm': 263.9, 'normal_mm': 237.0,
     'archivo': 'senamhi-resumen-mensual/resumen-2026-03.pdf', 'cita': 'la estación de Oruro - Ciudad, que acumuló 263.9 mm frente a una normal de 237.0 mm'},
    {'periodo': '2026-04', 'meses': [(2026, 4)], 'observado_mm': 33.8, 'normal_mm': 14.5, 'archivo': 'senamhi-resumen-mensual/resumen-2026-04.pdf',
     'cita': 'La Paz – El Alto y Oruro – Ciudad ... 64.4 mm y 33.8 mm, superando sus respectivas normales de 34.1 mm y 14.5 mm'},
]
# Normales mensuales 1991–2020 de Oruro – Ciudad derivadas de las citas (nov y feb por diferencia de trimestres).
SENAMHI_NORMALS = {11: 182.0 - 56.7 - 98.5, 12: 56.7, 1: 98.5, 2: 237.0 - 98.5 - 53.9, 3: 53.9, 4: 14.5}

# Eventos adversos reportados (VIDECI y prensa que lo cita). Campaña y = siembra de y, cosecha y+1.
EVENTS = [
    {'campana': 1982, 'tipo': 'sequía', 'fuente': 'Sequía regional del Niño 1982–83 en el Altiplano (documentada en Garreaud y Aceituno 2001, Journal of Climate)',
     'url': 'https://journals.ametsoc.org/view/journals/clim/14/12/1520-0442_2001_014_2779_irvots_2.0.co_2.xml'},
    {'campana': 2015, 'tipo': 'sequía', 'fuente': 'Mongabay (sep-2016): «La sequía más fuerte de los últimos 25 años»; Los Tiempos: Belén de Andamarca (Oruro) sin lluvias desde fines de 2015',
     'url': 'https://es.mongabay.com/2016/09/sequia-pueblos_indigenas-desastres_ambientales-bolivia-medio_ambiente/'},
    {'campana': 2022, 'tipo': 'sequía', 'fuente': 'Los Tiempos (2023): «Más de 34 mil familias sufren por sequía en Oruro; pierden sus cultivos y ganado», segundo año consecutivo',
     'url': 'https://www.lostiempos.com/node/611400'},
    {'campana': 2023, 'tipo': 'helada/sequía', 'fuente': 'Los Tiempos (25-jul-2024): heladas, granizo y sequía; 100 municipios en emergencia, Oruro con 275 ha afectadas',
     'url': 'https://www.lostiempos.com/actualidad/pais/20240725/cerca-33-mil-familias-pierden-sus-cultivos-heladas-sequia'},
    {'campana': 2025, 'tipo': 'helada', 'fuente': 'Correo del Sur (28-jun-2026): heladas con pérdidas de hasta 90 % de papa en cinco municipios del altiplano de La Paz y Oruro',
     'url': 'https://correodelsur.com/sociedad/20260628/heladas-causan-perdidas-de-hasta-90-de-cultivos.html'},
]

# Calendario aportado por un productor de Obrajes (P6-1, content/crops.json): ventanas de siembra y meses de cosecha.
CALENDAR_REPORTED = {'papa': ((9, 1), (10, 31), (4,)), 'quinua': ((9, 1), (11, 30), (2, 3, 4)), 'haba': ((7, 1), (10, 31), (1, 2, 3))}
CALENDAR_SOURCE = 'Calendario de un productor de Obrajes, Soracachi (P6-1, 14-nov-2026); antes: literatura boliviana (UCB, calendario aymara)'


def _ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(x, y):
    rx, ry = _ranks(x), _ranks(y)
    mx, my = mean(rx), mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else None


def monthly_total(climate, year, month):
    days = [d for d in climate if d.year == year and d.month == month]
    return sum(climate[d]['PRECTOTCORR'] for d in days) if len(days) >= 28 else None


def senamhi_contrast(climate):
    rows = []
    for item in SENAMHI_ORURO:
        totals = [monthly_total(climate, y, m) for y, m in item['meses']]
        power = None if any(t is None for t in totals) else round(sum(totals), 1)
        normal_power = round(sum(mean(t for t in (monthly_total(climate, y, m) for y in range(1991, 2021)) if t is not None) for _, m in item['meses']), 1)
        obs_anom = item['observado_mm'] / item['normal_mm'] - 1
        pow_anom = None if power is None else power / normal_power - 1
        rows.append({**{k: v for k, v in item.items() if k != 'meses'}, 'power_mm': power, 'power_normal_1991_2020_mm': normal_power,
                     'anomalia_senamhi_pct': round(100 * obs_anom), 'anomalia_power_pct': None if pow_anom is None else round(100 * pow_anom),
                     'mismo_signo': None if pow_anom is None else (obs_anom > 0) == (pow_anom > 0),
                     'sha256_archivo': entry(item['archivo'])['sha256']})
    factors = {}
    for month, normal in SENAMHI_NORMALS.items():
        power_normal = mean(t for t in (monthly_total(climate, y, month) for y in range(1991, 2021)) if t is not None)
        factors[month] = {'senamhi_normal_mm': round(normal, 1), 'power_normal_mm': round(power_normal, 1),
                          'factor': round(max(0.5, min(2.0, normal / power_normal)), 3)}
    season_s = sum(SENAMHI_NORMALS[m] for m in (11, 12, 1, 2, 3))
    season_p = sum(factors[m]['power_normal_mm'] for m in (11, 12, 1, 2, 3))
    return {'filas': rows, 'factores_mensuales': factors,
            'resumen': {'normal_nov_mar_senamhi_mm': round(season_s, 1), 'normal_nov_mar_power_mm': round(season_p, 1),
                        'sesgo_power_pct': round(100 * (season_p / season_s - 1)),
                        'coincidencia_signo': f"{sum(1 for r in rows if r['mismo_signo'])}/{sum(1 for r in rows if r['mismo_signo'] is not None)} periodos con anomalía del mismo signo"}}


def campaign_relative_et(crop, year, climate, et0, soil):
    sim = agro.simulate([year, year + 1, year + 2], [crop, 'descanso', 'descanso'], climate, et0, soil, 0)[0]
    return sim['eta'] / sim['etc'], sim


def ine_check(climate, et0, soil, last_day):
    sheet = xlsx.read(RAW / 'ine-estadisticas-agricolas' / 'ine_rendimiento_kg_ha_1984_2025.xlsx')['Oruro']
    header = sheet[2]
    years = [int(str(h).strip()[:4]) for h in header[2:]]
    out = {}
    for crop, label in (('papa', 'Papa'), ('quinua', 'Quínua'), ('haba', 'Haba')):
        row = next(r for r in sheet if len(r) > 1 and isinstance(r[1], str) and r[1].strip() == label)
        series = {y: v for y, v in zip(years, row[2:]) if isinstance(v, float)}
        usable = [y for y in sorted(series) if date(y + 3, 7, 31) <= last_day or date(y + 1, 7, 31) <= last_day]
        usable = [y for y in usable if date(y + 1, 7, 31) <= last_day and date(y + 3, 7, 31) <= last_day + (date(2100, 1, 1) - date(2100, 1, 1))]
        xs = list(range(len(usable)))
        ys = [series[y] for y in usable]
        mx, my = mean(xs), mean(ys)
        slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
        anomalies = {y: series[y] - (my + slope * (i - mx)) for i, y in enumerate(usable)}
        sim = {y: campaign_relative_et(crop, y, climate, et0, soil)[0] for y in usable}
        rho = spearman([sim[y] for y in usable], [anomalies[y] for y in usable])
        driest = sorted(usable, key=lambda y: sim[y])[:5]
        constant_runs = sum(1 for a, b in zip(ys, ys[1:]) if abs(a - b) < 1e-6)
        out[crop] = {'campanas': f'{usable[0]}-{usable[-1]+1}', 'n': len(usable), 'spearman_etrel_vs_anomalia_rendimiento': None if rho is None else round(rho, 2),
                     'tendencia_kg_ha_por_ano': round(slope, 1),
                     'campanas_mas_secas_simuladas': [{'campana': y, 'etrel': round(sim[y], 2), 'anomalia_rendimiento_kg_ha': round(anomalies[y])} for y in driest],
                     'interpretacion': ('coherente (más agua simulada ↔ mejor rendimiento)' if rho and rho > 0.2 else
                                        'débil o nula: el rendimiento departamental depende de superficie, variedades, heladas y estimación administrativa'),
                     'nota_calidad': (f'{constant_runs} pares de años consecutivos con rendimiento idéntico: posibles valores estimados o arrastrados'
                                      if constant_runs else 'Sin valores repetidos entre años consecutivos'),
                     'limite': 'Rendimiento departamental (todo Oruro), no de la celda; incluye riego, variedades y heladas'}
    return out


def events_check(climate, et0, soil, last_day):
    rains = {y: sum(climate[d]['PRECTOTCORR'] for d in climate if date(y, 11, 1) <= d <= date(y + 1, 3, 31)) for y in range(1981, last_day.year)
             if date(y + 1, 3, 31) <= last_day}
    ordered = sorted(rains.values())
    rows = []
    for event in EVENTS:
        y = event['campana']
        rain = rains.get(y)
        pct = None if rain is None else round(100 * sum(1 for r in ordered if r <= rain) / len(ordered))
        etrel, sim = campaign_relative_et('papa', y, climate, et0, soil) if date(y + 3, 7, 31) <= last_day else (None, None)
        if etrel is None:
            sim = agro.simulate([y, y + 1, y + 2], ['papa', 'descanso', 'descanso'], climate, et0, soil, 0)[0] if date(y + 1, 7, 31) <= last_day and date(y + 3, 7, 31) <= last_day else None
        frost = None
        if date(y + 1, 3, 31) <= last_day:
            frost = sum(1 for d in climate if date(y, 11, 1) <= d <= date(y + 1, 3, 31) and climate[d]['T2M_MIN'] <= -2.0)
        checks = []
        if 'sequía' in event['tipo'] and pct is not None:
            checks.append((pct <= 33, 'sequía: lluvia nov–mar en el tercio más seco' if pct <= 33 else f'sequía: lluvia en percentil {pct}, no en el tercio más seco'))
        if 'helada' in event['tipo'] and frost is not None:
            checks.append((frost > 0, 'helada registrada en POWER' if frost > 0 else 'helada: POWER (celda ~50 km) no registra Tmin ≤ −2 °C; subestima heladas locales'))
        ok = None if not checks else any(c for c, _ in checks)
        verdict = ('coincide' if ok else 'no coincide' if ok is False else 'sin datos') + ('; ' + '; '.join(t for _, t in checks) if checks else '')
        rows.append({**event, 'lluvia_nov_mar_power_mm': None if rain is None else round(rain), 'percentil_lluvia': pct,
                     'etrel_papa_secano': None if etrel is None else round(etrel, 2), 'dias_tmin_menor_igual_-2C_nov_mar': frost,
                     'coincide': ok, 'veredicto': verdict})
    return rows


def calendar_check():
    rows = []
    for crop, ((m1, d1), (m2, d2), harvest_months) in CALENDAR_REPORTED.items():
        sow = agro.CROPS[crop]['sowing']
        harvest = date(2001, *sow) + timedelta(days=agro.season_length(crop))
        inside = (m1, d1) <= sow <= (m2, d2)
        harvest_ok = harvest.month in harvest_months
        rows.append({'cultivo': crop, 'siembra_modelo': f'{sow[1]:02d}/{sow[0]:02d}', 'epoca_siembra_productor': f'{d1:02d}/{m1:02d}–{d2:02d}/{m2:02d}',
                     'cosecha_modelo': f'{harvest.day:02d}/{harvest.month:02d}', 'meses_cosecha_productor': list(harvest_months),
                     'coincide': inside and harvest_ok})
    return {'fuente': CALENDAR_SOURCE, 'filas': rows}


def claim_strong_nino(climate, oni, last_day):
    """Reproduce la frase del boletín de P6 con SU método (content/registro_fuentes_afirmaciones.md §2).

    Campaña = lluvia nov y – mar y+1 (≥140 días válidos); fase por ONI NDJ; normal = promedio de las
    campañas Normales (no de todos los años); Niño fuerte = ONI NDJ ≥ 1,5.
    """
    rains = {}
    for y in range(1981, last_day.year):
        days = [d for d in climate if date(y, 11, 1) <= d <= date(y + 1, 3, 31)]
        if len(days) >= 140 and date(y + 1, 3, 31) <= last_day:
            rains[y] = sum(climate[d]['PRECTOTCORR'] for d in days)
    phase = lambda a: 'Niño' if a >= 0.5 else 'Niña' if a <= -0.5 else 'Normal'
    normal_years = [y for y in rains if phase(oni[('NDJ', y)]) == 'Normal']
    normal = mean(rains[y] for y in normal_years)
    strong = [y for y in rains if oni[('NDJ', y)] >= 1.5]
    rows = [{'campana': f'{y}-{str(y + 1)[2:]}', 'oni_ndj': oni[('NDJ', y)], 'lluvia_mm': round(rains[y]), 'desvio_pct': round(100 * (rains[y] / normal - 1)),
             'bajo_normal': rains[y] < normal} for y in sorted(strong)]
    below = sum(r['bajo_normal'] for r in rows)
    means = {p: round(mean(rains[y] for y in rains if phase(oni[('NDJ', y)]) == p)) for p in ('Normal', 'Niño', 'Niña')}
    counts = {p: sum(1 for y in rains if phase(oni[('NDJ', y)]) == p) for p in ('Normal', 'Niño', 'Niña')}
    return {'frase_p6': '4 de 5 Niños fuertes desde 1981 tuvieron menos lluvia nov–mar que el promedio de las campañas Normales',
            'normal_mm': round(normal), 'n_normal': len(normal_years), 'medias_por_fase_mm': means, 'n_por_fase': counts,
            'nino_fuerte': rows, 'resultado': f'{below} de {len(rows)}', 'reproduce_p6': below == 4 and len(rows) == 5,
            'nota': 'Frecuencia histórica de una sola fuente (NASA POWER, celda regional), n = 5. No es probabilidad ni pronóstico; 2023-24 quedó apenas bajo la normal.'}


def merra2_check(climate, et0, soil, last_day):
    """GWETROOT (humedad de zona radicular de MERRA-2, modelo NASA independiente) vs ETa/ETc simulada."""
    years = [y for y in range(1981, last_day.year) if date(y + 3, 7, 31) <= last_day]
    sim, gw = [], []
    for y in years:
        sim.append(campaign_relative_et('papa', y, climate, et0, soil)[0])
        vals = [climate[d]['GWETROOT'] for d in climate if date(y, 11, 1) <= d <= date(y + 1, 3, 31) and climate[d].get('GWETROOT') is not None]
        gw.append(mean(vals))
    rho = spearman(sim, gw)
    return {'n_campanas': len(years), 'spearman': round(rho, 2), 'interpretacion': 'coherente' if rho > 0.5 else 'débil',
            'nota': 'MERRA-2 comparte la lluvia de entrada con POWER: confirma la física del balance, no la lluvia'}


def run(climate, et0, soil, last_day):
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'generado_desde': 'datos/raw (sin red)', 'senamhi': senamhi_contrast(climate), 'ine': ine_check(climate, et0, soil, last_day),
              'eventos': events_check(climate, et0, soil, last_day), 'calendario': calendar_check(), 'merra2': merra2_check(climate, et0, soil, last_day),
              'nino_fuerte_4de5': claim_strong_nino(climate, inputs.oni(), last_day)}
    (OUT / 'verificacion.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return report
