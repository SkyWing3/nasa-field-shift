"""Eventos repentinos (capa 4): incendios NASA FIRMS, sismos USGS y alertas GDACS → borradores de alerta.

Regla de seguridad: una alerta NUNCA se difunde sola. Se crea como «pendiente_aprobacion», cita la
fuente y pide confirmación oficial (SENAMHI, VIDECI, Observatorio San Calixto). Solo una persona
la aprueba (`aprobar`), y recién entonces se exporta el texto/MP3 para entregar a la radio.
"""
import csv
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import math
import sqlite3
from contextlib import closing
import time
from xml.etree import ElementTree as ET

from . import download
from .dataset import DB
from .fetch import DATA, RAW
from .registry import POINT

OUT = DATA / 'alertas'
RADIO = OUT / 'para_radio'
BOLIVIA = timezone(timedelta(hours=-4))
# Recuadro aproximado del departamento de Oruro (lat −19,9 a −17,2; lon −68,8 a −66,3).
ORURO_BOX = (-19.9, -17.2, -68.8, -66.3)
RULES = {
    'incendio': {'radio_km': 30, 'min_focos': 1, 'nota': 'Focos FIRMS (VIIRS NOAA-20 / MODIS) a ≤30 km de una localidad o dentro del departamento'},
    'sismo': {'reglas': [(50, 3.5), (150, 4.5), (300, 5.5)], 'nota': 'M ≥ 3,5 a ≤50 km, M ≥ 4,5 a ≤150 km o M ≥ 5,5 a ≤300 km de una localidad de Oruro'},
    'gdacs': {'radio_km': 500, 'niveles': ('Orange', 'Red'), 'nota': 'Evento GDACS a ≤500 km de Oruro; naranja/roja también más lejos si es en Bolivia'},
}
DIRS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']


def places():
    return json.loads((RAW / 'geonames' / 'oruro_localidades.json').read_text(encoding='utf-8'))['places']


def distance_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def direction(from_lat, from_lon, to_lat, to_lon):
    y = math.sin(math.radians(to_lon - from_lon)) * math.cos(math.radians(to_lat))
    x = (math.cos(math.radians(from_lat)) * math.sin(math.radians(to_lat)) -
         math.sin(math.radians(from_lat)) * math.cos(math.radians(to_lat)) * math.cos(math.radians(to_lon - from_lon)))
    bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
    return DIRS[int((bearing + 22.5) // 45) % 8]


def nearest(lat, lon, k=3):
    rows = []
    for p in places():
        d = distance_km(p['lat'], p['lon'], lat, lon)
        rows.append({'localidad': p['name'], 'distancia_km': round(d, 1), 'direccion': direction(p['lat'], p['lon'], lat, lon), 'poblacion': p['population']})
    return sorted(rows, key=lambda r: r['distancia_km'])[:k]


def in_oruro(lat, lon):
    return ORURO_BOX[0] <= lat <= ORURO_BOX[1] and ORURO_BOX[2] <= lon <= ORURO_BOX[3]


def fires(paths):
    hits = []
    for name, path in paths.items():
        if not name.startswith('firms'):
            continue
        with open(path, encoding='utf-8', newline='') as handle:
            for row in csv.DictReader(handle):
                lat, lon = float(row['latitude']), float(row['longitude'])
                near = nearest(lat, lon, 1)[0]
                if in_oruro(lat, lon) or near['distancia_km'] <= RULES['incendio']['radio_km']:
                    hits.append({'lat': lat, 'lon': lon, 'fecha': row['acq_date'], 'hora_utc': row['acq_time'], 'satelite': row.get('satellite'),
                                 'confianza': row.get('confidence'), 'frp_mw': row.get('frp'), 'archivo': path.name, 'cercana': near})
    if not hits:
        return []
    zones = {}
    for h in hits:
        zones.setdefault(h['cercana']['localidad'], []).append(h)
    main = sorted(zones.items(), key=lambda kv: -len(kv[1]))
    detail = [{'localidad': z, 'focos': len(v), 'distancia_min_km': min(h['cercana']['distancia_km'] for h in v),
               'direccion': v[0]['cercana']['direccion']} for z, v in main]
    level = 'alerta' if len(hits) >= 10 else 'precaucion' if len(hits) >= 3 else 'informativa'
    date = max(h['fecha'] for h in hits)
    zonas_txt = ', '.join(f"{d['localidad']} ({d['focos']} foco{'s' if d['focos'] > 1 else ''}, a {d['distancia_min_km']:.0f} km al {d['direccion']})" for d in detail[:3])
    text = (f"Aviso preliminar de Raíz para el departamento de Oruro. Satélites de la NASA detectaron {len(hits)} "
            f"foco{'s' if len(hits) > 1 else ''} de calor el {fecha_es(date)}, cerca de: {zonas_txt}. Puede tratarse de una quema o de un incendio. "
            "Si está en la zona, no haga quemas, aleje al ganado del humo y avise a Defensa Civil si el fuego avanza. "
            "Información satelital pendiente de confirmación oficial. Fuente: NASA FIRMS.")
    return [{'tipo': 'incendio', 'nivel': level, 'fecha_evento': date, 'zonas': detail, 'evidencia': hits[:50], 'n_evidencias': len(hits),
             'fuente': 'NASA FIRMS (LANCE)', 'confirmar_con': 'Defensa Civil (VIDECI) y bomberos forestales', 'texto': text, 'regla': RULES['incendio']['nota']}]


def quakes(paths):
    path = paths.get('usgs-2.5-semana.geojson')
    if not path:
        return []
    out = []
    for feature in json.loads(path.read_text(encoding='utf-8'))['features']:
        lon, lat, depth = feature['geometry']['coordinates']
        mag = feature['properties']['mag'] or 0
        near = nearest(lat, lon, 3)
        d = near[0]['distancia_km']
        if not any(d <= km and mag >= m for km, m in RULES['sismo']['reglas']):
            continue
        when = datetime.fromtimestamp(feature['properties']['time'] / 1000, tz=timezone.utc).astimezone(BOLIVIA)
        level = 'alerta' if mag >= 6 and d <= 150 else 'precaucion' if mag >= 5 else 'informativa'
        z = near[0]
        text = (f"Aviso preliminar de Raíz. Se registró un sismo de magnitud {mag:.1f} el {fecha_es(when.date().isoformat())} a las {when:%H:%M}, hora de Bolivia, "
                f"a {z['distancia_km']:.0f} kilómetros al {z['direccion']} de {z['localidad']}, a {depth:.0f} kilómetros de profundidad. "
                "Revise viviendas, canales de riego, pozos y estanques. Información del Servicio Geológico de Estados Unidos, "
                "pendiente de confirmación del Observatorio San Calixto.")
        out.append({'tipo': 'sismo', 'nivel': level, 'fecha_evento': when.isoformat(), 'zonas': near, 'n_evidencias': 1,
                    'evidencia': [{'id': feature['id'], 'magnitud': mag, 'lugar_usgs': feature['properties']['place'], 'lat': lat, 'lon': lon,
                                   'profundidad_km': depth, 'url': feature['properties']['url'], 'archivo': path.name}],
                    'fuente': 'USGS', 'confirmar_con': 'Observatorio San Calixto y VIDECI', 'texto': text, 'regla': RULES['sismo']['nota']})
    return out


def gdacs(paths):
    path = paths.get('gdacs-rss.xml')
    if not path:
        return []
    ns = {'gdacs': 'http://www.gdacs.org', 'geo': 'http://www.w3.org/2003/01/geo/wgs84_pos#'}
    out = []
    for item in ET.parse(path).getroot().iter('item'):
        get = lambda tag: (item.findtext(tag, namespaces=ns) or '').strip()
        try:
            lat, lon = float(get('geo:Point/geo:lat') or get('geo:lat')), float(get('geo:Point/geo:long') or get('geo:long'))
        except ValueError:
            continue
        country, level = get('gdacs:country'), get('gdacs:alertlevel')
        near = nearest(lat, lon, 3)
        close = near[0]['distancia_km'] <= RULES['gdacs']['radio_km']
        if not (close or ('Bolivia' in country and level in RULES['gdacs']['niveles'])):
            continue
        kind = {'FL': 'inundación', 'DR': 'sequía', 'EQ': 'sismo', 'TC': 'ciclón', 'VO': 'volcán', 'WF': 'incendio forestal'}.get(get('gdacs:eventtype'), get('gdacs:eventtype'))
        try:
            published = parsedate_to_datetime(get('pubDate')).astimezone(BOLIVIA).isoformat()
        except (TypeError, ValueError):
            published = datetime.now(BOLIVIA).isoformat()
        text = (f"Aviso preliminar de Raíz. El sistema internacional GDACS informa una alerta {nivel_es(level)} por {kind} "
                f"en {country or 'la región'}: {get('title')}. Consulte a SENAMHI y a Defensa Civil antes de actuar. Información pendiente de confirmación oficial.")
        out.append({'tipo': 'gdacs-' + kind.replace(' ', '-'), 'nivel': 'alerta' if level == 'Red' else 'precaucion' if level == 'Orange' else 'informativa',
                    'fecha_evento': published, 'zonas': near, 'n_evidencias': 1,
                    'evidencia': [{'titulo': get('title'), 'pais': country, 'nivel_gdacs': level, 'lat': lat, 'lon': lon, 'link': get('link'), 'archivo': path.name}],
                    'fuente': 'GDACS', 'confirmar_con': 'SENAMHI y VIDECI', 'texto': text, 'regla': RULES['gdacs']['nota']})
    return out


def fecha_es(iso):
    meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    y, m, d = (int(x) for x in iso[:10].split('-'))
    return f'{d} de {meses[m - 1]} de {y}'


def nivel_es(level):
    return {'Green': 'verde', 'Orange': 'naranja', 'Red': 'roja'}.get(level, level.lower())


def _save(alert):
    OUT.mkdir(parents=True, exist_ok=True)
    key = json.dumps({k: alert[k] for k in ('tipo', 'fecha_evento')} | {'zonas': [z['localidad'] for z in alert['zonas']], 'n': alert['n_evidencias']}, sort_keys=True)
    alert_id = f"{alert['tipo']}-{alert['fecha_evento'][:10]}-{hashlib.sha256(key.encode()).hexdigest()[:8]}"
    path = OUT / f'{alert_id}.json'
    if path.exists():
        return None
    alert = {'alert_id': alert_id, 'creada': datetime.now(BOLIVIA).isoformat(timespec='seconds'), 'estado': 'pendiente_aprobacion',
             'aprobada_por': None, 'aprobada_en': None, 'difusion': 'no_difundida', **alert}
    path.write_text(json.dumps(alert, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    _db(alert)
    return alert


def _db(alert):
    if not DB.exists():
        return
    with closing(sqlite3.connect(DB)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS alertas (alert_id TEXT PRIMARY KEY, creada TEXT, tipo TEXT, nivel TEXT, estado TEXT, aprobada_por TEXT, aprobada_en TEXT, texto TEXT, detalle_json TEXT)')
        db.execute('INSERT OR REPLACE INTO alertas VALUES (?,?,?,?,?,?,?,?,?)', (alert['alert_id'], alert['creada'], alert['tipo'], alert['nivel'], alert['estado'],
                   alert['aprobada_por'], alert['aprobada_en'], alert['texto'], json.dumps(alert, ensure_ascii=False)))


def revisar(offline=False):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%MZ')
    paths, failed = download.events(stamp, offline=offline)
    candidates = fires(paths) + quakes(paths) + gdacs(paths)
    created = [a for a in (_save(c) for c in candidates) if a]
    return {'consultado': stamp, 'feeds': {k: v.name for k, v in paths.items()}, 'fallos': failed, 'candidatas': len(candidates), 'nuevas': created}


def simulacro():
    """Alerta de práctica CLARAMENTE rotulada: sirve para demostrar el flujo sin inventar un evento real."""
    z = nearest(-18.29, -66.84, 3)
    text = ('SIMULACRO. ESTO ES UNA PRÁCTICA, NO ES UN EVENTO REAL. Aviso preliminar de Raíz: se simula una helada fuerte esta noche '
            f'en {z[0]["localidad"]} y alrededores. En un caso real: cubra almácigos, riegue ligeramente al atardecer y proteja al ganado. '
            'Fin del simulacro.')
    return _save({'tipo': 'simulacro', 'nivel': 'informativa', 'fecha_evento': datetime.now(BOLIVIA).date().isoformat(), 'zonas': z,
                  'n_evidencias': 0, 'evidencia': [], 'fuente': 'Simulacro interno de Raíz (no es un dato)', 'confirmar_con': 'n/a', 'texto': text,
                  'regla': 'Práctica del flujo de aprobación'})


def listar():
    return [json.loads(p.read_text(encoding='utf-8')) for p in sorted(OUT.glob('*.json'))] if OUT.exists() else []


def aprobar(alert_id, por, texto=None):
    """Aprobación humana: registra quién y cuándo, y exporta el texto para la radio."""
    if not por or not por.strip():
        raise ValueError('La aprobación requiere el nombre de la persona responsable (--por)')
    path = OUT / f'{alert_id}.json'
    alert = json.loads(path.read_text(encoding='utf-8'))
    if alert['estado'] != 'pendiente_aprobacion':
        raise ValueError(f"La alerta ya está en estado {alert['estado']}")
    if texto:
        alert['texto_original'] = alert['texto']
        alert['texto'] = texto
    alert.update(estado='aprobada', aprobada_por=por.strip(), aprobada_en=datetime.now(BOLIVIA).isoformat(timespec='seconds'),
                 difusion='preparada_no_difundida')
    path.write_text(json.dumps(alert, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    RADIO.mkdir(parents=True, exist_ok=True)
    (RADIO / f'{alert_id}.txt').write_text(alert['texto'] + '\n', encoding='utf-8')
    _db(alert)
    return alert


def descartar(alert_id, por, motivo):
    path = OUT / f'{alert_id}.json'
    alert = json.loads(path.read_text(encoding='utf-8'))
    alert.update(estado='descartada', aprobada_por=por, aprobada_en=datetime.now(BOLIVIA).isoformat(timespec='seconds'), motivo_descarte=motivo)
    path.write_text(json.dumps(alert, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    _db(alert)
    return alert


def vigilar(cada_min=15, veces=None, log=print):
    """Revisión periódica. Solo crea borradores; jamás difunde."""
    n = 0
    while veces is None or n < veces:
        result = revisar()
        log(f"[{result['consultado']}] candidatas={result['candidatas']} nuevas={len(result['nuevas'])} fallos={len(result['fallos'])}")
        for alert in result['nuevas']:
            log(f"  NUEVA {alert['alert_id']} ({alert['nivel']}): pendiente de aprobación humana")
        n += 1
        if veces is None or n < veces:
            time.sleep(cada_min * 60)
