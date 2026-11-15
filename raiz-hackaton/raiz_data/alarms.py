"""Alarmas para la app: señales preocupantes calculadas con datos reales, para leer y escuchar.

Cada alarma es corta (≤ 2 frases + 1 acción prudente), dice su fuente y su fecha, y viene en
español (texto de referencia) y en quechua y aymara (traducción automática con IA, marcada, con
revisión de hablante pendiente). El audio en español es voz sintética y requiere revisión de pares.
Nada aquí es un pronóstico propio: el pronóstico ENSO es de NOAA y se cita con fecha.
"""
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
from statistics import mean

from . import inputs
from .fetch import DATA, RAW

OUT = DATA / 'alertas_app'
RECENT = RAW / 'nasa-power-daily' / 'power_reciente_alarmas.json'
BOLIVIA = timezone(timedelta(hours=-4))
TRADUCCION = {'metodo': 'Traducción automática con IA (Claude, Anthropic)', 'estado': 'revision_de_hablante_pendiente',
              'nota_es': 'Traducción automática: puede tener errores. El texto en español es la referencia.'}
AUDIO_ESTADO = 'requiere_revision_de_pares'
NOAA = {'fecha': '2026-11-12', 'texto': 'NOAA (12-nov-2026) prevé un Niño de fuerte a muy fuerte hasta enero–marzo de 2027',
        'url': 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml'}

# Plantillas: español (referencia) + quechua y aymara (IA). {x} se rellena con números.
T = {
    'nino_titulo': {'es': 'El Niño fuerte está en curso', 'qu': 'Sinchi Niño kachkanña', 'ay': 'Ch\'amani Niño utjxiwa'},
    'nino_texto': {
        'es': 'El océano Pacífico está {anom} °C más caliente que lo normal. En {k} de {n} Niños fuertes desde 1981, aquí llovió menos de lo normal entre noviembre y marzo.',
        'qu': 'Pacífico qucha {anom} °C aswan q\'uñi kachkan. 1981 watamanta {n} sinchi Niño watakunamanta, {k}pi kaypi pisillata pararqa noviembre killamanta marzo killakama.',
        'ay': 'Pacífico quta {anom} °C juk\'amp junt\'uwa. 1981 maratpacha, {n} ch\'amani Niño maranakatxa, {k}nxa aka chiqanx juk\'a jallupxi noviembre phaxsita marzo phaxsikama.'},
    'nino_accion': {
        'es': 'Planifique el agua de riego y, antes de sembrar, converse con su técnico.',
        'qu': 'Qarpana yakuykita yuyaykuy. Imata tarpunaykita manaraq akllaspa, técnicoykiwan rimariy.',
        'ay': 'Qarpañ umamat amuyt\'asim. Janïr yapuchkasax técnicomp aruskipt\'asim.'},
    'lluvia_titulo': {'es': 'Lluvia del último mes', 'qu': 'Qhipa killapi para', 'ay': 'Qhipa phaxsin jallu'},
    'lluvia_texto': {
        'es': 'En los últimos 30 días llovieron {mm} mm en la zona; lo normal para estas fechas es {norm} mm.',
        'qu': 'Qhipa 30 p\'unchawkunapi {mm} mm paran; kay p\'unchawkunapaq {norm} mm paran sapa kuti.',
        'ay': 'Qhipa 30 urunakanx {mm} mm jallupxi; aka urunakatakix {norm} mm jallupxi sapa kuti.'},
    'lluvia_mas': {
        'es': 'Una racha húmeda no cambia el riesgo de toda la temporada.',
        'qu': 'Huk chhika parayqa manam tukuy pachapi riesgota tikranchu.',
        'ay': 'Mä qawqha jallunakax janiw taqpach pachan riesgop mayjt\'aykiti.'},
    'lluvia_menos': {
        'es': 'Está lloviendo menos de lo normal: cuide el agua de su pozo.',
        'qu': 'Pisillata parachkan: pozoykipi yakuta waqaychay.',
        'ay': 'Juk\'a jallunakaw jallupchi: pozoman umam jark\'aqasim.'},
    'lluvia_igual': {'es': 'La lluvia está cerca de lo normal.', 'qu': 'Parayqa sapa kuti hinam kachkan.', 'ay': 'Jalluxa sapa kuti ukhamaw.'},
    'helada_titulo': {'es': 'Noches con helada', 'qu': 'Qasa tutakuna', 'ay': 'Juyphi arumanaka'},
    'helada_texto': {
        'es': 'En los últimos 7 días hubo {n} noches con helada en la zona (mínima {tmin} °C).',
        'qu': 'Qhipa 7 p\'unchawkunapi {n} tutakuna qasarqa (aswan chiri {tmin} °C).',
        'ay': 'Qhipa 7 urunakanx {n} arumaw juyphintäna (juk\'amp thaya {tmin} °C).'},
    'helada_accion': {
        'es': 'Si tiene cultivos en flor, protéjalos al anochecer.',
        'qu': 'T\'ikachkaq chakraykita ch\'isiyaqtin amachay.',
        'ay': 'Panqarir yapumxa jayp\'ux jark\'aqasim.'},
    'fuego_titulo': {'es': 'Focos de calor cerca', 'qu': 'Nina rupay qayllapi', 'ay': 'Nina junt\'u jak\'ana'},
}


# Más idiomas (traducción automática con IA, revisión de hablantes pendiente).
LANGS = ('es', 'qu', 'ay', 'gn', 'en', 'pt', 'fr')
LANG_NAMES = {'es': 'Español', 'qu': 'Quechua', 'ay': 'Aymara', 'gn': 'Guaraní', 'en': 'English', 'pt': 'Português', 'fr': 'Français'}
T_MAS = {'nino_titulo': {'gn': 'El Niño mbarete oikóma',
                 'en': 'A strong El Niño is under way',
                 'pt': 'Um El Niño forte está em curso',
                 'fr': 'Un El Niño fort est en cours'},
 'nino_texto': {'gn': "Pacífico para haku {anom} °C jepivegua ári. 1981 guive, {n} El Niño mbarete apytépe, {k}-pe ko'ápe oky sa'ive jepivegua "
                      'noviembre guive marzo peve.',
                'en': 'The Pacific Ocean is {anom} °C warmer than normal. In {k} of {n} strong El Niños since 1981, it rained less than normal here '
                      'between November and March.',
                'pt': 'O oceano Pacífico está {anom} °C mais quente que o normal. Em {k} de {n} El Niños fortes desde 1981, choveu menos que o '
                      'normal aqui entre novembro e março.',
                'fr': "L'océan Pacifique est {anom} °C plus chaud que la normale. Pour {k} des {n} El Niño forts depuis 1981, il a plu moins que la "
                      'normale ici entre novembre et mars.'},
 'nino_accion': {'gn': "Eñembosako'i y ñemboyrã ha, eñemitỹ mboyve, eñe'ẽ ne técnico ndive.",
                 'en': 'Plan your irrigation water and talk with your technician before planting.',
                 'pt': 'Planeje a água de irrigação e, antes de plantar, converse com seu técnico.',
                 'fr': "Prévoyez l'eau d'irrigation et parlez avec votre technicien avant de semer."},
 'lluvia_titulo': {'gn': "Ama ko jasy ohasa va'ekuépe", 'en': 'Rain in the last month', 'pt': 'Chuva do último mês', 'fr': 'Pluie du dernier mois'},
 'lluvia_texto': {'gn': "Ko 30 ára ohasa va'ekuépe oky {mm} mm ko tetã'ỹime; jepivegua ko ára rupi ha'e {norm} mm.",
                  'en': 'In the last 30 days {mm} mm of rain fell in the area; normal for these dates is {norm} mm.',
                  'pt': 'Nos últimos 30 dias choveram {mm} mm na região; o normal para estas datas é {norm} mm.',
                  'fr': 'Au cours des 30 derniers jours, il est tombé {mm} mm dans la zone ; la normale pour ces dates est de {norm} mm.'},
 'lluvia_mas': {'gn': 'Peteĩ ára ama hetáva nomoambuéi opa ary riesgo.',
                'en': 'A wet spell does not change the risk for the whole season.',
                'pt': 'Uma sequência úmida não muda o risco de toda a temporada.',
                'fr': 'Une période humide ne change pas le risque de toute la saison.'},
 'lluvia_menos': {'gn': "Oky sa'ive jepivegua: eñangareko ne ykua y rehe.",
                  'en': 'It is raining less than normal: look after the water in your well.',
                  'pt': 'Está chovendo menos que o normal: cuide da água do seu poço.',
                  'fr': "Il pleut moins que la normale : ménagez l'eau de votre puits."},
 'lluvia_igual': {'gn': 'Ama oĩ jepivegua ykére.',
                  'en': 'Rain is close to normal.',
                  'pt': 'A chuva está perto do normal.',
                  'fr': 'La pluie est proche de la normale.'},
 'helada_titulo': {'gn': "Pyhare ro'ýva", 'en': 'Frost nights', 'pt': 'Noites com geada', 'fr': 'Nuits de gel'},
 'helada_texto': {'gn': "Ko 7 ára ohasa va'ekuépe oĩ {n} pyhare ro'ýva ko tetã'ỹime (sa'ive {tmin} °C).",
                  'en': 'In the last 7 days there were {n} frost nights in the area (minimum {tmin} °C).',
                  'pt': 'Nos últimos 7 dias houve {n} noites com geada na região (mínima {tmin} °C).',
                  'fr': 'Au cours des 7 derniers jours, il y a eu {n} nuits de gel dans la zone (minimum {tmin} °C).'},
 'helada_accion': {'gn': "Ereko ramo ñemitỹ yvoty reheve, eñangareko ka'aru pytũ jave.",
                   'en': 'If you have crops in flower, protect them at nightfall.',
                   'pt': 'Se tiver cultivos em flor, proteja-os ao anoitecer.',
                   'fr': 'Si vous avez des cultures en fleur, protégez-les à la tombée de la nuit.'},
 'fuego_titulo': {'gn': 'Tata hakúva ag̃uíme', 'en': 'Heat spots nearby', 'pt': 'Focos de calor próximos', 'fr': 'Foyers de chaleur à proximité'}}
for _key, _values in T_MAS.items():
    T[_key].update(_values)


def _fill(key, lang, **values):
    text = T[key][lang]
    for name, value in values.items():
        text = text.replace('{' + name + '}', str(value).replace('.', ',') if isinstance(value, float) and lang != 'en' else str(value))
    return text


def _texts(parts):
    """parts = [(clave, valores)] → {'es': ..., 'qu': ..., 'ay': ...} uniendo frases."""
    return {lang: ' '.join(_fill(k, lang, **v) for k, v in parts) for lang in LANGS}


def _power_recent():
    path = RECENT if RECENT.exists() else inputs.POWER_FILE
    raw = json.loads(path.read_text(encoding='utf-8'))
    params = raw['properties']['parameter']
    climate = {}
    for key in params['T2M']:
        d = date(int(key[:4]), int(key[4:6]), int(key[6:]))
        values = {n: (None if v[key] == -999.0 else v[key]) for n, v in params.items()}
        if values.get('PRECTOTCORR') is not None and values.get('T2M_MIN') is not None:
            climate[d] = values
    return climate, path.name


def compute(now=None):
    now = now or datetime.now(BOLIVIA)
    climate, power_file = _power_recent()
    last = max(climate)
    oni = inputs.oni()
    season, year = list(oni)[-1]
    anom = oni[(season, year)]
    verification = json.loads((DATA / 'verificacion' / 'verificacion.json').read_text(encoding='utf-8'))
    claim = verification.get('nino_fuerte_4de5', {})
    alarms = []
    base = {'emitida': now.isoformat(timespec='seconds'), 'vigente_hasta': (now + timedelta(days=7)).isoformat(timespec='seconds'),
            'zona': 'Obrajes y alrededores, Oruro (celda regional de ~50 km)', 'traduccion': TRADUCCION}
    if anom >= 1.5 and claim.get('nino_fuerte'):
        n = len(claim['nino_fuerte'])
        k = sum(1 for r in claim['nino_fuerte'] if r['bajo_normal'])
        alarms.append({**base, 'id': 'enso-nino-fuerte', 'nivel': 'atencion', 'icono': 'ola',
                       'titulo': {l: T['nino_titulo'][l] for l in LANGS},
                       'texto': _texts([('nino_texto', {'anom': round(anom, 1), 'k': k, 'n': n})]),
                       'accion': {l: T['nino_accion'][l] for l in LANGS},
                       'fuente': f'NOAA ONI ({season} {year} = {anom:+.2f}) y NASA POWER 1981–2025 (n = {n}, frecuencia histórica). {NOAA["texto"]}.',
                       'datos_hasta': f'{season} {year}', 'url': NOAA['url']})
    total = lambda d0, d1: sum(climate[d]['PRECTOTCORR'] for d in climate if d0 <= d <= d1)
    d0 = last - timedelta(days=29)
    rain = total(d0, last)
    normal = mean(total(d0.replace(year=y), last.replace(year=y)) for y in range(1991, 2021))
    ratio = rain / normal if normal else 1.0
    qualifier = 'lluvia_mas' if ratio > 1.5 else 'lluvia_menos' if ratio < 0.6 else 'lluvia_igual'
    alarms.append({**base, 'id': 'lluvia-30-dias', 'nivel': 'atencion' if qualifier == 'lluvia_menos' else 'informacion', 'icono': 'gota',
                   'titulo': {l: T['lluvia_titulo'][l] for l in LANGS},
                   'texto': _texts([('lluvia_texto', {'mm': round(rain), 'norm': round(normal)}), (qualifier, {})]),
                   'accion': None,
                   'fuente': f'NASA POWER (PRECTOTCORR), {d0.isoformat()} a {last.isoformat()}; normal 1991–2020 de las mismas fechas',
                   'datos_hasta': last.isoformat(), 'valores': {'lluvia_mm': round(rain, 1), 'normal_mm': round(normal, 1), 'razon': round(ratio, 2)}})
    week = [d for d in climate if last - timedelta(days=6) <= d <= last]
    frosts = [d for d in week if climate[d]['T2M_MIN'] <= 0]
    if frosts:
        tmin = min(climate[d]['T2M_MIN'] for d in frosts)
        alarms.append({**base, 'id': 'heladas-7-dias', 'nivel': 'alerta' if tmin <= -2.5 else 'atencion', 'icono': 'helada',
                       'titulo': {l: T['helada_titulo'][l] for l in LANGS},
                       'texto': _texts([('helada_texto', {'n': len(frosts), 'tmin': round(tmin, 1)})]),
                       'accion': {l: T['helada_accion'][l] for l in LANGS},
                       'fuente': 'NASA POWER (T2M_MIN, aire a 2 m en celda de ~50 km: puede subestimar heladas locales)', 'datos_hasta': last.isoformat()})
    for path in sorted((DATA / 'alertas').glob('*.json')) if (DATA / 'alertas').exists() else []:
        item = json.loads(path.read_text(encoding='utf-8'))
        if item.get('estado') == 'aprobada' and item.get('tipo') == 'incendio':
            alarms.append({**base, 'id': item['alert_id'], 'nivel': item['nivel'] if item['nivel'] != 'precaucion' else 'atencion', 'icono': 'fuego',
                           'titulo': {l: T['fuego_titulo'][l] for l in LANGS},
                           'texto': {l: (item['texto'] if l == 'es' else None) for l in LANGS}, 'accion': None,
                           'fuente': f"{item['fuente']}; aprobada por {item['aprobada_por']}", 'datos_hasta': item['fecha_evento']})
    order = {'alerta': 0, 'atencion': 1, 'informacion': 2}
    alarms.sort(key=lambda a: order[a['nivel']])
    return {'schema': 'raiz-alertas-app-v1', 'generado': now.isoformat(timespec='seconds'), 'zona': base['zona'],
            'fuente_clima': power_file, 'idiomas': LANG_NAMES,
            'aviso_traduccion': TRADUCCION, 'aviso_audio': 'Voz sintética (Meta MMS, CC BY-NC 4.0). Requiere revisión de pares antes de difundir.',
            'no_es_pronostico': 'Raíz no pronostica: muestra señales de los datos y cita el pronóstico de NOAA con fecha.', 'alertas': alarms}


def build(audio=False):
    from .bulletins import audio as make_audio
    data = compute()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'audio').mkdir(exist_ok=True)
    for alarm in data['alertas']:
        alarm['audio'] = {'es': None, 'estado': AUDIO_ESTADO}
        spoken = ' '.join(x for x in (alarm['titulo']['es'] + '.', alarm['texto']['es'], (alarm['accion'] or {}).get('es')) if x)
        txt = OUT / 'audio' / f"{alarm['id']}.es.txt"
        mp3 = OUT / 'audio' / f"{alarm['id']}.es.mp3"
        # Sin --audio se reutiliza el MP3 existente solo si dice exactamente el mismo texto.
        same_text = txt.exists() and mp3.exists() and txt.read_text(encoding='utf-8') == spoken
        if audio and not same_text:
            txt.write_text(spoken, encoding='utf-8')
            make_audio(txt, mp3)
        if same_text or audio:
            alarm['audio']['es'] = f"audio/{alarm['id']}.es.mp3"
    (OUT / 'alertas.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return data


def publish(targets):
    """Copia alertas.json y sus MP3 a la carpeta pública de cada frontend (y al sitio estático)."""
    copied = []
    for target in targets:
        dest = Path(target) / 'alertas'
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        shutil.copyfile(OUT / 'alertas.json', dest / 'alertas.json')
        if (OUT / 'audio').exists():
            (dest / 'audio').mkdir()
            for mp3 in (OUT / 'audio').glob('*.mp3'):
                shutil.copyfile(mp3, dest / 'audio' / mp3.name)
        copied.append(str(dest))
    return copied
