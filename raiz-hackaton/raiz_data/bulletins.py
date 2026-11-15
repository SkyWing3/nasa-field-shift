"""Boletines bajo demanda o periódicos: agroclimático semanal (datos recientes) y manual (texto del equipo).

Se generan cuando alguien ejecuta el comando o cuando lo dispara el Programador de tareas de Windows.
Siempre quedan como borrador pendiente de revisión: generar un MP3 no es emitirlo por radio.
"""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
import subprocess
from statistics import mean

from . import inputs
from .alerts import BOLIVIA, fecha_es
from .dataset import DB
from .fetch import DATA

OUT = DATA / 'boletines'
ROOT = Path(__file__).resolve().parents[1]
NOAA_OUTLOOK = {'texto': 'la NOAA considera probable un Niño de fuerte a muy fuerte hasta enero–marzo de 2027',
                'fuente': 'NOAA CPC, discusión ENSO del 12-nov-2026', 'url': 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml'}


def tts_python():
    for candidate in (os.environ.get('RAIZ_TTS_PYTHON'), ROOT / '.venv-tts' / 'Scripts' / 'python.exe', ROOT / '.venv-tts' / 'bin' / 'python'):
        if candidate and Path(candidate).exists():
            return str(candidate)
    return None


def latest_oni():
    lines = [l.split() for l in inputs.ONI_FILE.read_text(encoding='utf-8').splitlines()[1:] if len(l.split()) == 4]
    season, year, _, anom = lines[-1]
    return season, int(year), float(anom)


def analogs(phase):
    records = json.loads((DATA / 'results.json').read_text(encoding='utf-8'))['data']['records']
    out = {}
    for case, crop in (('A-1', 'papa'), ('A-2', 'quinua'), ('B-3', 'haba')):
        rec = next((r for r in records if r['period_id'] == '2001-2025' and r['enso_initial_phase'] == phase
                    and r['water_budget_id'] == 'secano' and r['soil_profile_id'] == 'local-obrajes' and r['case_id'] == case), None)
        if rec and rec['decision_kpis']:
            out[crop] = {'estres_dias': rec['decision_kpis']['water_stress_days']['value'], 'n': rec['n_windows'],
                         'riego_mm': rec['decision_kpis']['net_irrigation_requirement_mm']['value'], 'result_id': rec['result_id'],
                         'sensibilidad_estres': (rec.get('sensitivity') or {}).get('decision_kpis_alt', {}).get('water_stress_days')}
    return out


def semanal():
    days, climate, _ = inputs.power()
    last = days[-1]
    week = [last - timedelta(days=i) for i in range(6, -1, -1)]
    rain = sum(climate[d]['PRECTOTCORR'] for d in week)
    normals = []
    for year in range(1991, 2021):
        try:
            normals.append(sum(climate[d.replace(year=year)]['PRECTOTCORR'] for d in week))
        except (KeyError, ValueError):
            continue
    normal = mean(normals)
    frost = sum(1 for d in week if climate[d]['T2M_MIN'] <= 0)
    tmin = min(climate[d]['T2M_MIN'] for d in week)
    season, year, anom = latest_oni()
    phase = 'Niño fuerte' if anom >= 1.5 else 'Niño' if anom >= 0.5 else 'Niña' if anom <= -0.5 else 'Normal'
    an = analogs(phase)
    compare = 'más' if rain > normal * 1.2 else 'menos' if rain < normal * 0.8 else 'casi igual'
    papa = an.get('papa')
    text = (f"Boletín agroclimático de Raíz para Oruro, del {fecha_es(week[0].isoformat())} al {fecha_es(last.isoformat())}. "
            f"Según datos satelitales de la NASA, llovieron {rain:.0f} milímetros, {compare} que lo normal para estas fechas, que es {normal:.0f}. "
            f"Hubo {frost} {'noche' if frost == 1 else 'noches'} con helada; la mínima fue de {tmin:.0f} grados. "
            f"El océano Pacífico está en fase {phase}, con índice de {anom:.1f}, y {NOAA_OUTLOOK['texto']}. ")
    if papa:
        text += (f"En los {papa['n']} años de {phase} recientes, la papa en secano tuvo en promedio {papa['estres_dias']:.0f} días de estrés severo por falta de agua. ")
    text += ("Conserve el rastrojo para cubrir el suelo, aproveche la humedad para sembrar y consulte a su técnico. "
             "Esto no es un pronóstico del tiempo. Borrador pendiente de revisión.")
    detail = {'semana': [week[0].isoformat(), last.isoformat()], 'lluvia_mm': round(rain, 1), 'normal_1991_2020_mm': round(normal, 1),
              'noches_helada_tmin_0C': frost, 'tmin_c': round(tmin, 1), 'oni': {'temporada': f'{season} {year}', 'anomalia': anom, 'fase': phase},
              'perspectiva': NOAA_OUTLOOK, 'analogos': an, 'fuentes': ['nasa-power-daily', 'noaa-cpc-oni', 'resultados Raíz'],
              'limites': 'POWER celda ~50 km (subestima heladas locales); análogos históricos, no pronóstico'}
    return _save('semanal', text, detail)


def manual(texto, titulo='boletin-manual', autor=None):
    if not texto or len(texto.strip()) < 20:
        raise ValueError('El boletín manual necesita un texto de al menos 20 caracteres')
    return _save(titulo, texto.strip(), {'autor': autor, 'origen': 'texto escrito por el equipo'})


def _save(kind, text, detail):
    OUT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(BOLIVIA)
    bid = f"{now:%Y%m%d-%H%M}-{kind}"
    item = {'boletin_id': bid, 'creado': now.isoformat(timespec='seconds'), 'tipo': kind, 'estado': 'borrador_pendiente_revision',
            'emitido': None, 'vigente_hasta': (now + timedelta(days=7)).isoformat(timespec='seconds'),
            'difusion': 'preparado_no_difundido', 'texto': text, 'caracteres': len(text), 'detalle': detail, 'audio': None}
    (OUT / f'{bid}.txt').write_text(text + '\n', encoding='utf-8')
    (OUT / f'{bid}.json').write_text(json.dumps(item, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if DB.exists():
        with closing(sqlite3.connect(DB)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS boletines (boletin_id TEXT PRIMARY KEY, creado TEXT, tipo TEXT, estado TEXT, texto TEXT, detalle_json TEXT)')
            db.execute('INSERT OR REPLACE INTO boletines VALUES (?,?,?,?,?,?)', (bid, item['creado'], kind, item['estado'], text, json.dumps(item, ensure_ascii=False)))
    return item


def audio(item_or_txt, mp3_path):
    """Genera el MP3 con Meta MMS (entorno .venv-tts). Devuelve la ruta o lanza error claro."""
    python = tts_python()
    if not python:
        raise RuntimeError('No se encontró el entorno de voz .venv-tts (ver docs/dev2/AUDIO.md) ni RAIZ_TTS_PYTHON')
    txt = Path(item_or_txt)
    result = subprocess.run([python, str(ROOT / 'scripts' / 'generate_audio_mms.py'), '--texto-archivo', str(txt), '--salida', str(mp3_path)],
                            capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=ROOT, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[-500:] or result.stdout.strip()[-500:])
    return Path(mp3_path)


CONTENT = ROOT.parent / 'content'


def _leader_approval():
    path = CONTENT / 'actas' / 'aprobacion_lider_quechua.json'
    if not path.exists():
        return 'pendiente'
    record = json.loads(path.read_text(encoding='utf-8'))
    return {k: record[k] for k in ('estado', 'aprobado_por', 'fecha', 'via')} | {'evidencia': 'content/actas/aprobacion_lider_quechua.json'}


def registrar_p6():
    """Registra el boletín regional de P6-5 con los audios aprobados por P5 (acta P5-2) y comprueba su cifra clave."""
    from hashlib import sha256
    from raiz_delivery.audio import mp3_duration
    audio_dir = CONTENT / 'audio'
    sums = {}
    for line in (audio_dir / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if ' *' in line:
            digest, name = line.split(' *', 1)
            sums[name.strip()] = digest.strip()
    items = []
    for lang, name, voice in (('es', 'boletin_es', 'Voz sintética Meta MMS-TTS (facebook/mms-tts-spa), CC BY-NC 4.0'),
                              ('quz', 'boletin_qu_productor', 'Voz de un productor de Obrajes (sin nombre, con autorización escrita)')):
        mp3, txt = audio_dir / f'{name}.mp3', audio_dir / f'{name}.txt'
        digest = sha256(mp3.read_bytes()).hexdigest()
        if digest != sums.get(f'{name}.mp3'):
            raise ValueError(f'{name}.mp3 no coincide con SHA256SUMS.txt')
        items.append({'idioma': lang, 'audio': f'content/audio/{name}.mp3', 'texto_archivo': f'content/audio/{name}.txt',
                      'texto': txt.read_text(encoding='utf-8').strip(), 'sha256': digest, 'duracion_s': round(mp3_duration(mp3), 1), 'voz': voice})
    claim = json.loads((DATA / 'verificacion' / 'verificacion.json').read_text(encoding='utf-8')).get('nino_fuerte_4de5', {})
    item = {'boletin_id': '20261114-2355-p6-regional', 'creado': '2026-11-14T21:55:00-04:00', 'tipo': 'regional-p6', 'autoria': 'P6 (contenido), P5 (revisión)',
            'estado': 'aprobado_por_p5', 'revision': {'por': 'P5', 'fecha': '2026-11-14T23:55:00-04:00', 'evidencia': 'content/actas/P5-2_acta_revision_audio.pdf'},
            'aprobacion_lider_quechua': _leader_approval(),
            'nota_quechua': 'Leído y grabado por un productor de la comunidad (sin nombre, con su autorización). El audio incluye repeticiones breves propias del habla.',
            'difusion': 'preparado_no_difundido', 'audios': items,
            'cifra_verificada': {'frase': '4 de cada 5 Niños fuertes con menos lluvia nov–mar que lo normal', 'reproduccion_raiz': claim.get('resultado'),
                                 'coincide': claim.get('reproduce_p6'), 'detalle': 'datos/verificacion/verificacion.json → nino_fuerte_4de5'}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{item['boletin_id']}.json").write_text(json.dumps(item, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if DB.exists():
        with closing(sqlite3.connect(DB)) as db, db:
            db.execute('INSERT OR REPLACE INTO boletines VALUES (?,?,?,?,?,?)', (item['boletin_id'], item['creado'], item['tipo'], item['estado'],
                       items[0]['texto'], json.dumps(item, ensure_ascii=False)))
    return item


def programar_instrucciones():
    """Comandos para que la persona responsable cree tareas periódicas en Windows (no se crean solas)."""
    py = Path(os.sys.executable)
    root = ROOT
    return {
        'boletin_semanal_lunes_07h': f'schtasks /Create /SC WEEKLY /D MON /ST 07:00 /TN "Raiz boletin semanal" /TR "cmd /c cd /d {root} && \\"{py}\\" -m raiz_data descargar --solo-power && \\"{py}\\" -m raiz_data boletin semanal --audio"',
        'alertas_cada_30_min': f'schtasks /Create /SC MINUTE /MO 30 /TN "Raiz revisar alertas" /TR "cmd /c cd /d {root} && \\"{py}\\" -m raiz_data alertas revisar"',
        'borrar': 'schtasks /Delete /TN "Raiz boletin semanal" /F  y  schtasks /Delete /TN "Raiz revisar alertas" /F',
        'nota': 'Las tareas solo generan borradores. Ninguna difunde por radio: la aprobación humana es obligatoria.',
    }
