"""Descarga con respaldo local: cada archivo se guarda tal cual llegó, con fecha, URL y SHA-256.

`datos/raw/registro.json` es el inventario. En modo offline solo se leen archivos ya guardados,
así el procesamiento completo funciona sin internet.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'datos'
RAW = DATA / 'raw'
REGISTRY = RAW / 'registro.json'
USER_AGENT = 'Raiz-Hackathon-DataPipeline/1.0 (NASA Space Apps 2026; uso educativo)'


class FetchError(RuntimeError):
    pass


def _registry():
    return json.loads(REGISTRY.read_text(encoding='utf-8')) if REGISTRY.exists() else {}


def _save_registry(entries):
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(dict(sorted(entries.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha256(content):
    return hashlib.sha256(content).hexdigest()


def fetch(source_id, filename, url, params=None, *, offline=False, refresh=False, timeout=180, retries=3):
    """Devuelve la ruta local. Reutiliza el archivo guardado salvo `refresh`."""
    relative = f'{source_id}/{filename}'
    path = RAW / relative
    entries = _registry()
    if path.exists() and not refresh:
        content = path.read_bytes()
        entry = entries.get(relative)
        if entry and entry['sha256'] != sha256(content):
            raise FetchError(f'{relative}: el archivo local no coincide con su huella registrada')
        return path
    if offline:
        raise FetchError(f'Modo sin conexión: falta {relative}. Ejecutar «descargar» con internet una vez.')
    full = url + ('?' + urlencode(params, doseq=True) if params else '')
    last = None
    for attempt in range(retries):
        try:
            with urlopen(Request(full, headers={'User-Agent': USER_AGENT}), timeout=timeout) as response:
                content = response.read()
            break
        except (HTTPError, URLError, TimeoutError) as error:
            last = error
            time.sleep(2 * (attempt + 1))
    else:
        raise FetchError(f'No se pudo descargar {source_id}: {last}')
    if not content:
        raise FetchError(f'{source_id}: respuesta vacía')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    entries[relative] = {'source_id': source_id, 'url': full, 'queried_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                         'sha256': sha256(content), 'bytes': len(content)}
    _save_registry(entries)
    return path


def entry(relative):
    item = _registry().get(relative)
    if not item:
        raise FetchError(f'{relative} no está en el registro de descargas')
    return item
