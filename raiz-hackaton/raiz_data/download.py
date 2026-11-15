"""Descargas por fuente del registro. Todas pasan por fetch() y quedan respaldadas en datos/raw/."""
from datetime import date, timedelta
import io
import json
import zipfile

from .fetch import RAW, FetchError, fetch, sha256, _registry, _save_registry
from .registry import POINT, POWER_PARAMETERS

POWER_START = '19810101'

# Publicaciones SENAMHI encontradas el 14-nov-2026 (URL exactas: los nombres no siguen un patrón fijo).
SENAMHI_PDFS = {
    'resumen-2024-10.pdf': 'https://senamhi.gob.bo/climatologia/2024/nuevo/10_RESUMEN%20CLIMATICO%20OCTUBRE_2024.pdf',
    'resumen-2024-12.pdf': 'https://senamhi.gob.bo/climatologia/2024/12%20RESUMEN%20CLIMATICO%20DICIEMBRE%202024.pdf',
    'resumen-2025-10.pdf': 'https://senamhi.gob.bo/climatologia/2025/10_RESUMEN_CLIM%C3%81TICO_OCTUBRE_2025.pdf',
    'resumen-2025-11.pdf': 'https://senamhi.gob.bo/climatologia/2025/11_RESUMEN_CLIM%C3%81TICO_NOVIEMBRE_2025.pdf',
    'resumen-2025-12.pdf': 'https://senamhi.gob.bo/climatologia/2025/12_RESUMEN_CLIM%C3%81TICO_DICIEMBRE_2025.pdf',
    'resumen-2026-01.pdf': 'https://senamhi.gob.bo/climatologia/2026/01%20RESUMEN%20CLIM%C3%81TICO%20ENERO%202026.pdf',
    'resumen-2026-03.pdf': 'https://senamhi.gob.bo/climatologia/2026/03%20RESUMEN%20CLIM%C3%81TICO%20MARZO%202026.pdf',
    'resumen-2026-04.pdf': 'https://senamhi.gob.bo/climatologia/2026/04%20RESUMEN%20CLIM%C3%81TICO%20ABRIL%202026.pdf',
    'prediccion-oruro-NDE-2024.pdf': 'https://senamhi.gob.bo/meteorologia/boletines/tendencias/2024/11_BOLETIN_PREDICCION_NDE%202024_ORURO.pdf',
    'prediccion-oruro-DEF-2024-2025.pdf': 'https://senamhi.gob.bo/meteorologia/boletines/tendencias/2024/12_BOLETIN_PREDICCION_DEF_2024-2025_ORURO.pdf',
}


def power(*, offline=False, refresh=False, end=None):
    end = end or (date.today() - timedelta(days=1)).strftime('%Y%m%d')
    params = {'parameters': ','.join(POWER_PARAMETERS), 'community': 'AG', 'longitude': POINT['longitude'],
              'latitude': POINT['latitude'], 'start': POWER_START, 'end': end, 'format': 'JSON', 'time-standard': 'LST'}
    path = fetch('nasa-power-daily', 'power_daily_oruro.json', 'https://power.larc.nasa.gov/api/temporal/daily/point', params,
                 offline=offline, refresh=refresh, timeout=600)
    data = json.loads(path.read_text(encoding='utf-8'))
    if 'properties' not in data:
        raise FetchError(f'POWER devolvió un error: {str(data)[:300]}')
    return path


def oni(*, offline=False, refresh=False):
    return fetch('noaa-cpc-oni', 'oni.ascii.txt', 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt', offline=offline, refresh=refresh)


def soilgrids(*, offline=False, refresh=False):
    params = [('lon', POINT['longitude']), ('lat', POINT['latitude'])]
    params += [('property', p) for p in ('clay', 'sand', 'silt', 'soc', 'bdod', 'wv0010', 'wv0033', 'wv1500')]
    params += [('depth', d) for d in ('0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm')]
    params += [('value', 'mean'), ('value', 'Q0.05'), ('value', 'Q0.95')]
    return fetch('isric-soilgrids', 'soilgrids_oruro.json', 'https://rest.isric.org/soilgrids/v2.0/properties/query', params,
                 offline=offline, refresh=refresh)


def senamhi(*, offline=False, refresh=False):
    paths, failed = [], []
    for name, url in SENAMHI_PDFS.items():
        source = 'senamhi-prediccion-oruro' if name.startswith('prediccion') else 'senamhi-resumen-mensual'
        try:
            paths.append(fetch(source, name, url, offline=offline, refresh=refresh, timeout=120, retries=2))
        except FetchError as error:
            failed.append(f'{name}: {error}')
    return paths, failed


def geonames_oruro(cities_zip, *, refresh=False):
    """Localidades de Oruro (GeoNames cities500, CC BY 4.0) desde la copia local de TerraLab."""
    target = RAW / 'geonames' / 'oruro_localidades.json'
    if target.exists() and not refresh:
        return target
    rows = []
    with zipfile.ZipFile(cities_zip) as archive:
        with archive.open('cities500.txt') as handle:
            for line in io.TextIOWrapper(handle, encoding='utf-8'):
                f = line.rstrip('\n').split('\t')
                if f[8] == 'BO' and f[10] == '05':  # admin1 05 = Oruro (admin1CodesASCII.txt: BO.05)
                    rows.append({'geonameid': int(f[0]), 'name': f[1], 'lat': float(f[4]), 'lon': float(f[5]),
                                 'population': int(f[14] or 0), 'elevation': int(f[16]) if f[16] else None, 'admin2': f[11]})
    content = json.dumps({'source': 'GeoNames cities500 (CC BY 4.0), filtrado BO.05 Oruro', 'origin_sha256': sha256(cities_zip.read_bytes()),
                          'places': sorted(rows, key=lambda r: -r['population'])}, ensure_ascii=False, indent=1).encode('utf-8')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    entries = _registry()
    entries['geonames/oruro_localidades.json'] = {'source_id': 'geonames', 'url': 'https://download.geonames.org/export/dump/cities500.zip',
                                                  'queried_at': 'copia local de simulacion/backend/data/geonames/source', 'sha256': sha256(content), 'bytes': len(content)}
    _save_registry(entries)
    return target


EVENT_FEEDS = {
    'firms-viirs-noaa20-24h.csv': ('nasa-firms', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv'),
    'firms-modis-24h.csv': ('nasa-firms', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_South_America_24h.csv'),
    'usgs-2.5-semana.geojson': ('usgs-sismos', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'),
    'gdacs-rss.xml': ('gdacs', 'https://www.gdacs.org/xml/rss.xml'),
}


def events(stamp, *, offline=False):
    """Instantánea de los feeds de eventos. Cada consulta se guarda con su hora para auditar las alertas."""
    paths, failed = {}, []
    for name, (source, url) in EVENT_FEEDS.items():
        try:
            if offline:
                candidates = sorted((RAW / source).glob(f'*-{name}'))
                if not candidates:
                    raise FetchError(f'sin instantánea local de {name}')
                paths[name] = candidates[-1]
            else:
                paths[name] = fetch(source, f'{stamp}-{name}', url, timeout=90, retries=2)
        except FetchError as error:
            failed.append(f'{name}: {error}')
    return paths, failed
