"""Genera MP3 con Meta MMS-TTS (Hugging Face) en lote, fuera del recorrido web.

Uso (desde la raíz del proyecto, con el entorno de voz):

    .venv-tts/Scripts/python scripts/generate_audio_mms.py --input fixtures/dev2-v31 \
        --output assets/audio/fixture-dev2-v31-demo --languages es,quh,ayr

- Español: facebook/mms-tts-spa lee el texto equivalente de cada mensaje y del boletín.
- Quechua (quh) y aymara (ayr): EXPERIMENTAL. El texto se traduce con
  facebook/nllb-200-distilled-600M (o se toma de un archivo de traducción humana)
  y lo lee facebook/mms-tts-quh / facebook/mms-tts-ayr. Queda pendiente de
  revisión por hablante; la producción lo rechaza sin esa revisión.

Los modelos se ejecutan en este equipo (la API gratuita de Hugging Face no los
sirve). Nada de esto se llama desde la web: la demo solo sirve los MP3 guardados.
Licencia de todos los modelos: CC BY-NC 4.0 (uso no comercial, con atribución).
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from raiz_delivery.audio import mp3_duration, text_sha256  # noqa: E402
from raiz_delivery.communications import make_communications  # noqa: E402
from raiz_delivery.contracts import load_inputs, read_json, require  # noqa: E402

LICENSE = {
    'status': 'licensed', 'spdx': 'CC-BY-NC-4.0',
    'url': 'https://creativecommons.org/licenses/by-nc/4.0/',
    'notes': 'Modelos Meta MMS/NLLB publicados con CC BY-NC 4.0 (licencia leída en la ficha de Hugging Face el 2026-11-14). '
             'Uso no comercial con atribución a Meta. Si el proyecto pasa a uso comercial, sustituir la voz.',
}
TRANSLATOR = 'facebook/nllb-200-distilled-600M'
LANGUAGES = {
    'es': {'tts': 'facebook/mms-tts-spa', 'name': 'Español', 'nllb': None},
    'quh': {'tts': 'facebook/mms-tts-quh', 'name': 'Quechua (voz sudboliviana)', 'nllb': 'quy_Latn',
            'note': 'NLLB-200 no incluye quechua sudboliviano: el texto automático sale en quechua sureño de Ayacucho '
                    '(inteligible, pero con diferencias). Un hablante de Oruro debe adaptarlo y revisarlo.'},
    'ayr': {'tts': 'facebook/mms-tts-ayr', 'name': 'Aymara (voz central)', 'nllb': 'ayr_Latn',
            'note': 'Traducción automática de NLLB-200 al aymara central; calidad no verificada. Requiere revisión de hablante.'},
}
SAMPLE_RATE = 16000
PAUSE_SECONDS = 0.35
MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
          'septiembre', 'octubre', 'noviembre', 'diciembre']
# Siglas que la voz leería mal; solo afecta lo hablado, no el texto publicado.
SPOKEN_TERMS = [
    (r'\bDEMOSTRACIÓN CON FIXTURE\b', 'demostración con datos de ejemplo'),
    (r'\b[Ff][Ii][Xx][Tt][Uu][Rr][Ee]\b', 'datos de ejemplo'),
    (r'\bKPI\b', 'indicadores'), (r'\bNOAA\b', 'ene o a a'), (r'\bONI\b', 'o ene i'),
    (r'\bIRI\b', 'i erre i'), (r'\bMP3\b', 'eme pe tres'), (r'\bP5/P6\b', 'el equipo revisor'),
    (r'\bENSO\b', 'enso'), (r'\bNASA\b', 'nasa'),
]


def model_revision(model_id):
    """Commit del modelo en la caché local de Hugging Face (sin consultar la red)."""
    from huggingface_hub import snapshot_download
    try:
        return Path(snapshot_download(model_id, local_files_only=True)).name
    except Exception:  # noqa: BLE001 - la revisión es metadato; su ausencia se registra como null
        return None


def words(number):
    from num2words import num2words
    return num2words(int(number), lang='es')


def spoken_spanish(text):
    """Texto hablado equivalente: números, fechas y siglas en palabras."""
    out = text
    for pattern, replacement in SPOKEN_TERMS:
        out = re.sub(pattern, replacement, out)

    def date(match):
        day, month, year = (int(g) for g in match.groups())
        require(1 <= month <= 12, f'Fecha no reconocida en texto hablado: {match.group(0)}')
        return f"{'primero' if day == 1 else words(day)} de {MONTHS[month - 1]} de {words(year)}"

    def clock(match):
        hour, minute, zone = int(match.group(1)), int(match.group(2)), match.group(3)
        said = f'{words(hour)} horas' + (f' con {words(minute)} minutos' if minute else '')
        if zone == '-0400':
            said += ', hora de Bolivia'
        elif zone:
            said += f', hora universal {"menos" if zone[0] == "-" else "más"} {words(zone[1:3])}'
        return said

    out = re.sub(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', date, out)
    out = re.sub(r'\b(\d{1,2}):(\d{2})(?:\s*([+-]\d{4}))?', clock, out)
    out = re.sub(r'\b(\d{4})\s*[–-]\s*(\d{4})\b', lambda m: f'{words(m.group(1))} a {words(m.group(2))}', out)
    out = re.sub(r'(\d)\s*mm\b', r'\1 milímetros', out)
    out = re.sub(r'(\d)\s*%', r'\1 por ciento', out)
    out = re.sub(r'\b(\d+)[.,](\d+)\b', lambda m: f'{words(m.group(1))} coma {" ".join(words(d) for d in m.group(2))}', out)
    out = re.sub(r'\d+', lambda m: words(m.group(0)), out)
    out = re.sub(r'\s*=\s*', ' igual a ', out)
    out = re.sub(r'\s*→\s*', ', luego ', out)
    out = re.sub(r'[_/]', ' ', out)
    return re.sub(r'\s+', ' ', out).strip()


def sentences(text, limit=280):
    chunks = []
    for sentence in re.split(r'(?<=[.!?;])\s+', text.strip()):
        while len(sentence) > limit:
            cut = sentence.rfind(',', 0, limit)
            cut = cut if cut > 40 else sentence.rfind(' ', 0, limit)
            chunks.append(sentence[:cut + 1].strip())
            sentence = sentence[cut + 1:].strip()
        if sentence:
            chunks.append(sentence)
    return chunks


class Voice:
    def __init__(self, model_id, seed):
        import torch
        from transformers import AutoTokenizer, VitsModel
        self.torch, self.seed, self.model_id = torch, seed, model_id
        self.tokenizer = AutoTokenizer.from_pretrained(model_id)
        self.model = VitsModel.from_pretrained(model_id).eval()
        require(self.model.config.sampling_rate == SAMPLE_RATE, f'{model_id}: frecuencia inesperada')
        self.revision = model_revision(model_id)
        self.vocab = set(self.tokenizer.get_vocab())
        self.cache = {}

    def dropped(self, text):
        # Solo letras/dígitos: la puntuación se descarta siempre y no afecta lo pronunciado.
        return sorted({c for c in text.lower() if c not in self.vocab and c.isalnum()})

    def synthesize(self, text, rate=1.0):
        import numpy as np
        pause = np.zeros(int(SAMPLE_RATE * PAUSE_SECONDS), dtype=np.float32)
        parts = []
        for chunk in sentences(text):
            key = (chunk, rate)
            if key not in self.cache:
                inputs = self.tokenizer(chunk, return_tensors='pt')
                if inputs['input_ids'].shape[-1] == 0:
                    continue
                self.model.speaking_rate = rate
                self.torch.manual_seed(self.seed)  # VITS es estocástico: semilla fija = MP3 reproducible
                with self.torch.no_grad():
                    self.cache[key] = self.model(**inputs).waveform[0].cpu().numpy().astype(np.float32)
            parts += [self.cache[key], pause]
        require(parts, f'{self.model_id}: no quedó texto pronunciable')
        return np.concatenate(parts[:-1])


class Translator:
    def __init__(self):
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(TRANSLATOR, src_lang='spa_Latn')
        self.model = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATOR).eval()
        self.revision = model_revision(TRANSLATOR)
        self.cache = {}

    def translate(self, text, target):
        out = []
        for sentence in sentences(text, limit=400):
            key = (sentence, target)
            if len(re.findall(r'\w+', sentence)) <= 1:
                # Nombres sueltos («Oruro.») se conservan: NLLB tradujo Oruro al aymara como «Jisk'a manq'aña».
                self.cache[key] = sentence
            if key not in self.cache:
                inputs = self.tokenizer(sentence, return_tensors='pt')
                size = inputs['input_ids'].shape[-1]
                # NLLB puede entrar en bucle («mana allinchu» ×29 en la primera prueba):
                # se prohíben trigramas repetidos y se limita la longitud a la de la frase.
                with self.torch.no_grad():
                    tokens = self.model.generate(**inputs, forced_bos_token_id=self.tokenizer.convert_tokens_to_ids(target),
                                                 num_beams=4, no_repeat_ngram_size=3, repetition_penalty=1.2,
                                                 max_length=min(256, 2 * size + 16))
                self.cache[key] = check_translation(sentence, self.tokenizer.batch_decode(tokens, skip_special_tokens=True)[0].strip())
            out.append(self.cache[key])
        return ' '.join(out)


def check_translation(source, translated):
    """Rechaza salidas degeneradas en lugar de publicarlas como audio."""
    require(translated, f'Traducción vacía para: {source!r}')
    require(len(translated) <= 2.5 * len(source) + 20, f'Traducción anormalmente larga (posible bucle) para: {source!r}')
    words_ = re.findall(r"[\w']+", translated.lower())
    counts = {}
    for word in words_:
        counts[word] = counts.get(word, 0) + 1
    require(not words_ or max(counts.values()) <= max(3, len(words_) // 3), f'Traducción con palabras repetidas en bucle para: {source!r} → {translated!r}')
    return translated


def to_mp3(samples, path):
    import lameenc
    import numpy as np
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype('<i2')
    rms = math.sqrt(float(np.mean(pcm.astype(np.float64) ** 2)))
    require(len(pcm) > SAMPLE_RATE // 2 and rms > 10, 'El modelo devolvió silencio; no se publica como voz')
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(48)
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)
    path.write_bytes(bytes(encoder.encode(pcm.tobytes()) + encoder.flush()))
    return round(rms, 3)


def speak(voice, text, path, bulletin):
    """Sintetiza y mide. El boletín debe durar <=60 s: acelera poco a poco y lo registra."""
    for rate in (1.0, 1.05, 1.1, 1.15, 1.2, 1.25) if bulletin else (1.0,):
        rms = to_mp3(voice.synthesize(text, rate), path)
        duration = mp3_duration(path)
        if not bulletin or duration <= 60:
            return rms, duration, rate
    raise ValueError(f'Boletín de {duration:.1f} s aun a velocidad 1.25: acortar el guion, no falsear la duración')


def file_fields(path, assets):
    content = path.read_bytes()
    return {'path': path.relative_to(assets).as_posix(), 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}


def voice_info(voice, language, rate):
    return {'provider': 'Meta MMS-TTS vía Hugging Face (ejecución local)', 'name': voice.model_id, 'language': language,
            'model_revision': voice.revision, 'seed': voice.seed, 'speaking_rate': rate,
            'encoder': 'LAME (lameenc) MP3 48 kbps mono 16 kHz'}


def generate(communications, assets, languages, *, seed=1234, human=None, only=None):
    import torch
    torch.set_num_threads(max(1, torch.get_num_threads()))
    assets = Path(assets).resolve()
    for folder in ('audio', 'source'):
        (assets / folder).mkdir(parents=True, exist_ok=True)
    outputs = [(False, m) for m in communications['data']['messages'] if not only or only in m['result_id']]
    bulletin = communications['data']['regional_bulletin']
    if bulletin.get('text'):
        outputs.append((True, bulletin))
    translator = None
    items = []
    for language in languages:
        config = LANGUAGES[language]
        print(f'· {config["name"]}: cargando {config["tts"]}', flush=True)
        voice = Voice(config['tts'], seed)
        for index, (is_bulletin, message) in enumerate(outputs):
            name = 'regional-bulletin' if is_bulletin else message['result_id']
            spoken_es = spoken_spanish(message['text'])
            base = {
                'communication_id': message.get('communication_id'),
                'result_id': None if is_bulletin else message.get('result_id'),
                'case_id': None if is_bulletin else message.get('case_id'),
                'build_id': communications['build_id'],
            }
            if language == 'es':
                said, kind, filename = spoken_es, 'regional_bulletin' if is_bulletin else 'message', f'{name}.mp3'
            else:
                kind, filename = ('bulletin_translation' if is_bulletin else 'message_translation'), f'{name}.{language}.mp3'
                texts = (human or {}).get(language)
                if texts:
                    require(isinstance(texts.get('translator'), str) and texts['translator'].strip(), f'{language}: falta el nombre de quien tradujo («translator»)')
                    said = texts['texts'].get(message['communication_id'])
                    require(isinstance(said, str) and said.strip(), f'{language}: falta la traducción de {message["communication_id"]}')
                    translation = {'method': 'human', 'translator': texts['translator'].strip()}
                else:
                    translator = translator or Translator()
                    said = translator.translate(spoken_es, config['nllb'])
                    translation = {'method': 'machine', 'model': TRANSLATOR, 'model_revision': translator.revision,
                                   'source_language': 'spa_Latn', 'target_language': config['nllb'],
                                   'input': 'texto español normalizado para voz (números y siglas en palabras)',
                                   'notes': config['note']}
            (assets / 'source' / f'{filename[:-4]}.txt').write_text(said, encoding='utf-8')
            mp3 = assets / 'audio' / filename
            rms, duration, rate = speak(voice, said, mp3, is_bulletin)
            item = {'kind': kind, **base, **file_fields(mp3, assets), 'duration_seconds': duration, 'source_pcm_rms': rms,
                    'voice': voice_info(voice, language, rate), 'license': dict(LICENSE),
                    'dropped_characters': voice.dropped(said)}
            if language == 'es':
                item.update(text_sha256=text_sha256(message['text']), spoken_text_sha256=text_sha256(said),
                            review={'status': 'pending', 'reviewer': None, 'reviewed_at': None})
            else:
                item.update(language=language, language_name=config['name'], text=said, text_sha256=text_sha256(said),
                            source_text_sha256=text_sha256(message['text']), translation=translation,
                            speaker_review={'status': 'pending', 'reviewer': None, 'reviewed_at': None})
            items.append(item)
            print(f'  {filename}: {duration:.1f} s' + (f' (velocidad {rate})' if rate != 1.0 else ''), flush=True)
    machine = {item['language']: {} for item in items if item.get('translation', {}).get('method') == 'machine'}
    if machine:
        # Plantilla para el hablante: corregir los textos, poner su nombre en «translator»
        # y regenerar con --translations. Con «translator» vacío, el generador la rechaza.
        draft = {'_instrucciones': 'Corregir cada texto (o reescribirlo) en la variante de Oruro, escribir el nombre de quien traduce en '
                                   '«translator» y ejecutar generate_audio_mms.py con --translations este_archivo.json. '
                                   '«_es_hablado» es la referencia en español; no se publica.',
                 '_es_hablado': {message['communication_id']: spoken_spanish(message['text']) for _, message in outputs}}
        for item in items:
            if item.get('language') in machine:
                machine[item['language']][item['communication_id']] = item['text']
        for language, texts in machine.items():
            draft[language] = {'translator': '', 'origen': f'Borrador automático {TRANSLATOR}; sin revisar', 'texts': texts}
        (assets / 'source' / 'traducciones-borrador.json').write_text(json.dumps(draft, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    catalog = {'schema_version': '1.0', 'build_id': communications['build_id'], 'mode': communications['mode'],
               'generated_at': datetime.now(timezone.utc).isoformat(), 'generator': 'scripts/generate_audio_mms.py',
               'items': items}
    (assets / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input', help='Carpeta de entrada (catalog/climate/results.json); calcula los mensajes')
    source.add_argument('--communications', help='communications.json ya construido')
    source.add_argument('--texto-archivo', help='Modo texto suelto: un .txt (boletín o alerta) → un MP3 de ≤60 s')
    parser.add_argument('--editorial', help='JSON editorial usado en el build (cambia el texto del boletín)')
    parser.add_argument('--output', help='Carpeta de salida: catalog.json, audio/*.mp3, source/*.txt')
    parser.add_argument('--salida', help='Modo texto suelto: ruta del MP3 a crear')
    parser.add_argument('--languages', default='es', help='Lista separada por comas: es,quh,ayr')
    parser.add_argument('--translations', help='JSON de traducción humana: {"quh": {"translator": "...", "texts": {communication_id: texto}}}')
    parser.add_argument('--seed', type=int, default=1234)
    parser.add_argument('--filtro', help='Solo mensajes cuyo result_id contenga este texto (el boletín siempre se incluye)')
    parser.add_argument('--overwrite', action='store_true', help='Reemplazar un catálogo existente en --output')
    args = parser.parse_args()
    languages = [code.strip() for code in args.languages.split(',') if code.strip()]
    if args.texto_archivo:
        try:
            require(bool(args.salida), 'El modo texto suelto requiere --salida')
            text = Path(args.texto_archivo).read_text(encoding='utf-8').strip()
            said = spoken_spanish(text)
            voice = Voice(LANGUAGES['es']['tts'], args.seed)
            out = Path(args.salida)
            out.parent.mkdir(parents=True, exist_ok=True)
            rms, duration, rate = speak(voice, said, out, True)
            meta = {'texto_sha256': text_sha256(text), 'texto_hablado': said, 'duracion_s': duration, 'velocidad': rate, 'rms': rms,
                    'voz': voice_info(voice, 'es', rate), 'licencia': LICENSE, 'revision_escucha': 'pendiente'}
            out.with_name(out.stem + '.audio.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        except (ValueError, OSError) as error:
            parser.exit(1, f'ERROR AUDIO MMS: {error}\n')
        print(f'OK · {out} · {duration:.1f} s')
        return
    try:
        require(bool(args.output), '--output es obligatorio salvo en modo --texto-archivo')
        require(languages and all(code in LANGUAGES for code in languages), f'Idiomas admitidos: {", ".join(LANGUAGES)}')
        require(args.overwrite or not (Path(args.output) / 'catalog.json').exists(), 'Ya existe catalog.json en la salida; usar --overwrite u otra carpeta')
        if args.input:
            communications = make_communications(load_inputs(args.input), read_json(args.editorial) if args.editorial else None)
        else:
            communications = read_json(args.communications)
        human = read_json(args.translations) if args.translations else None
        catalog = generate(communications, args.output, languages, seed=args.seed, human=human, only=args.filtro)
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'ERROR AUDIO MMS: {error}\n')
    print(f"OK · {len(catalog['items'])} MP3 · build {catalog['build_id']} · mode={catalog['mode']} · revisión de escucha pendiente")


if __name__ == '__main__':
    main()
