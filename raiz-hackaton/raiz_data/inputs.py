"""Lectura de los archivos respaldados: POWER, ONI y SoilGrids. Sin red."""
from datetime import date
import json

from .fetch import RAW

POWER_FILE = RAW / 'nasa-power-daily' / 'power_daily_oruro.json'
ONI_FILE = RAW / 'noaa-cpc-oni' / 'oni.ascii.txt'
SOIL_FILE = RAW / 'isric-soilgrids' / 'soilgrids_oruro.json'
FILL = -999.0
REQUIRED = ('T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'WS2M_MAX', 'PS')


def power():
    """Devuelve (días completos, clima por día, metadatos). Un día sin variables esenciales se excluye."""
    raw = json.loads(POWER_FILE.read_text(encoding='utf-8'))
    params = raw['properties']['parameter']
    climate = {}
    for key in params['T2M']:
        day = date(int(key[:4]), int(key[4:6]), int(key[6:]))
        climate[day] = {name: (None if values[key] == FILL else values[key]) for name, values in params.items()}
    complete = sorted(d for d, c in climate.items() if all(c.get(k) is not None for k in REQUIRED))
    meta = {'longitude': raw['geometry']['coordinates'][0], 'latitude': raw['geometry']['coordinates'][1],
            'elevation_m': raw['geometry']['coordinates'][2], 'units': {k: v.get('units') for k, v in raw['parameters'].items()},
            'longnames': {k: v.get('longname') for k, v in raw['parameters'].items()}, 'header': raw['header']}
    return complete, climate, meta


def oni():
    """{(temporada, año): anomalía}. NDJ del año y = nov y – ene y+1."""
    values = {}
    for line in ONI_FILE.read_text(encoding='utf-8').splitlines()[1:]:
        parts = line.split()
        if len(parts) == 4:
            values[(parts[0], int(parts[1]))] = float(parts[3])
    return values


def soil(max_depth_cm=60):
    """Promedio ponderado 0–60 cm de contenido de agua a 33 kPa (CC) y 1500 kPa (PMP) de SoilGrids."""
    raw = json.loads(SOIL_FILE.read_text(encoding='utf-8'))
    layers = {layer['name']: layer for layer in raw['properties']['layers']}
    profile, detail = {}, {}
    for name in ('wv0033', 'wv1500', 'clay', 'sand', 'silt', 'soc', 'bdod'):
        layer = layers[name]
        factor = layer['unit_measure']['d_factor']
        total = weight = 0.0
        rows = []
        for depth in layer['depths']:
            top, bottom = depth['range']['top_depth'], depth['range']['bottom_depth']
            value = depth['values'].get('mean')
            if value is None or top >= max_depth_cm:
                continue
            thickness = min(bottom, max_depth_cm) - top
            total += value / factor * thickness
            weight += thickness
            rows.append({'depth': depth['label'], 'mean': value / factor, 'q05': (depth['values'].get('Q0.05') or 0) / factor,
                         'q95': (depth['values'].get('Q0.95') or 0) / factor})
        profile[name] = total / weight if weight else None
        detail[name] = {'unit': layer['unit_measure']['target_units'], 'layers': rows}
    # SoilGrids reporta wv como «10-2 cm³/cm³» (porcentaje volumétrico) tras dividir por d_factor.
    unit = detail['wv0033']['unit']
    if unit.startswith('10-2') or unit.startswith('10^-2'):
        scale = 100.0
    elif unit.startswith('10-3') or unit.startswith('10^-3'):
        scale = 1000.0
    else:
        raise ValueError(f'Unidad de contenido de agua de SoilGrids no reconocida: {unit}')
    return {'theta_fc': profile['wv0033'] / scale, 'theta_wp': profile['wv1500'] / scale, 'clay_pct': profile['clay'],
            'sand_pct': profile['sand'], 'silt_pct': profile['silt'], 'soc': profile['soc'], 'bdod': profile['bdod'],
            'depth_cm': max_depth_cm, 'water_unit_reported': unit, 'water_scale_divisor': scale, 'layers': detail}
