"""Audios de la bienvenida y del tutorial (beta-frontend y simulación 3D).

Fuente: content/tutorial/tutorial.json. Genera un MP3 por paso y por idioma con
Meta MMS (español spa, quechua quh, aymara ayr, guaraní grn) en
content/tutorial/audio/<idioma>/<paso>.mp3 y un manifiesto con el texto leído.
Después copia tutorial.json y los audios a public/tutorial/ de las dos apps.

Las voces son sintéticas y las traducciones son automáticas con IA, así que
cada audio queda marcado como «requiere revisión de pares». Un audio solo se
regenera si cambió el texto que lee.

Ejecutar con el entorno de voz:
    .venv-tts\\Scripts\\python scripts\\generar_audio_tutorial.py [--solo es,qu] [--sin-publicar]
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import generate_audio_mms as mms  # noqa: E402

SOURCE = REPO / 'content' / 'tutorial' / 'tutorial.json'
OUT = REPO / 'content' / 'tutorial' / 'audio'
TARGETS = [REPO / 'beta-frontend' / 'public' / 'tutorial', REPO / 'simulacion' / 'frontend' / 'public' / 'tutorial']
VOICES = {'es': 'facebook/mms-tts-spa', 'qu': 'facebook/mms-tts-quh', 'ay': 'facebook/mms-tts-ayr', 'gn': 'facebook/mms-tts-grn'}
SEED = 1234


def spoken(text, lang):
    """Texto que se lee. Cifras y siglas como se dicen en la región (números en castellano)."""
    text = text.replace('3D', 'tres de').replace('A-1', 'A uno').replace('NASA', 'nasa').replace('NOAA', 'noa')
    if lang == 'es':
        return mms.spoken_spanish(text)
    text = re.sub(r'\d+', lambda m: mms.words(m.group(0)), text)
    return re.sub(r'\s+', ' ', text.replace('-', ' ')).strip()


def scripts_for(data, lang):
    ui = data['ui']
    items = {'bienvenida': f"{ui['bienvenida_titulo'][lang]}. {ui['bienvenida_texto'][lang]}"}
    for step_id, step in data['pasos'].items():
        items[step_id] = f"{step['titulo'][lang]}. {step['para'][lang]} {ui['ejemplo_voz'][lang]}: {step['ejemplo'][lang]}"
    return items


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--solo', help='Idiomas separados por coma (por defecto: es,qu,ay,gn)')
    parser.add_argument('--sin-publicar', action='store_true')
    args = parser.parse_args()
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    langs = args.solo.split(',') if args.solo else data['idiomas_con_audio']
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'archivos': {}}
    manifest.update({'schema': 'raiz-tutorial-audio-v1', 'estado': 'requiere_revision_de_pares',
                     'aviso': 'Voz sintética Meta MMS (CC BY-NC 4.0). Textos en quechua, aymara y guaraní: traducción automática con IA. Requieren revisión de pares antes de difundir.',
                     'modelos': VOICES, 'semilla': SEED})
    for lang in langs:
        voice = None
        files = manifest['archivos'].setdefault(lang, {})
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for item_id, text in scripts_for(data, lang).items():
            said = spoken(text, lang)
            digest = hashlib.sha256(said.encode('utf-8')).hexdigest()
            mp3 = OUT / lang / f'{item_id}.mp3'
            if files.get(item_id, {}).get('sha256_texto') == digest and mp3.exists():
                continue
            if files.get(item_id, {}).get('motor') == 'ElevenLabs':
                continue  # Voz de ElevenLabs (generar_audio_tutorial_elevenlabs.py): no se pisa con MMS.
            if voice is None:
                print(f'Cargando voz {VOICES[lang]}…', flush=True)
                voice = mms.Voice(VOICES[lang], SEED)
            dropped = voice.dropped(said)
            mms.to_mp3(voice.synthesize(said), mp3)
            files[item_id] = {'archivo': f'{lang}/{item_id}.mp3', 'texto': text, 'texto_leido': said, 'sha256_texto': digest, 'motor': 'Meta MMS', 'modelo': VOICES[lang],
                              'duracion_s': round(mms.mp3_duration(mp3), 1), 'caracteres_omitidos': dropped}
            print(f'{lang}/{item_id}.mp3 · {files[item_id]["duracion_s"]} s' + (f' · omitidos {dropped}' if dropped else ''), flush=True)
    manifest['generado'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
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
