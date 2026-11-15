"""Enlace verificable de MP3 precalculados; no llama motores ni proveedores."""
from copy import deepcopy
from datetime import datetime
import hashlib
import math
from pathlib import Path, PurePosixPath
import re
import shutil

from .contracts import ContractError, read_json, require, timestamp

# Traducciones experimentales (p. ej. quechua, aymara): audio adicional al español.
# El plan exige hablante y revisión agronómica para otros idiomas; sin ellas el
# estado queda experimental y la producción las rechaza.
TRANSLATION_KINDS = {'message_translation': False, 'bulletin_translation': True}
LANGUAGE_CODE = re.compile(r'^[a-z]{3}$')


def text_sha256(text):
    require(isinstance(text, str) and bool(text.strip()), 'Texto de audio vacío')
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def mp3_duration(path):
    """Suma duraciones de frames MPEG Layer III, incluidos archivos VBR.

    Valida frames y truncamiento; no verifica pronunciación ni sustituye escucha.
    No requiere ffprobe, conexión o bibliotecas opcionales durante la demo.
    """
    content = Path(path).read_bytes()
    size, position = len(content), 0
    require(size >= 8, 'MP3 vacío o demasiado corto')
    if content[:3] == b'ID3':
        require(size >= 10 and not any(b & 128 for b in content[6:10]), 'Etiqueta ID3 inválida')
        tag_size = sum(b << shift for b, shift in zip(content[6:10], (21, 14, 7, 0)))
        position = 10 + tag_size + (10 if content[5] & 16 else 0)
        require(position < size, 'MP3 sin frames después de ID3')
    if size >= 128 and content[-128:-125] == b'TAG':
        size -= 128
    duration, frames = 0.0, 0
    while position < size:
        # Algunos codificadores añaden padding nulo tras el último frame.
        if content[position] == 0 and not any(content[position:size]):
            break
        require(position + 4 <= size, 'MP3 truncado al final')
        header = int.from_bytes(content[position:position + 4], 'big')
        require(header >> 21 == 0x7FF, f'Cabecera MPEG inválida en byte {position}')
        version = (header >> 19) & 3
        layer = (header >> 17) & 3
        bitrate_index = (header >> 12) & 15
        sample_index = (header >> 10) & 3
        require(version != 1 and layer == 1 and 0 < bitrate_index < 15 and sample_index < 3, 'Solo MP3 MPEG Layer III con bitrate explícito')
        rates = (44100, 48000, 32000)
        rate = rates[sample_index] // (1 if version == 3 else 2 if version == 2 else 4)
        bitrates = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320) if version == 3 else (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
        samples = 1152 if version == 3 else 576
        frame_length = ((144000 if version == 3 else 72000) * bitrates[bitrate_index]) // rate + ((header >> 9) & 1)
        require(position + frame_length <= size, 'Frame MP3 truncado')
        duration += samples / rate
        position += frame_length
        frames += 1
    require(frames >= 2 and duration > 0, 'MP3 sin suficientes frames reproducibles')
    return round(duration, 6)


def safe_audio_path(root, relative):
    require(isinstance(relative, str), 'Ruta de audio requerida')
    pure = PurePosixPath(relative)
    require(not pure.is_absolute() and not any(char in relative for char in ('\\', ':', '%', '?', '#', '\0')) and '..' not in pure.parts and len(pure.parts) == 2 and pure.parts[0] == 'audio' and pure.suffix.lower() == '.mp3', 'Ruta de MP3 insegura')
    root = Path(root).resolve()
    path = root / relative
    require(not any(part.is_symlink() for part in (path, path.parent)), 'No se permiten enlaces simbólicos de audio')
    require(path.resolve().is_relative_to(root), 'MP3 fuera de raíz')
    return path


def _references(message, bulletin=False):
    return {'kind': 'regional_bulletin' if bulletin else 'message', 'communication_id': message.get('communication_id'), 'result_id': None if bulletin else message.get('result_id'), 'case_id': None if bulletin else message.get('case_id')}


def _file_checks(item, root, *, bulletin):
    path = safe_audio_path(root, item.get('path'))
    require(path.is_file(), f'MP3 ausente: {path.name}')
    content = path.read_bytes()
    require(type(item.get('bytes')) is int and item['bytes'] == len(content), 'Tamaño MP3 no coincide')
    require(item.get('sha256') == hashlib.sha256(content).hexdigest(), 'Hash MP3 no coincide')
    duration = mp3_duration(path)
    claimed = item.get('duration_seconds')
    require(type(claimed) in (int, float) and math.isfinite(claimed) and abs(claimed - duration) < 0.02, 'Duración MP3 no coincide')
    if bulletin:
        require(duration <= 60, 'Boletín regional supera 60 segundos')
    return path, duration


def _voice_and_license(item):
    voice, license_info = item.get('voice'), item.get('license')
    require(isinstance(voice, dict) and all(isinstance(voice.get(k), str) and voice[k] for k in ('provider', 'name', 'language')), 'Procedencia de voz incompleta')
    require(isinstance(license_info, dict) and license_info.get('status') in ('licensed', 'pending_confirmation') and isinstance(license_info.get('url'), str) and license_info['url'].startswith('https://'), 'Licencia de voz no registrada')
    return voice, license_info


def _validate_item(item, message, communications, root, *, bulletin=False, production=False, at=None):
    require(isinstance(item, dict), 'Metadatos de audio requeridos')
    for key, value in _references(message, bulletin).items():
        require(item.get(key) == value, f'Audio de otro resultado/caso: {key}')
    require(item.get('build_id') == communications['build_id'], 'Audio de otro build')
    require(item.get('text_sha256') == text_sha256(message.get('text')), 'El audio no corresponde al texto equivalente')
    path, duration = _file_checks(item, root, bulletin=bulletin)
    voice, license_info = _voice_and_license(item)
    review = item.get('review')
    require(voice['language'].startswith('es'), 'MVP requiere audio español')
    require(isinstance(review, dict) and review.get('status') in ('pending', 'approved'), 'Estado de revisión de audio inválido')
    if review['status'] == 'approved':
        require(bool(review.get('reviewer')) and bool(review.get('reviewed_at')), 'Revisión aprobada sin evidencia')
        timestamp(review['reviewed_at'])
    if production:
        require(communications['mode'] != 'fixture', 'No publicar fixture como producción científica')
        require(license_info['status'] == 'licensed' and review['status'] == 'approved', 'Producción requiere licencia confirmada y revisión de escucha aprobada')
        require(message.get('review_status') == 'approved', 'Contenido editorial sin revisión aprobada')
        issued, until = timestamp(message.get('issued_at')), timestamp(message.get('valid_until'))
        require(until > issued, 'Vigencia editorial inválida')
        if at is not None:
            instant = timestamp(at) if isinstance(at, str) else at
            require(isinstance(instant, datetime) and instant.tzinfo is not None, 'Fecha de comprobación debe incluir zona')
            require(issued <= instant < until, 'Audio fuera de vigencia editorial')
    return path, duration


def _validate_translation(item, message, communications, root, *, bulletin=False, production=False):
    """Audio en otro idioma: enlazado al texto español vigente por hash, nunca lo sustituye."""
    require(isinstance(item, dict), 'Metadatos de traducción requeridos')
    require(item.get('kind') == ('bulletin_translation' if bulletin else 'message_translation'), 'Tipo de traducción incorrecto')
    refs = _references(message, bulletin)
    for key in ('communication_id', 'result_id', 'case_id'):
        require(item.get(key) == refs[key], f'Traducción de otro resultado/caso: {key}')
    require(item.get('build_id') == communications['build_id'], 'Traducción de otro build')
    language = item.get('language')
    require(isinstance(language, str) and bool(LANGUAGE_CODE.match(language)) and language != 'spa', 'Idioma de traducción inválido: código ISO 639-3 distinto de español')
    require(isinstance(item.get('language_name'), str) and bool(item['language_name'].strip()), 'Nombre del idioma requerido')
    require(item.get('source_text_sha256') == text_sha256(message.get('text')), 'La traducción no corresponde al texto español vigente')
    require(item.get('text_sha256') == text_sha256(item.get('text')), 'El audio no corresponde al texto traducido')
    path, duration = _file_checks(item, root, bulletin=bulletin)
    translation = item.get('translation')
    require(isinstance(translation, dict) and translation.get('method') in ('machine', 'human'), 'Procedencia de traducción requerida')
    if translation['method'] == 'machine':
        require(isinstance(translation.get('model'), str) and bool(translation['model']), 'Traducción automática sin modelo declarado')
    else:
        require(isinstance(translation.get('translator'), str) and bool(translation['translator']), 'Traducción humana sin traductor declarado')
    voice, license_info = _voice_and_license(item)
    require(voice['language'] == language, 'La voz no corresponde al idioma de la traducción')
    speaker = item.get('speaker_review')
    require(isinstance(speaker, dict) and speaker.get('status') in ('pending', 'approved'), 'Estado de revisión de hablante inválido')
    if speaker['status'] == 'approved':
        require(bool(speaker.get('reviewer')) and bool(speaker.get('reviewed_at')), 'Revisión de hablante aprobada sin evidencia')
        timestamp(speaker['reviewed_at'])
    if production:
        require(communications['mode'] != 'fixture', 'No publicar fixture como producción científica')
        require(license_info['status'] == 'licensed' and speaker['status'] == 'approved', 'Otros idiomas en producción exigen licencia confirmada y revisión de hablante')
        require(message.get('review_status') == 'approved', 'Contenido editorial sin revisión aprobada')
    return path, duration


def translation_status(communications, item):
    if communications['mode'] == 'fixture':
        return 'available_fixture'
    reviewed = item['speaker_review']['status'] == 'approved' and item['license']['status'] == 'licensed'
    return 'available' if reviewed else 'available_experimental'


def attach_audio(communications, assets_dir, output_dir, *, production=False, at=None):
    """Copia únicamente MP3 coincidentes; conserva texto/IDs/estados editoriales."""
    output = deepcopy(communications)
    if assets_dir is None:
        require(not production, 'Producción requiere catálogo de MP3')
        return output
    assets = Path(assets_dir)
    catalog = read_json(assets / 'catalog.json')
    require(catalog.get('schema_version') == '1.0' and catalog.get('build_id') == output['build_id'] and catalog.get('mode') == output['mode'], 'Catálogo de audio incompatible con build/modo')
    require(isinstance(catalog.get('items'), list), 'Catálogo de audio sin items')
    items = catalog['items']
    require(all(isinstance(item, dict) for item in items), 'Cada item de audio debe ser objeto')
    require(all(all(item.get(key) is None or isinstance(item[key], str) for key in ('kind', 'communication_id', 'result_id', 'case_id', 'language')) for item in items), 'Identificadores de audio inválidos')
    require(all(item.get('kind') in ('message', 'regional_bulletin', *TRANSLATION_KINDS) for item in items), 'Tipo de audio desconocido')
    keys = [(item.get('kind'), item.get('communication_id'), item.get('result_id'), item.get('language')) for item in items]
    require(len(keys) == len(set(keys)), 'Audio duplicado en catálogo')
    paths = [item.get('path') for item in items]
    require(len(paths) == len(set(paths)), 'Dos audios del catálogo comparten ruta MP3')
    used = set()
    outputs = [(False, m) for m in output['data']['messages']] + [(True, output['data']['regional_bulletin'])]
    for bulletin, message in outputs:
        refs = _references(message, bulletin)
        kind = 'bulletin_translation' if bulletin else 'message_translation'
        entries = []
        for index, item in enumerate(items):
            if item.get('kind') != kind or item.get('communication_id') != refs['communication_id'] or item.get('result_id') != refs['result_id']:
                continue
            source, duration = _validate_translation(item, message, output, assets, bulletin=bulletin, production=production)
            target = safe_audio_path(output_dir, item['path'])
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.resolve() != target.resolve():
                shutil.copyfile(source, target)
            entry = deepcopy(item)
            entry.update(path='/' + item['path'], duration_seconds=duration, status=translation_status(output, item))
            entries.append(entry)
            used.add(index)
        if entries:
            message['translations'] = sorted(entries, key=lambda entry: entry['language'])
    for bulletin, message in outputs:
        refs = _references(message, bulletin)
        matches = [(index, item) for index, item in enumerate(items) if all(item.get(key) == refs[key] for key in ('kind', 'communication_id', 'result_id'))]
        if not matches:
            require(not production, 'Producción requiere audio de todos los mensajes y boletín')
            continue
        index, item = matches[0]
        source, duration = _validate_item(item, message, output, assets, bulletin=bulletin, production=production, at=at)
        target = safe_audio_path(output_dir, item['path'])
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
        metadata = deepcopy(item)
        metadata.update(status='available_fixture' if output['mode'] == 'fixture' else 'available' if item['review']['status'] == 'approved' and item['license']['status'] == 'licensed' else 'available_draft', path='/' + item['path'], review_status=item['review']['status'], duration_seconds=duration)
        message['audio'] = metadata
        if bulletin:
            message['audio_path'] = metadata['path']
            message['duration_seconds'] = duration
        used.add(index)
    require(used == set(range(len(items))), 'Catálogo contiene audios sin mensaje coincidente')
    validate_attached_audio(output, output_dir, production=production, at=at)
    return output


def validate_attached_audio(communications, root, *, production=False, at=None):
    """Verifica archivos publicados; `at` explícito permite auditar vigencia."""
    count = 0
    for bulletin, message in [(False, m) for m in communications['data']['messages']] + [(True, communications['data']['regional_bulletin'])]:
        translations = message.get('translations', [])
        require(isinstance(translations, list) and all(isinstance(entry, dict) for entry in translations), 'Traducciones inválidas')
        languages = [entry.get('language') for entry in translations]
        require(len(languages) == len(set(languages)), 'Idioma de traducción repetido')
        for entry in translations:
            item = deepcopy(entry)
            require(isinstance(item.get('path'), str) and item['path'].startswith('/audio/'), 'Ruta pública MP3 de traducción inválida')
            item['path'] = item['path'].lstrip('/')
            _, duration = _validate_translation(item, message, communications, root, bulletin=bulletin, production=production)
            require(entry.get('status') == translation_status(communications, item) and entry.get('duration_seconds') == duration, 'Estado o duración de traducción inconsistente')
            count += 1
        audio = message.get('audio', {})
        if audio.get('status') not in ('available_fixture', 'available_draft', 'available'):
            require(not production, 'Producción requiere audio disponible para cada salida')
            require(audio.get('path') is None, 'Audio ausente no debe declarar ruta')
            if bulletin:
                require(message.get('audio_path') is None and message.get('duration_seconds') is None, 'Boletín ausente declara archivo o duración')
            continue
        require(audio.get('status') == 'available_fixture' if communications['mode'] == 'fixture' else audio.get('status') != 'available_fixture', 'Naturaleza del audio inconsistente')
        item = deepcopy(audio)
        require(isinstance(item.get('path'), str) and item['path'].startswith('/audio/'), 'Ruta pública MP3 inválida')
        item['path'] = item['path'].lstrip('/')
        _, duration = _validate_item(item, message, communications, root, bulletin=bulletin, production=production, at=at)
        if bulletin:
            require(message.get('audio_path') == audio['path'] and message.get('duration_seconds') == duration, 'Referencias del boletín no coinciden')
        count += 1
    return {'audio_files': count, 'production_checks': production, 'validity_checked_at': at}
