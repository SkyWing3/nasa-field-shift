"""Comprobación reproducible completa de Dev 2 y publicación local del demo."""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--audio-assets', help='Catálogo/MP3 existentes y verificados; no sintetiza voz')
args = parser.parse_args()
build_step = ['-m', 'raiz_delivery', 'build', '--input', 'fixtures/dev2-v31', '--output', 'build/package-v31-final']
if args.audio_assets:
    build_step += ['--audio-assets', args.audio_assets]
steps = [
    ['-m', 'compileall', '-q', 'raiz_delivery', 'scripts', 'tests'],
    ['-m', 'unittest', 'discover', '-s', 'tests', '-v'],
    ['-m', 'raiz_delivery', 'analyze', '--input', 'fixtures/dev2-v31', '--output', 'build/input-quality.json'],
    build_step,
    ['-m', 'raiz_delivery', 'check', '--package', 'build/package-v31-final'],
    ['-m', 'raiz_delivery', 'publish', '--package', 'build/package-v31-final', '--site-root', 'build/agricultural-site'],
]
records = []
for step in steps:
    result = subprocess.run([sys.executable, *step], cwd=ROOT, env={**os.environ, 'PYTHONUTF8': '1'}, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    print(result.stdout, end='')
    print(result.stderr, end='', file=sys.stderr)
    records.append({'command': ['python', *step], 'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    if result.returncode:
        break
report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'python': sys.version.split()[0], 'status': 'passed' if all(r['exit_code'] == 0 for r in records) else 'failed', 'scope': 'Dev 2 v3.1: contratos, análisis de calidad, mensajes, impresión, importación MP3, versiones, rollback y HTTP. Demo fixture de nueve casos; sin validación científica.', 'audio_assets': args.audio_assets, 'steps': records}
folder = ROOT / 'build'
folder.mkdir(exist_ok=True)
(folder / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sys.exit(0 if report['status'] == 'passed' else 1)
