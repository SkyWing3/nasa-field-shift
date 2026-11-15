"""Ficha y catálogo estáticos imprimibles, con audio voluntario y texto equivalente."""
import json
from html import escape
from pathlib import PurePosixPath
from .communications import LABELS


def esc(value):
    return escape(str(value), quote=True)


def display(value):
    if value is None:
        return 'No disponible'
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


STYLE = '''body{font:17px/1.6 system-ui;margin:0;background:#f3f3ed;color:#193b30}main{max-width:68rem;margin:auto;padding:2rem}h1,h2,h3{line-height:1.2}a{color:#176247}a:focus-visible,button:focus-visible,audio:focus-visible{outline:3px solid #a55232;outline-offset:4px}.banner,article{padding:1rem;background:#fffef9;border:1px solid #c7cfc5;border-radius:.6rem;margin:1rem 0}.banner{border-left:5px solid #a55232}table{width:100%;border-collapse:collapse}th,td{padding:.55rem;text-align:left;border-bottom:1px solid #c7cfc5;vertical-align:top}.table-wrap{overflow-x:auto}dt{font-weight:bold}dd{margin:0 0 .8rem}audio{display:block;max-width:100%;margin:.8rem 0}small{display:block}.selected{font-weight:bold;background:#e4ecdf}button{font:inherit;padding:.5rem 1rem}.translation{border-left:5px solid #a55232;padding-left:.8rem;margin:1rem 0}@media print{body{background:white}main{padding:0}.no-print,audio{display:none}article{break-inside:avoid}a{color:inherit;text-decoration:none}}'''

# Se comprueba al abrir el archivo y durante la visita, incluso en HTML estático.
EDITORIAL_SCRIPT = '''<script>
function checkEditorial(){document.querySelectorAll('[data-editorial]').forEach(function(box){var issued=box.dataset.issued,until=box.dataset.until,now=Date.now();var state=!issued||!until?'not_issued':now<Date.parse(issued)?'not_yet_valid':now>=Date.parse(until)?'expired':'current';var note=box.querySelector('[data-editorial-status]');if(note)note.textContent='Estado editorial: '+({not_issued:'borrador no emitido',not_yet_valid:'aún no vigente',expired:'vencido; no reproducir',current:'vigente'})[state];if(state==='expired'||state==='not_yet_valid'){box.querySelectorAll('audio').forEach(function(a){a.pause();a.removeAttribute('src');a.load();a.hidden=true;});box.querySelectorAll('[data-audio-download]').forEach(function(a){a.removeAttribute('href');a.hidden=true;});}})}checkEditorial();setInterval(checkEditorial,30000);
</script>'''


def _kpis(group):
    if not group:
        return '<p>No disponibles; no se calculan indicadores en esta ficha.</p>'
    rows = []
    for name, metric in group.items():
        metric = metric if isinstance(metric, dict) else {'value': metric}
        rows.append('<tr><th scope="row">'+esc(LABELS.get(name, name.replace('_', ' ')))+'</th><td>'+esc(display(metric.get('value')))+'</td><td>'+esc(metric.get('unit', 'No disponible'))+'</td><td>'+esc(display(metric.get('method')))+'</td><td>'+esc(display(metric.get('missing_reason')))+'</td></tr>')
    return '<div class="table-wrap"><table><thead><tr><th>Indicador</th><th>Valor</th><th>Unidad</th><th>Método</th><th>Faltante</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></div>'


def _public_audio_path(path):
    if not isinstance(path, str):
        return False
    pure = PurePosixPath(path)
    return path.startswith('/audio/') and '..' not in pure.parts and not any(char in path for char in '\\:?#%')


def _voice_credit(audio):
    voice, license_info = audio.get('voice') or {}, audio.get('license') or {}
    if not voice.get('name'):
        return ''
    licence = license_info.get('spdx') or license_info.get('url') or 'sin registrar'
    return '<small>Voz sintética: '+esc(voice['name'])+' ('+esc(voice.get('provider', ''))+'). Licencia: '+esc(licence)+'.</small>'


def _audio(item, prefix='..'):
    audio = item.get('audio') or {}
    path = audio.get('path') or item.get('audio_path')
    allowed = audio.get('status') in ('available', 'available_fixture') and isinstance(path, str)
    if audio.get('status') == 'available' and item.get('review_status') != 'approved':
        allowed = False
    for field in ('build_id', 'result_id', 'case_id'):
        if field in audio and audio[field] != item.get(field):
            allowed = False
    if allowed:
        allowed = _public_audio_path(path)
    if not allowed:
        if audio.get('status') in ('available', 'available_draft'):
            return '<p>Audio preparado, con reproducción pendiente de coincidencia de IDs, licencia y revisión editorial/de escucha.</p>'
        return '<p>Audio de este resultado: no disponible. '+esc(audio.get('reason', 'No hay MP3 coincidente para esta selección.'))+'</p>'
    href = prefix + path
    demo = '<p><strong>Audio de demostración con fixture; revisión humana pendiente.</strong></p>' if audio.get('status') == 'available_fixture' else ''
    return demo+'<audio controls preload="none" src="'+esc(href)+'" aria-label="Escuchar texto equivalente en español"></audio><a data-audio-download href="'+esc(href)+'" download>Descargar MP3</a><small>Reproducción solo al pulsar. Revisión: '+esc(audio.get('review_status', item.get('review_status', 'pendiente')))+'.</small>'+_voice_credit(audio)


def _translations(item, prefix='..'):
    """Otros idiomas: siempre marcados como experimentales salvo revisión de hablante."""
    blocks = []
    for entry in item.get('translations') or []:
        language = entry.get('language', '')
        method = (entry.get('translation') or {}).get('method')
        origin = 'Traducción automática ('+esc((entry.get('translation') or {}).get('model', 'modelo no declarado'))+')' if method == 'machine' else 'Traducción humana'
        reviewed = entry.get('status') == 'available'
        warning = '<p><strong>'+('Revisada por hablante.' if reviewed else 'EXPERIMENTAL: sin revisión de hablante ni agronómica. No usar como mensaje oficial.')+'</strong> '+origin+'. El texto en español es la referencia.</p>'
        player = ''
        if entry.get('status') in ('available', 'available_experimental', 'available_fixture') and _public_audio_path(entry.get('path')):
            href = prefix + entry['path']
            player = '<audio controls preload="none" src="'+esc(href)+'" aria-label="Escuchar versión en '+esc(entry.get('language_name', language))+'"></audio><a data-audio-download href="'+esc(href)+'" download>Descargar MP3 ('+esc(language)+')</a>'+_voice_credit(entry)
        blocks.append('<div class="translation"><h3>'+esc(entry.get('language_name', language))+'</h3>'+warning+'<p lang="'+esc(language)+'">'+esc(entry.get('text', ''))+'</p>'+player+'</div>')
    return '<h2>Otros idiomas</h2>'+''.join(blocks) if blocks else ''


def _editorial_attrs(item):
    return ' data-editorial data-issued="'+esc(item.get('issued_at') or '')+'" data-until="'+esc(item.get('valid_until') or '')+'"'


def _facts(message):
    sheet = message['print_sheet']
    rows = [
        ('Build', message['build_id']), ('Resultado', message['result_id']),
        ('Secuencia / caso / posición', f"{message['rotation_id']} / {display(message.get('case_id'))} / {display(message.get('position_id'))}"),
        ('Cultivo de decisión', message.get('decision_crop')),
        ('Periodo', sheet.get('period') or message.get('period_id')),
        ('ENSO de decisión', message.get('enso_initial_phase')),
        ('Ventanas válidas', sheet['n_windows']), ('Campañas únicas', sheet.get('n_unique_campaigns')),
        ('Suelo', sheet.get('soil')), ('Presupuesto de agua', sheet.get('water_budget')),
        ('Calendario', sheet.get('calendar')), ('Inicialización', sheet.get('initialization')),
        ('Residuos', sheet.get('residues')), ('Reglas y restricciones', sheet.get('rules')), ('Sensibilidad', sheet.get('sensitivity_status')),
        ('Fecha de datos', message.get('data_as_of')), ('Emisión editorial', message.get('issued_at')),
        ('Válido hasta (editorial)', message.get('valid_until')), ('Revisión humana', message.get('review_status')),
    ]
    return '<dl>'+''.join('<dt>'+esc(k)+'</dt><dd>'+esc(display(v))+'</dd>' for k,v in rows)+'</dl>'


def render_sheet(message):
    sheet = message['print_sheet']
    fixture = message.get('mode') == 'fixture' or message['status'] == 'draft_fixture'
    title = 'FIXTURE · Sin resultados agrícolas reales' if fixture else 'Evaluación histórica simulada · No es pronóstico'
    alternatives = ''.join('<li>'+esc(' / '.join(item['campaigns']))+(' (seleccionada)' if item['rotation_id'] == message['rotation_id'] else '')+'</li>' for item in sheet['alternatives'])
    cases = ''.join('<tr'+(' class="selected"' if case['case_id'] == message.get('case_id') else '')+'><th scope="row">'+esc(case['case_id'])+'</th><td>'+esc(' → '.join(case['campaigns']))+'</td><td>'+esc(case['decision_crop'])+'</td></tr>' for case in sheet.get('cases', []))
    cases_table = '<h2>Nueve casos: tres posiciones por secuencia</h2><div class="table-wrap"><table><thead><tr><th>Caso</th><th>Ciclo completo</th><th>Cultivo de decisión</th></tr></thead><tbody>'+cases+'</tbody></table></div>' if cases else ''
    sources = '<ul>'+''.join('<li>'+esc(display(item))+'</li>' for item in sheet['sources'])+'</ul>' if sheet['sources'] else '<p>Fuentes científicas cargadas: ninguna.</p>'
    limits = '<ul>'+''.join('<li>'+esc(display(item))+'</li>' for item in sheet.get('limitations', [])+sheet.get('assumptions', []))+'</ul>'
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Raíz · ficha '+esc(message['result_id'])+'</title><style>'+STYLE+'</style></head><body><main><h1>Raíz · Oruro</h1><p class="banner"><strong>'+title+'</strong></p><p class="no-print"><a href="../index.html">Volver al catálogo</a> · Imprimir desde el navegador (Ctrl+P).</p><section'+_editorial_attrs(message)+'><h2>Mensaje equivalente</h2><p>'+esc(message['text'])+'</p><p data-editorial-status>Vigencia editorial: consultar fechas; no es horizonte meteorológico.</p>'+_audio(message)+_translations(message)+'<h2>Selección y evidencia</h2>'+_facts(message)+'<h2>Tres secuencias candidatas</h2><ol>'+alternatives+'</ol>'+cases_table+'<h2>KPI de campaña de decisión</h2>'+_kpis(sheet.get('decision_kpis'))+'<h2>KPI del ciclo completo</h2>'+_kpis(sheet.get('cycle_kpis'))+'<p>'+esc(sheet.get('missing_reason') or 'No se informa un motivo general de falta de datos.')+'</p><h2>Fuentes, supuestos y límites</h2>'+sources+limits+'<p>Boletín regional general separado; sin emisión comprobada. Ninguna ficha recomienda por sí sola una siembra.</p></section></main>'+EDITORIAL_SCRIPT+'</body></html>'


def render_index(communications):
    data = communications['data']
    fixture = communications['mode'] == 'fixture'
    cards = []
    for message in data['messages']:
        card = '<article id="'+esc(message['result_id'])+'"'+_editorial_attrs(message)+'><h2>'+esc(message.get('case_id') or message['rotation_id'])+' · '+esc(message.get('decision_crop') or 'cultivo pendiente')+'</h2><p>Resultado: '+esc(message['result_id'])+' · Estado: '+esc(message['status'])+'</p><p>'+esc(message['text'])+'</p><p data-editorial-status>Vigencia editorial: consultar fechas.</p>'+_audio(message, '.')+_translations(message, '.')+'<p><a href=".'+esc(message['print_sheet']['path'])+'">Abrir ficha imprimible de esta selección</a></p></article>'
        cards.append(card)
    bulletin = data['regional_bulletin']
    bulletin_card = '<article'+_editorial_attrs(bulletin)+'><h2>Boletín regional general</h2><p>'+esc(bulletin.get('text') or 'Boletín no disponible.')+'</p><p data-editorial-status>Vigencia editorial: consultar fechas.</p>'+_audio(bulletin, '.')+_translations(bulletin, '.')+'<p>Distribución: '+esc(bulletin['distribution_status'])+'; sin emisión comprobada. Duración medida: '+esc(display(bulletin.get('duration_seconds')))+' segundos.</p></article>'
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Raíz · resultados publicados</title><style>'+STYLE+'</style></head><body><main><h1>Raíz · paquete publicado</h1><p class="banner"><strong>'+('DEMOSTRACIÓN CON FIXTURE. Sin datos NASA/NOAA reales.' if fixture else 'Evaluación histórica simulada. Revisar evidencia y vigencia editorial.')+'</strong></p><p>Build: '+esc(communications['build_id'])+'. Tres secuencias, posiciones cíclicas y mensajes de la misma versión. Esta vista sirve para revisar la entrega Dev 2.</p><p><a href="data/manifest.json">Manifiesto de integridad</a> · <a href="data/communications.json">Textos y catálogo JSON</a></p>'+''.join(cards)+bulletin_card+'</main>'+EDITORIAL_SCRIPT+'</body></html>'
