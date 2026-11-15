"""Paquetes versionados: validar, comunicar, enlazar MP3 y publicar."""
import copy
import hashlib
import json
import os
import shutil
from pathlib import Path, PurePosixPath
from uuid import uuid4
from .contracts import FILES, envelope, load_inputs, read_json, require
from .communications import make_communications
from .print_sheet import render_sheet


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8', newline='\n')


def digest(path):
    content = path.read_bytes()
    return {'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}


def staging_directory(parent, prefix):
    path = parent / (prefix+uuid4().hex)
    path.mkdir()
    return path


def safe_path(root, relative):
    require(isinstance(relative, str) and relative and not any(c in relative for c in '\\:%?#') and not any(ord(c)<32 for c in relative), 'Ruta insegura')
    parts = PurePosixPath(relative)
    require(not parts.is_absolute() and '..' not in parts.parts, 'Ruta insegura')
    root = Path(root).resolve()
    candidate = root.joinpath(*parts.parts)
    require(candidate.resolve().is_relative_to(root) and not candidate.is_symlink(), 'Ruta fuera del paquete')
    return candidate


def inventory(root):
    return {p.relative_to(root).as_posix(): digest(p) for p in sorted(root.rglob('*')) if p.is_file() and p != root/'data/manifest.json'}


def sources_in(docs):
    return {s['original'] for doc in docs.values() for s in doc['sources']}


def semantic_communications(comm, expected):
    cleaned = copy.deepcopy(comm)
    require(len(cleaned['data']['messages']) == len(expected['data']['messages']), 'Número de mensajes incorrecto')
    # Las traducciones se verifican aparte (hash del texto español, MP3 e idioma).
    for actual, baseline in zip(cleaned['data']['messages'], expected['data']['messages']):
        actual['audio'] = baseline['audio']
        actual.pop('translations', None)
    actual, baseline = cleaned['data']['regional_bulletin'], expected['data']['regional_bulletin']
    actual.pop('audio', None)
    actual.pop('translations', None)
    if 'audio' in baseline:
        actual['audio'] = baseline['audio']
    for key in ('audio_path', 'duration_seconds'):
        if key in baseline:
            actual[key] = baseline[key]
    require(cleaned == expected, 'Mensajes/fichas/audio no coinciden con resultados o estado esperado')


def production_gate(docs, comm):
    from .communications import editorial_state
    require(all(doc['mode'] != 'fixture' for doc in docs.values()), 'Producción no admite fixtures')
    for item in [*comm['data']['messages'], comm['data']['regional_bulletin']]:
        require(item.get('review_status') == 'approved', 'Producción exige revisión editorial/agronómica aprobada')
        require(editorial_state(item) == 'current', 'Producción exige vigencia editorial actual')
        require(item.get('audio', {}).get('status') == 'available', 'Producción exige MP3 revisado para cada salida')


def validate_package(root, *, production=False):
    from .analysis import analyze_inputs
    from .audio import validate_attached_audio
    from .print_sheet import render_index
    root = Path(root).resolve()
    require(root.is_dir() and not any(p.is_symlink() for p in root.rglob('*')), 'Paquete ausente o con enlaces simbólicos')
    docs = load_inputs(root/'data')
    comm = read_json(root/'data/communications.json')
    envelope(comm, docs['catalog.json']['build_id'])
    editorial_path = root/'data/editorial.json'
    editorial = read_json(editorial_path) if editorial_path.exists() else None
    semantic_communications(comm, make_communications(docs, editorial))
    validate_attached_audio(comm, root, production=production)
    for message in comm['data']['messages']:
        path = safe_path(root, message['print_sheet']['path'].lstrip('/'))
        require(path.read_text(encoding='utf-8') == render_sheet(message), 'Ficha no coincide con mensaje/resultado')
    require((root/'index.html').read_text(encoding='utf-8') == render_index(comm), 'Índice no coincide con communications')
    if comm['data'].get('credits_markdown'):
        from .print_sheet import render_credits
        require((root/'creditos.html').read_text(encoding='utf-8') == render_credits(comm), 'Créditos no coinciden con communications')
    require(read_json(root/'data/quality.json') == analyze_inputs(docs), 'Reporte de calidad no coincide con entradas')
    manifest = read_json(root/'data/manifest.json')
    envelope(manifest, comm['build_id'])
    require(manifest['data']['status'] == ('fixture_only' if comm['mode']=='fixture' else 'precalculated'), 'No publicar fixture como real')
    files = manifest['data']['files']
    require(isinstance(files, dict), 'Inventario de archivos requerido')
    allowed = {f'data/{name}' for name in FILES} | {'data/communications.json', 'data/quality.json', 'index.html'}
    if comm['data'].get('credits_markdown'):
        allowed.add('creditos.html')
    if editorial_path.exists():
        allowed.add('data/editorial.json')
    allowed.update(f'data/{name}' for name in sources_in(docs))
    for message in comm['data']['messages']:
        allowed.add(message['print_sheet']['path'].lstrip('/'))
        if message['audio'].get('path'):
            allowed.add(message['audio']['path'].lstrip('/'))
    bulletin = comm['data']['regional_bulletin']
    if bulletin.get('audio_path'):
        allowed.add(bulletin['audio_path'].lstrip('/'))
    for item in [*comm['data']['messages'], bulletin]:
        allowed.update(entry['path'].lstrip('/') for entry in item.get('translations', []))
    for name in files:
        safe_path(root, name)
    require(set(files) == allowed, 'Inventario contiene archivos inesperados o faltantes')
    require(files == inventory(root), 'Hashes, tamaños o archivos del paquete no coinciden')
    if production:
        production_gate(docs, comm)
    return manifest


def build(input_dir, output, *, editorial=None, audio_assets=None, production=False):
    from .analysis import analyze_inputs
    from .audio import attach_audio
    from .print_sheet import render_index
    docs = load_inputs(input_dir)
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = staging_directory(output.parent, '.raiz-stage-')
    try:
        for name, doc in docs.items():
            write_json(stage/'data'/name, doc)
        for original in sources_in(docs):
            source, destination = safe_path(input_dir, original), safe_path(stage/'data', original)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        if editorial is not None:
            write_json(stage/'data/editorial.json', editorial)
        comm = attach_audio(make_communications(docs, editorial), audio_assets, stage, production=production)
        write_json(stage/'data/communications.json', comm)
        write_json(stage/'data/quality.json', analyze_inputs(docs))
        for message in comm['data']['messages']:
            path = safe_path(stage, message['print_sheet']['path'].lstrip('/'))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(render_sheet(message), encoding='utf-8', newline='\n')
        (stage/'index.html').write_text(render_index(comm), encoding='utf-8', newline='\n')
        if comm['data'].get('credits_markdown'):
            from .print_sheet import render_credits
            (stage/'creditos.html').write_text(render_credits(comm), encoding='utf-8', newline='\n')
        manifest = {key:copy.deepcopy(value) for key,value in docs['results.json'].items() if key!='data'}
        manifest['data'] = {'status':'fixture_only' if comm['mode']=='fixture' else 'precalculated', 'adapter_version':'dev2-1.0', 'files':inventory(stage), 'method':'Publicación de resultados precalculados; no calcula ciencia ni consulta proveedores', 'hash_policy':'SHA256 de archivos salvo manifest.json; current.json guarda hash externo del manifiesto'}
        write_json(stage/'data/manifest.json', manifest)
        validate_package(stage, production=production)
        if output.exists():
            validate_package(output)
            require((output/'data/manifest.json').read_bytes() == (stage/'data/manifest.json').read_bytes(), 'Release existente diferente; usar nuevo build_id/ruta')
        else:
            stage.rename(output)
        return manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def activate(site_root, build_id, *, production=False):
    site_root = Path(site_root).resolve()
    target = safe_path(site_root/'releases', build_id)
    manifest = validate_package(target, production=production)
    require(manifest['build_id'] == build_id, 'Build de release no coincide')
    temporary = site_root/('.current-'+uuid4().hex)
    try:
        write_json(temporary, {'build_id':build_id, 'mode':manifest['mode'], 'base_path':f'/releases/{build_id}/', 'manifest_sha256':digest(target/'data/manifest.json')['sha256']})
        os.replace(temporary, site_root/'current.json')
    finally:
        temporary.unlink(missing_ok=True)
    return target


def publish(package, site_root, *, production=False):
    package,site_root = Path(package).resolve(),Path(site_root).resolve()
    manifest = validate_package(package, production=production)
    build_id = manifest['build_id']
    releases = site_root/'releases'
    releases.mkdir(parents=True, exist_ok=True)
    target = safe_path(releases, build_id)
    if target.exists():
        validate_package(target)
        require((target/'data/manifest.json').read_bytes() == (package/'data/manifest.json').read_bytes(), 'build_id ya publicado con otro contenido')
    else:
        stage = staging_directory(releases, '.publish-')
        try:
            shutil.copytree(package, stage, dirs_exist_ok=True)
            validate_package(stage, production=production)
            stage.rename(target)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    return activate(site_root, build_id, production=production)
