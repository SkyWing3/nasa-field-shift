"""Genera MP3 en lote en Windows; no es parte del recorrido web.

Sin acceso al motor de voz, termina con error y no escribe un catálogo exitoso.
No se convierte audio vacío ni se fabrican archivos cuando falta un proveedor.
"""
import argparse
from array import array
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from raiz_delivery.audio import mp3_duration, text_sha256
from raiz_delivery.contracts import read_json, require


def generate(communications_file, assets_dir, *, voice='Microsoft Helena Desktop', rate=0):
    require(platform.system() == 'Windows', 'Generación local SAPI requiere Windows; se pueden importar MP3 grabados en cualquier SO')
    communications = read_json(communications_file)
    # Esta automatización genera únicamente demos. Un resultado real requiere
    # material y licencia revisados, luego importados mediante catalog.json.
    require(communications.get('mode') == 'fixture', 'Este generador automático solo prepara audio de demostración fixture')
    assets = Path(assets_dir).resolve()
    require(not (assets / 'catalog.json').exists(), 'Catálogo existente: usar otra carpeta para no cambiar una versión publicada')
    audio_dir = assets / 'audio'
    source_dir = assets / 'source'
    audio_dir.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)
    script = ROOT / 'scripts/synthesize_windows.ps1'
    items = []
    outputs = [(False, m) for m in communications['data']['messages']]
    outputs.append((True, communications['data']['regional_bulletin']))
    for index, (bulletin, message) in enumerate(outputs):
        text = message.get('text')
        sha = text_sha256(text)
        filename = 'regional-bulletin' if bulletin else f'message-{index + 1:02d}'
        text_file = source_dir / (filename + '.txt')
        wav_file = source_dir / (filename + '.wav')
        mp3_file = audio_dir / (filename + '.mp3')
        text_file.write_text(text, encoding='utf-8')
        quote = lambda value: "'" + str(value).replace("'", "''") + "'"
        # Invocación normal de un bloque PowerShell inline: no cambia políticas
        # de ejecución, registro, privilegios ni configuración de Windows.
        body = script.read_text(encoding='utf-8')
        inline = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; & {\n' + body + '\n} -TextFile ' + quote(text_file) + ' -WavFile ' + quote(wav_file) + ' -Mp3File ' + quote(mp3_file) + ' -VoiceName ' + quote(voice) + ' -Rate ' + str(rate)
        command = ['powershell.exe', '-STA', '-NoProfile', '-Command', inline]
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        require(result.returncode == 0 and mp3_file.is_file(), 'No se generó MP3: ' + (result.stderr or result.stdout).strip())
        with wave.open(str(wav_file), 'rb') as wav:
            require(wav.getsampwidth() == 2, 'PCM de comprobación debe ser 16 bit')
            samples = array('h', wav.readframes(wav.getnframes()))
            if sys.byteorder != 'little':
                samples.byteswap()
            require(len(samples) > 100, 'Motor devolvió audio vacío')
            rms = math.sqrt(sum(float(x) * x for x in samples) / len(samples))
            require(rms > 10, 'Motor devolvió silencio; se rechaza como audio de voz')
        duration = mp3_duration(mp3_file)
        require(not bulletin or duration <= 60, 'Boletín supera 60 segundos: acortar guion, no falsear duración')
        content = mp3_file.read_bytes()
        items.append({
            'kind': 'regional_bulletin' if bulletin else 'message',
            'communication_id': message.get('communication_id'),
            'result_id': None if bulletin else message.get('result_id'),
            'case_id': None if bulletin else message.get('case_id'),
            'build_id': communications['build_id'],
            'path': f'audio/{filename}.mp3', 'text_sha256': sha,
            'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content),
            'duration_seconds': duration, 'source_pcm_rms': round(rms, 3),
            'voice': {'provider': 'Microsoft Windows SAPI', 'name': result.stdout.strip().splitlines()[-1], 'language': 'es-ES', 'synthesis_rate': rate, 'encoder': 'Windows Media Foundation MP3'},
            'license': {'status': 'pending_confirmation', 'url': 'https://www.microsoft.com/useterms', 'notes': 'Voz integrada en Windows. No se verificó permiso de redistribución; no es una voz con licencia abierta ni autorización de producción.'},
            'review': {'status': 'pending', 'reviewer': None, 'reviewed_at': None},
        })
    catalog = {'schema_version': '1.0', 'build_id': communications['build_id'], 'mode': communications['mode'], 'generated_at': datetime.now(timezone.utc).isoformat(), 'items': items}
    (assets / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--communications', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--voice', default='Microsoft Helena Desktop')
    parser.add_argument('--rate', type=int, default=0, choices=range(-10, 11))
    args = parser.parse_args()
    try:
        catalog = generate(args.communications, args.output, voice=args.voice, rate=args.rate)
    except (ValueError, OSError, subprocess.SubprocessError, KeyError, IndexError) as error:
        parser.exit(1, f'ERROR AUDIO: {error}\n')
    print(f"OK · {len(catalog['items'])} MP3 fixture; licencia y revisión pendientes")


if __name__ == '__main__':
    main()
