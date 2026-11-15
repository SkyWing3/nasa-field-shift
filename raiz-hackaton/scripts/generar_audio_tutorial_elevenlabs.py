"""Audios del tutorial en español e inglés con ElevenLabs (cuenta del equipo).

Reemplaza en content/tutorial/audio/<es|en>/ los MP3 de la bienvenida y de cada
paso, registra en manifest.json el motor, la voz y el texto leído, y publica en
public/tutorial/ de beta-frontend y de la simulación (como generar_audio_tutorial.py).
Quechua, aymara y guaraní siguen con Meta MMS.

Clave: variable ELEVENLABS_API_KEY o la línea ELEVENLABS_API_KEY=... en
raiz-hackaton/.env (git la ignora). La clave nunca se imprime ni se guarda en el
manifiesto. Voces: ELEVENLABS_VOICE_ES / ELEVENLABS_VOICE_EN (id de voz); para
ver las voces de la cuenta:  python scripts/generar_audio_tutorial_elevenlabs.py --listar-voces

    python scripts/generar_audio_tutorial_elevenlabs.py [--solo es] [--forzar] [--sin-publicar]
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from raiz_delivery.audio import mp3_duration  # noqa: E402

SOURCE = REPO / 'content' / 'tutorial' / 'tutorial.json'
OUT = REPO / 'content' / 'tutorial' / 'audio'
TARGETS = [REPO / 'beta-frontend' / 'public' / 'tutorial', REPO / 'simulacion' / 'frontend' / 'public' / 'tutorial']
API = 'https://api.elevenlabs.io/v1'
MODEL = 'eleven_multilingual_v2'
# Voces prediseñadas de ElevenLabs (multilingües); se pueden cambiar por las del equipo.
DEFAULT_VOICES = {'es': 'EXAVITQu4vr4xnSDxMaL', 'en': '21m00Tcm4TlvDq8ikWAM'}
SEED = 1234


def setting(name):
    if os.environ.get(name):
        return os.environ[name].strip()
    for env in (ROOT / '.env', REPO / '.env'):
        if env.exists():
            for line in env.read_text(encoding='utf-8').splitlines():
                key, _, value = line.partition('=')
                if key.strip() == name and value.strip():
                    return value.strip().strip('"').strip("'")
    return None


def request(path, key, body=None, accept='application/json'):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(f'{API}{path}', data=data, method='POST' if body is not None else 'GET',
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': accept})
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'replace')[:300]
        raise SystemExit(f'ElevenLabs respondió {error.code}: {detail}') from None


def scripts_for(data, lang):
    ui = data['ui']
    items = {'bienvenida': f"{ui['bienvenida_titulo'][lang]}. {ui['bienvenida_texto'][lang]}"}
    for step_id, step in data['pasos'].items():
        items[step_id] = f"{step['titulo'][lang]}. {step['para'][lang]} {ui['ejemplo_voz'][lang]}: {step['ejemplo'][lang]}"
    return items


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--solo', help='es, en o es,en (por defecto los dos)')
    parser.add_argument('--forzar', action='store_true', help='Regenerar aunque el texto no haya cambiado')
    parser.add_argument('--sin-publicar', action='store_true')
    parser.add_argument('--listar-voces', action='store_true')
    args = parser.parse_args()
    key = setting('ELEVENLABS_API_KEY')
    if not key:
        raise SystemExit('Falta ELEVENLABS_API_KEY (variable de entorno o raiz-hackaton/.env).')
    if args.listar_voces:
        for voice in json.loads(request('/voices', key))['voices']:
            labels = voice.get('labels') or {}
            print(f"{voice['voice_id']}  {voice['name']:<24} {labels.get('language', '')} {labels.get('accent', '')} {labels.get('gender', '')}")
        return
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    langs = args.solo.split(',') if args.solo else ['es', 'en']
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'archivos': {}}
    for lang in langs:
        voice = setting(f'ELEVENLABS_VOICE_{lang.upper()}') or DEFAULT_VOICES[lang]
        files = manifest['archivos'].setdefault(lang, {})
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for item_id, text in scripts_for(data, lang).items():
            digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
            mp3 = OUT / lang / f'{item_id}.mp3'
            old = files.get(item_id, {})
            if not args.forzar and old.get('motor') == 'ElevenLabs' and old.get('voz') == voice and old.get('sha256_texto') == digest and mp3.exists():
                continue
            audio = request(f'/text-to-speech/{voice}?output_format=mp3_44100_128', key, accept='audio/mpeg', body={
                'text': text, 'model_id': MODEL, 'seed': SEED,
                'voice_settings': {'stability': 0.55, 'similarity_boost': 0.75, 'style': 0.0, 'use_speaker_boost': True},
            })
            if len(audio) < 2000:
                raise SystemExit(f'{lang}/{item_id}: ElevenLabs devolvió un audio vacío')
            mp3.write_bytes(audio)
            files[item_id] = {'archivo': f'{lang}/{item_id}.mp3', 'texto': text, 'texto_leido': text, 'sha256_texto': digest,
                              'duracion_s': round(mp3_duration(mp3), 1), 'motor': 'ElevenLabs', 'modelo': MODEL, 'voz': voice,
                              'estado': 'requiere_revision_de_pares'}
            print(f'{lang}/{item_id}.mp3 · {files[item_id]["duracion_s"]} s · voz {voice}', flush=True)
    manifest.setdefault('motores', {})['ElevenLabs'] = {'modelo': MODEL, 'idiomas': sorted(set(manifest.get('motores', {}).get('ElevenLabs', {}).get('idiomas', [])) | set(langs))}
    manifest['generado'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    con_audio = data.get('idiomas_con_audio', [])
    nuevos = [lang for lang in langs if lang not in con_audio]
    if nuevos:
        data['idiomas_con_audio'] = con_audio + nuevos
        SOURCE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not args.sin_publicar:
        for target in TARGETS:
            if not target.parent.exists():
                continue
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(OUT, target / 'audio')
            shutil.copyfile(SOURCE, target / 'tutorial.json')
            print('Publicado en', target)


if __name__ == '__main__':
    main()
