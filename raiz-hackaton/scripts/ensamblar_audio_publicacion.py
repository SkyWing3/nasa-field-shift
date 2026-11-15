"""Ensambla el catálogo de audio de la publicación (decisión v3.2).

- Mensajes: MP3 de voz sintética MMS (revisión de escucha pendiente → se muestran como borrador).
- Boletín regional en español: content/audio/boletin_es.mp3, aprobado por P5 (acta P5-2).
- Boletín en quechua: grabación de un productor de Obrajes (content/audio/boletin_qu_productor.mp3),
  como `human_recording`, con su nota obligatoria. Aprobado por P5 y por la líder.
Sin aymara ni quechua sintético.

Uso: python scripts/ensamblar_audio_publicacion.py --input datos --editorial publicacion/editorial.json \
        --mensajes assets/audio/<build_id> --salida assets/audio/<build_id>-publicacion
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from raiz_delivery.audio import mp3_duration, text_sha256  # noqa: E402
from raiz_delivery.communications import make_communications  # noqa: E402
from raiz_delivery.contracts import load_inputs, read_json, require  # noqa: E402

CONTENT = ROOT.parent / 'content'
NOTE_QU = ('Leído y grabado por un productor de la comunidad (sin nombre, con su autorización). '
           'El audio incluye repeticiones breves propias del habla.')
MMS_LICENSE = {'status': 'licensed', 'spdx': 'CC-BY-NC-4.0', 'url': 'https://creativecommons.org/licenses/by-nc/4.0/',
               'notes': 'Meta MMS-TTS; uso no comercial con atribución'}


def file_fields(src, dest_dir, name):
    target = dest_dir / 'audio' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, target)
    content = target.read_bytes()
    return {'path': f'audio/{name}', 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'duration_seconds': mp3_duration(target)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', required=True)
    parser.add_argument('--editorial', required=True)
    parser.add_argument('--mensajes', required=True, help='Carpeta con catalog.json de los MP3 MMS de mensajes')
    parser.add_argument('--salida', required=True)
    args = parser.parse_args()
    editorial = read_json(args.editorial)
    comm = make_communications(load_inputs(args.input), editorial)
    out = Path(args.salida)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    messages = {m['communication_id']: m for m in comm['data']['messages']}
    bulletin = comm['data']['regional_bulletin']
    items, skipped = [], 0
    mms = read_json(Path(args.mensajes) / 'catalog.json')
    for item in mms['items']:
        if item['kind'] != 'message':
            continue
        message = messages.get(item['communication_id'])
        if not message or item['text_sha256'] != text_sha256(message['text']):
            skipped += 1  # el texto cambió: ese MP3 ya no es equivalente y no se publica
            continue
        new = {k: v for k, v in item.items() if k not in ('path', 'sha256', 'bytes', 'duration_seconds')}
        items.append({**new, **file_fields(Path(args.mensajes) / item['path'], out, Path(item['path']).name)})
    es_txt = (CONTENT / 'audio' / 'boletin_es.txt').read_text(encoding='utf-8').strip()
    require(es_txt == bulletin['text'], 'El texto del boletín del paquete no es idéntico a content/audio/boletin_es.txt')
    items.append({'kind': 'regional_bulletin', 'communication_id': bulletin['communication_id'], 'result_id': None, 'case_id': None,
                  'build_id': comm['build_id'], **file_fields(CONTENT / 'audio' / 'boletin_es.mp3', out, 'regional-bulletin.mp3'),
                  'text_sha256': text_sha256(bulletin['text']),
                  'voice': {'provider': 'Meta MMS-TTS', 'name': 'facebook/mms-tts-spa', 'language': 'es'}, 'license': MMS_LICENSE,
                  'review': {'status': 'approved', 'reviewer': 'P5 (acta P5-2)', 'reviewed_at': '2026-11-14T23:55:00-04:00'}})
    qu_txt = (CONTENT / 'audio' / 'boletin_qu_productor.txt').read_text(encoding='utf-8').strip()
    approval = read_json(CONTENT / 'actas' / 'aprobacion_lider_quechua.json')
    require(approval.get('estado') == 'aprobado', 'Falta la aprobación de la líder para el audio en quechua')
    items.append({'kind': 'bulletin_translation', 'communication_id': bulletin['communication_id'], 'result_id': None, 'case_id': None,
                  'build_id': comm['build_id'], **file_fields(CONTENT / 'audio' / 'boletin_qu_productor.mp3', out, 'regional-bulletin.que.mp3'),
                  'language': 'que', 'language_name': 'Quechua (voz de un productor de Obrajes)', 'text': qu_txt, 'text_sha256': text_sha256(qu_txt),
                  'source_text_sha256': text_sha256(bulletin['text']), 'note': NOTE_QU,
                  'translation': {'method': 'human_recording', 'reader': 'Un productor de Obrajes, hablante de quechua (sin nombre, con autorización escrita)',
                                  'text_author': 'P6 (5 frases del boletín), leídas sin correcciones'},
                  'voice': {'provider': 'Grabación humana (WhatsApp, 14-nov-2026)', 'name': 'Productor de Obrajes (anónimo)', 'language': 'que'},
                  'license': {'status': 'licensed', 'url': 'https://github.com/SkyWing3/nasa-field-shift/blob/main/content/nota_productor.md',
                              'notes': 'Autorización escrita del productor (14-nov-2026 22:41): uso sin nombre y sin fines de lucro, con opción de retiro'},
                  'speaker_review': {'status': 'approved', 'reviewer': 'P5 (acta P5-2) y la líder', 'reviewed_at': approval['fecha']}})
    catalog = {'schema_version': '1.0', 'build_id': comm['build_id'], 'mode': comm['mode'], 'items': items,
               'nota': 'Decisión v3.2: español (MMS) + quechua del productor; sin aymara ni quechua sintético'}
    (out / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'OK · {len(items)} audios ({sum(1 for i in items if i["kind"] == "message")} mensajes, boletín es + quechua) · {skipped} MP3 descartados por texto distinto')


if __name__ == '__main__':
    main()
