"""Modelo agronómico diario: ET0 FAO-56, curvas de Kc, balance de agua del suelo y eventos por día.

Referencia principal: Allen, Pereira, Raes y Smith (1998), FAO Riego y Drenaje 56 («FAO-56»).
Cada parámetro declara su fuente o se marca como supuesto pendiente de revisión (P6).
"""
from datetime import date, timedelta
import math

FAO56 = 'Allen et al. (1998) FAO-56, https://www.fao.org/3/x0490e/x0490e00.htm'
GARCIA2003 = 'García, Raes y Jacobsen (2003), Agricultural Water Management 60(2):119-134 (lisímetro, Altiplano boliviano)'
SUPUESTO = 'SUPUESTO de demostración; revisar con P6/INIAF'

PRODUCTOR = 'Calendario de un productor de Obrajes, Soracachi (P6-1, content/crops.json, 14-nov-2026)'
# Calendario del productor (P6): papa siembra sep–oct / cosecha abr; quinua sep–nov / feb–abr; haba jul–oct / ene–mar.
# Se toma una fecha central de cada ventana; las etapas reparten la duración en las proporciones de FAO-56 Tabla 11.
# Heladas (P6-2): umbral en floración (etapa media, la que el productor dice que «se pierde todo») y letal en el resto.
CROPS = {
    'papa': {'sowing': (10, 1), 'stages': (39, 45, 65, 46), 'kc': (0.50, 1.15, 0.75), 'root_m': 0.50, 'p': 0.35,
             'frost_flowering_c': -2.5, 'frost_lethal_c': -2.5, 'cover_max': 0.80,
             'sources': {'kc': FAO56 + ' Tabla 12 (papa)', 'root_m': FAO56 + ' Tabla 22 (0,4–0,6 m)', 'p': FAO56 + ' Tabla 22',
                         'sowing': PRODUCTOR + ': siembra sep–oct → 1-oct', 'stages': PRODUCTOR + ': cosecha abr → 195 d (P6: 180–210 d)',
                         'frost': 'Chen y Li (1980) vía P6-2: −2,5 °C (planta sin aclimatar; no es el aire a 2 m)', 'cover_max': SUPUESTO}},
    'quinua': {'sowing': (10, 15), 'stages': (26, 53, 64, 37), 'kc': (0.50, 1.00, 0.70), 'root_m': 0.80, 'p': 0.55,
               'frost_flowering_c': -2.0, 'frost_lethal_c': -8.0, 'cover_max': 0.70,
               'sources': {'kc': GARCIA2003, 'root_m': SUPUESTO + ' (P6: referencia máx. 1,5 m, no calibrada)', 'p': 'Cultivo tolerante a sequía; ' + SUPUESTO,
                           'sowing': PRODUCTOR + ': siembra sep–nov → 15-oct', 'stages': PRODUCTOR + ': cosecha feb–abr → 180 d (P6: 150–210 d)',
                           'frost': 'Jacobsen et al. (2000) vía P6-2: −8 °C en 2 hojas; antesis −2 °C (susceptible, se usa el conservador) a −4 °C (tolerante)',
                           'cover_max': SUPUESTO}},
    'haba': {'sowing': (9, 1), 'stages': (21, 48, 69, 42), 'kc': (0.50, 1.15, 0.30), 'root_m': 0.60, 'p': 0.45,
             'frost_flowering_c': -1.0, 'frost_lethal_c': -5.0, 'cover_max': 0.80,
             'sources': {'kc': FAO56 + ' Tabla 12 (haba, grano seco)', 'root_m': FAO56 + ' Tabla 22 (0,5–0,7 m)', 'p': FAO56 + ' Tabla 22',
                         'sowing': PRODUCTOR + ': siembra jul–oct → 1-sep', 'stages': PRODUCTOR + ': cosecha ene–mar → 180 d (P6: 150–210 d)',
                         'frost': 'CIREN (haba) y Valdivia (2002) vía P6-2: floración −1 °C, hoja letal −5 °C', 'cover_max': SUPUESTO}},
}
FALLOW = {'kc': 0.30, 'root_m': 0.30, 'p': 0.50, 'cover': 0.25,
          'source': 'Descanso con maleza y pastoreo de animales de vecinos (productor, P6-1): cobertura parcial, no suelo desnudo. Valor 25 % ' + SUPUESTO}
LIMITS = ['Granizo: es la segunda causa de pérdida según el productor y NO se puede modelar con NASA POWER (P6-1)',
          'Los umbrales de helada son de temperatura de la planta; POWER da aire a 2 m en una celda de ~50 km',
          'El productor riega papa y haba con pozo: el riego neto requerido indica la presión sobre el pozo en años secos']
RESIDUE = {'kc': 0.25, 'cover': 0.10, 'source': 'Rastrojo tras la cosecha hasta el 31-jul; ' + SUPUESTO}

THRESHOLDS = {
    'erosive_rain_mm': {'value': 12.7, 'source': 'Umbral de lluvia erosiva de Wischmeier y Smith (1978), USLE/RUSLE'},
    'bare_cover_fraction': {'value': 0.30, 'source': 'Cobertura <30 % se considera suelo expuesto (umbral usual en conservación de suelos); ' + SUPUESTO},
    'erosive_wind_ms': {'value': 6.0, 'source': 'Viento máximo diario a 2 m (POWER WS2M_MAX) ≥6 m/s, ~percentil 90 en Oruro; POWER suaviza ráfagas; ' + SUPUESTO},
    'stress_ks': {'value': 0.5, 'source': 'Día de estrés severo si Ks < 0,5 (FAO-56 ec. 84: la transpiración cae a menos de la mitad); umbral ' + SUPUESTO},
    'curve_number': {'value': 75, 'source': 'Escorrentía SCS, número de curva 75 (cultivo en hileras, suelo grupo B/C); ' + SUPUESTO},
    'pass_stress_fraction': {'value': 0.30, 'source': 'Regla de cumplimiento: estrés severo en ≤30 % de los días de cultivo (en secano el Altiplano tiene déficit casi todo el ciclo, por eso se mide el severo); ' + SUPUESTO},
    'pass_thermal_days': {'value': 5, 'source': 'Regla de cumplimiento: ≤5 días de helada dañina; ' + SUPUESTO},
    'pass_bare_rain_days': {'value': 5, 'source': 'Regla de cumplimiento: ≤5 días de lluvia erosiva con suelo expuesto; ' + SUPUESTO},
}
ALBEDO = 0.23
SIGMA = 4.903e-9
GSC = 0.0820


def sat_vp(t):
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def extraterrestrial(lat_deg, day):
    lat = math.radians(lat_deg)
    j = day.timetuple().tm_yday
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    decl = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(lat) * math.tan(decl))))
    return 24 * 60 / math.pi * GSC * dr * (ws * math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.sin(ws))


def et0_penman_monteith(tmax, tmin, tdew, rs, u2, pressure_kpa, ra, elevation_m):
    """FAO-56 ec. 6 con Rn de ec. 38–40; ea del punto de rocío (ec. 14)."""
    tmean = (tmax + tmin) / 2
    es = (sat_vp(tmax) + sat_vp(tmin)) / 2
    ea = min(sat_vp(tdew), es)
    delta = 4098 * sat_vp(tmean) / (tmean + 237.3) ** 2
    gamma = 0.665e-3 * pressure_kpa
    rso = (0.75 + 2e-5 * elevation_m) * ra
    ratio = min(1.0, rs / rso) if rso > 0 else 1.0
    rnl = SIGMA * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * math.sqrt(ea)) * (1.35 * ratio - 0.35)
    rn = (1 - ALBEDO) * rs - rnl
    value = (0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
    return max(0.0, value)


def et0_hargreaves(tmax, tmin, ra):
    """FAO-56 ec. 52; solo para días sin radiación (antes de 1984), luego calibrada contra PM."""
    tmean = (tmax + tmin) / 2
    return max(0.0, 0.0023 * (tmean + 17.8) * math.sqrt(max(0.0, tmax - tmin)) * 0.408 * ra)


def compute_et0(days, climate, lat, elevation):
    """ET0 diaria. PM cuando hay radiación; Hargreaves calibrada por mes cuando falta."""
    pm, hs, method = {}, {}, {}
    for day in days:
        c = climate[day]
        ra = extraterrestrial(lat, day)
        hs[day] = et0_hargreaves(c['T2M_MAX'], c['T2M_MIN'], ra)
        if c.get('ALLSKY_SFC_SW_DWN') is not None and c.get('T2MDEW') is not None:
            pm[day] = et0_penman_monteith(c['T2M_MAX'], c['T2M_MIN'], c['T2MDEW'], c['ALLSKY_SFC_SW_DWN'], c['WS2M'], c['PS'], ra, elevation)
    factors = {}
    for month in range(1, 13):
        pairs = [(pm[d], hs[d]) for d in pm if d.month == month and hs[d] > 0]
        factors[month] = sum(a for a, _ in pairs) / sum(b for _, b in pairs) if pairs else 1.0
    et0 = {}
    for day in days:
        if day in pm:
            et0[day], method[day] = pm[day], 'penman_monteith'
        else:
            et0[day], method[day] = hs[day] * factors[day.month], 'hargreaves_calibrada'
    return et0, method, factors


def crop_day(crop, day_index):
    """Kc, cobertura y si es día de cultivo según la etapa (FAO-56 cap. 6, curva lineal por tramos)."""
    c = CROPS[crop]
    ini, dev, mid, late = c['stages']
    kc_ini, kc_mid, kc_end = c['kc']
    cmax = c['cover_max']
    if day_index < ini:
        return kc_ini, 0.10 + (cmax * 0.3 - 0.10) * day_index / ini
    if day_index < ini + dev:
        f = (day_index - ini) / dev
        return kc_ini + (kc_mid - kc_ini) * f, cmax * (0.3 + 0.7 * f)
    if day_index < ini + dev + mid:
        return kc_mid, cmax
    f = (day_index - ini - dev - mid) / late
    return kc_mid + (kc_end - kc_mid) * f, cmax * (1 - 0.5 * f)


def season_length(crop):
    return sum(CROPS[crop]['stages'])


def campaign_plan(crop, year):
    """Plan diario del año agrícola y (1-ago-y a 31-jul-y+1): fase, Kc, cobertura, raíz, p."""
    start, end = date(year, 8, 1), date(year + 1, 7, 31)
    plan = {}
    if crop == 'descanso':
        day = start
        while day <= end:
            plan[day] = ('descanso', FALLOW['kc'], FALLOW['cover'], FALLOW['root_m'], FALLOW['p'], None)
            day += timedelta(days=1)
        return plan
    c = CROPS[crop]
    sow = date(year, *c['sowing'])
    harvest = sow + timedelta(days=season_length(crop))
    day = start
    while day <= end:
        if day < sow:
            plan[day] = ('preparacion', RESIDUE['kc'], RESIDUE['cover'], c['root_m'], c['p'], None)
        elif day < harvest:
            index = (day - sow).days
            kc, cover = crop_day(crop, index)
            ini, dev, mid, _ = c['stages']
            flowering = ini + dev <= index < ini + dev + mid
            frost = (c['frost_flowering_c'], True) if flowering else (c['frost_lethal_c'], False)
            plan[day] = ('cultivo', kc, cover, c['root_m'], c['p'], frost)
        else:
            plan[day] = ('rastrojo', RESIDUE['kc'], RESIDUE['cover'], c['root_m'], c['p'], None)
        day += timedelta(days=1)
    return plan


def runoff(p_mm, cn=THRESHOLDS['curve_number']['value']):
    s = 25400 / cn - 254
    ia = 0.2 * s
    return (p_mm - ia) ** 2 / (p_mm - ia + s) if p_mm > ia else 0.0


def simulate(window_years, crops, climate, et0, soil, budget_mm):
    """Balance diario continuo de 3 campañas (FAO-56 cap. 8, un depósito).

    Inicialización: suelo a capacidad de campo el 1-ene del año de decisión y spin-up con descanso
    y clima real hasta el 31-jul. Riego: si el agotamiento supera el agua fácilmente disponible en
    días de cultivo, se repone a capacidad de campo hasta agotar el presupuesto de la campaña.
    `budget_mm=None` significa sin límite (sirve para la necesidad de riego).
    Devuelve una lista de registros por campaña con totales diarios.
    """
    theta = soil['theta_fc'] - soil['theta_wp']
    y0 = window_years[0]
    plan = {}
    day = date(y0, 1, 1)
    while day < date(y0, 8, 1):
        plan[day] = ('spinup', FALLOW['kc'], FALLOW['cover'], FALLOW['root_m'], FALLOW['p'], None)
        day += timedelta(days=1)
    for year, crop in zip(window_years, crops):
        plan.update(campaign_plan(crop, year))
    depletion, previous_taw = 0.0, None
    results = [dict(year=y, crop=c, irrigation=0.0, stress_days=0, mild_stress_days=0, crop_days=0, thermal_days=0, flowering_frost_days=0, bare_rain_days=0,
                    bare_wind_days=0, cover_sum=0.0, days=0, rain=0.0, eta=0.0, etc=0.0, drainage=0.0, runoff=0.0,
                    min_ks=1.0, adjust=0.0, storage_start=None, storage_end=None) for y, c in zip(window_years, crops)]
    remaining = {y: (math.inf if budget_mm is None else budget_mm) for y in window_years}
    for day in sorted(plan):
        phase, kc, cover, root, p, frost = plan[day]
        c = climate[day]
        taw = 1000 * theta * root
        storage_before = (previous_taw - depletion) if previous_taw else None
        adjust = 0.0
        if previous_taw and taw != previous_taw:
            # Aproximación de un depósito: se conserva el agotamiento RELATIVO al cambiar la raíz.
            # El agua que esto agrega o quita se contabiliza en `adjust` para cerrar el balance.
            new_depletion = depletion * taw / previous_taw
            adjust += (taw - new_depletion) - (previous_taw - depletion)
            depletion = new_depletion
        previous_taw = taw
        raw = p * taw
        campaign = None
        if day >= date(y0, 8, 1):
            year = day.year if day.month >= 8 else day.year - 1
            campaign = results[window_years.index(year)]
        irrigation = 0.0
        if phase == 'cultivo' and depletion > raw and campaign is not None:
            irrigation = min(depletion, remaining[campaign['year']])
            remaining[campaign['year']] -= irrigation
        depletion -= irrigation
        ks = 1.0 if depletion <= raw else max(0.0, (taw - depletion) / ((1 - p) * taw))
        rain = c['PRECTOTCORR']
        ro = runoff(rain)
        etc = kc * et0[day]
        eta = ks * etc
        depletion = depletion - (rain - ro) + eta
        drainage = 0.0
        if depletion < 0:
            drainage, depletion = -depletion, 0.0
        if depletion > taw:
            adjust += depletion - taw  # el suelo no puede secarse bajo el punto de marchitez
            depletion = taw
        if campaign is None:
            continue
        if campaign['storage_start'] is None:
            campaign['storage_start'] = storage_before if storage_before is not None else taw
        campaign['storage_end'] = taw - depletion
        campaign['adjust'] += adjust
        campaign['days'] += 1
        campaign['cover_sum'] += cover
        campaign['rain'] += rain
        campaign['runoff'] += ro
        campaign['drainage'] += drainage
        campaign['eta'] += eta
        campaign['etc'] += etc
        campaign['irrigation'] += irrigation
        if phase == 'cultivo':
            campaign['crop_days'] += 1
            campaign['min_ks'] = min(campaign['min_ks'], ks)
            if ks < 0.999:
                campaign['mild_stress_days'] += 1
            if ks < THRESHOLDS['stress_ks']['value']:
                campaign['stress_days'] += 1
            if frost is not None and c['T2M_MIN'] <= frost[0]:
                campaign['thermal_days'] += 1
                if frost[1]:
                    campaign['flowering_frost_days'] += 1
        if cover < THRESHOLDS['bare_cover_fraction']['value']:
            if rain >= THRESHOLDS['erosive_rain_mm']['value']:
                campaign['bare_rain_days'] += 1
            if c['WS2M_MAX'] >= THRESHOLDS['erosive_wind_ms']['value']:
                campaign['bare_wind_days'] += 1
    for campaign in results:
        campaign['coverage_pct'] = 100 * campaign['cover_sum'] / campaign['days'] if campaign['days'] else None
    return results
