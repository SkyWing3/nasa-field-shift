"""Mensajes de resultados precalculados y vigencia editorial, sin inferir ciencia."""
from copy import deepcopy
from datetime import datetime, timezone
from .contracts import CONTEXT, ContractError, timestamp

LABELS = {
    'net_irrigation_requirement_mm': 'riego neto requerido',
    'net_irrigation_applied_mm': 'riego neto aplicado',
    'water_stress_days': 'días de estrés hídrico',
    'planned_coverage_pct': 'cobertura planificada',
    'bare_rain_exposure_days': 'suelo descubierto coincidente con lluvia',
    'bare_wind_exposure_days': 'suelo descubierto coincidente con viento',
    'thermal_exposure_days': 'exposición térmica',
    'constraint_pass_frequency': 'frecuencia histórica de cumplimiento',
}


def editorial_state(item, now=None):
    """Calcula estado a la hora de consulta; no renueva una vigencia vencida."""
    issued, until = item.get('issued_at'), item.get('valid_until')
    if issued is None or until is None:
        return 'not_issued'
    start, end = timestamp(issued), timestamp(until)
    if end <= start:
        raise ContractError('valid_until debe ser posterior a issued_at')
    now = now or datetime.now(timezone.utc)
    if isinstance(now, str):
        now = timestamp(now)
    if now.tzinfo is None:
        raise ContractError('La hora editorial debe incluir zona horaria')
    return 'not_yet_valid' if now < start else 'expired' if now >= end else 'current'


def _editorial(config):
    config = deepcopy(config or {})
    issued, until = config.get('issued_at'), config.get('valid_until')
    if (issued is None) != (until is None):
        raise ContractError('issued_at y valid_until deben entregarse juntos')
    if issued is not None and timestamp(until) <= timestamp(issued):
        raise ContractError('valid_until debe ser posterior a issued_at')
    approved = config.get('review_status') == 'approved'
    if approved:
        if not all(config.get(k) for k in ('reviewer', 'reviewed_at')):
            raise ContractError('Una revisión aprobada requiere reviewer y reviewed_at')
        timestamp(config['reviewed_at'])
    elif config.get('review_status') not in (None, 'pending_p5_p6'):
        raise ContractError('review_status debe ser approved o pending_p5_p6')
    return {
        'issued_at': issued, 'valid_until': until,
        'editorial_status': 'issued' if issued is not None else 'not_issued',
        'review_status': 'approved' if approved else 'pending_p5_p6',
        'reviewer': config.get('reviewer') if approved else None,
        'reviewed_at': config.get('reviewed_at') if approved else None,
        'review_evidence': config.get('review_evidence') if approved else None,
    }


def _lookup(items, key, value):
    return next((deepcopy(item) for item in items if item.get(key) == value), None)


def _spoken_editorial(dates):
    if dates['issued_at'] is None:
        return ' Sin emisión editorial ni vigencia asignada.'
    def short(value):
        instant = timestamp(value)
        return instant.strftime('%d/%m/%Y a las %H:%M %z')
    return f" Emisión editorial: {short(dates['issued_at'])}. Válido hasta {short(dates['valid_until'])}."


UNITS_ES = {'days': 'días', 'mm': 'mm', '%': '%'}


def _num(value):
    """Número legible en español: entero si lo es, si no un decimal con coma."""
    if isinstance(value, float) and abs(value - round(value)) > 1e-9:
        return f'{value:.1f}'.replace('.', ',')
    return str(int(round(value)))


def _metric_text(metric):
    if metric.get('unit') == 'fraction':
        if type(metric.get('numerator')) is int and type(metric.get('denominator')) is int:
            return f"{metric['numerator']} de {metric['denominator']} años"
        return f"{_num(100 * metric['value'])} % de los años"
    return f"{_num(metric['value'])} {UNITS_ES.get(metric.get('unit', ''), metric.get('unit', ''))}".rstrip()


def _kpi_text(group):
    if not group:
        return 'sin KPI disponibles'
    parts = []
    for name, metric in group.items():
        label = LABELS.get(name, name.replace('_', ' '))
        if not isinstance(metric, dict) or metric.get('value') is None:
            reason = metric.get('missing_reason', 'dato ausente') if isinstance(metric, dict) else 'dato ausente'
            parts.append(f'{label}: no disponible ({reason})')
        else:
            parts.append(f'{label}: {_metric_text(metric)}')
    return '; '.join(parts)


DECISION_KEYS = ('water_stress_days', 'net_irrigation_requirement_mm', 'bare_rain_exposure_days', 'bare_wind_exposure_days', 'thermal_exposure_days')
CYCLE_KEYS = ('water_stress_days', 'net_irrigation_requirement_mm')


def _key(group, keys):
    """Indicadores clave en orden fijo; si el grupo no trae ninguno, se dicen todos."""
    if not group:
        return group
    picked = {k: group[k] for k in keys if k in group}
    return picked or group


def _summary(record, crop, budget):
    """Resumen en lenguaje claro para productores y radio, con rango y sensibilidad si existen."""
    d = record.get('decision_kpis') or {}
    stress, irr, ok = d.get('water_stress_days') or {}, d.get('net_irrigation_requirement_mm') or {}, d.get('constraint_pass_frequency') or {}
    years = [str(w['campaign_years'][0]) for w in record.get('windows', [])]
    parts = [f"En los años analizados ({', '.join(years)}), con {budget}:"]
    if stress.get('value') is not None:
        rango = f" (entre {_num(stress['min'])} y {_num(stress['max'])})" if 'min' in stress and 'max' in stress else ''
        parts.append(f"la {crop} tuvo en promedio {_num(stress['value'])} días de estrés severo por falta de agua{rango}")
    elif crop == 'descanso':
        parts.append('el terreno en descanso no tiene cultivo que sufra estrés')
    if irr.get('value') is not None and crop != 'descanso':
        parts.append(f"habría necesitado {_num(irr['value'])} mm de riego")
    if type(ok.get('numerator')) is int:
        parts.append(f"y la campaña resultó aceptable en {ok['numerator']} de {ok['denominator']} años")
    text = ' '.join([parts[0], ', '.join(parts[1:])]) + '.'
    alt = ((record.get('sensitivity') or {}).get('decision_kpis_alt') or {}).get('water_stress_days')
    if alt is not None and stress.get('value') is not None:
        text += f" Con la lluvia corregida según SENAMHI serían {_num(alt)} días de estrés."
    return text + ' '


def _message(record, source, catalog):
    fixture = source['mode'] == 'fixture'
    n = record['n_windows']
    case = _lookup(catalog.get('cases', []), 'case_id', record.get('case_id'))
    rotation = _lookup(catalog['rotations'], 'rotation_id', record['rotation_id'])
    campaigns = (case or rotation or {}).get('campaigns', [])
    sequence = ', '.join(campaigns) or record['rotation_id'].replace('-', ', ')
    crop = record.get('decision_crop') or (campaigns[0] if campaigns else 'pendiente')
    heading = f"Oruro. Secuencia candidata: {sequence}. Cultivo de decisión: {crop}."
    if record.get('position_id') is not None:
        heading += f" Posición {record['position_id']}."
    if fixture:
        return (
            'DEMOSTRACIÓN CON FIXTURE. No es un resultado agrícola real. '
            + heading + ' No hay ventanas históricas evaluadas ni presupuesto de agua calculado. '
            'El periodo, ENSO de decisión, suelo y riego están pendientes. '
            'Los KPI de campaña y ciclo no están disponibles; no se puede recomendar ni ordenar alternativas. '
            'Revisar agua, cobertura y calendario con el equipo técnico antes de decidir. Este texto no es un pronóstico.'
        )
    budget = _lookup(catalog.get('water_budgets', []), 'water_budget_id', record.get('water_budget_id'))
    budget_label = (budget or {}).get('label', '').split(':')[0].lower() or (record.get('water_budget_id') or 'presupuesto desconocido')
    # Texto y audio deben ser equivalentes: se dicen los indicadores clave; la tabla completa va en la ficha.
    text = (
        'EVALUACIÓN HISTÓRICA SIMULADA, no observación de parcela ni pronóstico. '
        + heading + (' ' + _summary(record, crop, budget_label) if n > 0 and record.get('decision_kpis') else ' ')
        + f"Escenario: periodo {record.get('period_id') or 'no disponible'}, ENSO de la campaña inicial {record.get('enso_initial_phase') or 'no disponible'}, "
        f"{budget_label}, {n} ventanas históricas. "
        'Campaña de decisión: ' + _kpi_text(_key(record.get('decision_kpis'), DECISION_KEYS)) + '. '
        'Ciclo completo de tres campañas: ' + _kpi_text(_key(record.get('cycle_kpis'), CYCLE_KEYS)) + '. '
    )
    if n < 3:
        text += 'Muestra insuficiente: no se concluye una preferencia ni robustez. '
    text += 'El clima de las campañas posteriores conserva su historia real. Revisar agua, cobertura, suelo y calendario con el equipo técnico antes de decidir.'
    return text


def make_communications(docs, editorial=None):
    """Proyecta resultado a texto/ficha; el módulo audio incorpora archivos después."""
    source = docs['results.json']
    catalog = docs['catalog.json']['data']
    fixture = source['mode'] == 'fixture'
    dates = _editorial(editorial)
    entries = []
    for record in source['data']['records']:
        fields = {key: record.get(key) for key in CONTEXT}
        fields.update({key: record.get(key) for key in ('case_id', 'position_id', 'decision_crop')})
        entries.append({
            'communication_id': f"message-{record['result_id']}",
            'build_id': source['build_id'], 'result_id': record['result_id'],
            **fields, 'rotation_id': record['rotation_id'], 'region': 'Oruro',
            'mode': source['mode'], 'language': 'es',
            'status': 'draft_fixture' if fixture else 'reviewed' if dates['review_status'] == 'approved' else 'draft_pending_review',
            **deepcopy(dates), 'data_as_of': source['data_as_of'],
            'text': _message(record, source, catalog),
            'audio': {'status': 'unavailable', 'path': None, 'reason': 'MP3 y revisión de escucha pendientes'},
            'print_sheet': {
                'path': f"/print/{record['result_id']}.html",
                'alternatives': deepcopy(catalog['rotations']),
                'cases': deepcopy(catalog.get('cases', [])),
                'selected_rotation_id': record['rotation_id'], 'selected_case_id': record.get('case_id'),
                'n_windows': record['n_windows'], 'n_unique_campaigns': record.get('n_unique_campaigns', 0),
                'decision_kpis': deepcopy(record.get('decision_kpis')),
                'cycle_kpis': deepcopy(record.get('cycle_kpis')), 'kpis': deepcopy(record.get('kpis')),
                'missing_reason': record.get('missing_reason'),
                'soil': _lookup(catalog.get('soil_profiles', []), 'soil_profile_id', record.get('soil_profile_id')),
                'water_budget': _lookup(catalog.get('water_budgets', []), 'water_budget_id', record.get('water_budget_id')),
                'period': _lookup(catalog.get('periods', []), 'period_id', record.get('period_id')),
                'calendar': deepcopy(record.get('calendar')),
                'initialization': deepcopy(record.get('initialization')),
                'residues': deepcopy(record.get('residues')),
                'rules': deepcopy(record.get('rules') or catalog.get('rules')),
                'sensitivity_status': record.get('sensitivity_status'),
                'sources': deepcopy(source['sources']),
                'assumptions': deepcopy(source['assumptions']),
                'limitations': deepcopy(source['warnings']),
            },
        })
    legacy = 'cases' not in catalog
    agencies = ', '.join(dict.fromkeys(str(item.get('agency') or item.get('id') or 'fuente documentada') for item in source['sources']))
    bulletin_text = None if legacy else (
        'Demostración de Raíz para la región de Oruro. Este boletín usa un fixture: no contiene resultados agrícolas reales ni datos NASA o NOAA descargados. '
        'Compara tres secuencias de papa, quinua, haba y descanso en nueve posiciones de decisión. '
        'Los indicadores de campaña y ciclo todavía no están calculados. '
        'Antes de decidir, revise agua disponible, cobertura del suelo y calendario con un técnico. '
        'No es un pronóstico. Borrador pendiente de revisión y sin emisión de radio comprobada.'
    ) if fixture else (
        f'Raíz, región de Oruro. Fuentes históricas: {agencies or "consultar ficha"}. '
        'Los escenarios históricos no garantizan el clima futuro. '
        'Consulte los indicadores y muestras de campaña y ciclo por separado. '
        'Revise agua, cobertura y calendario con un técnico antes de decidir. '
        'Boletín preparado, sin emisión de radio comprobada.'
    )
    if bulletin_text is not None:
        bulletin_text += _spoken_editorial(dates)
    output = {key: deepcopy(value) for key, value in source.items() if key != 'data'}
    output['data'] = {'messages': entries, 'regional_bulletin': {
        'communication_id': 'regional-bulletin', 'build_id': source['build_id'],
        'region': 'Oruro', 'language': 'es', 'mode': source['mode'],
        'status': 'unavailable' if legacy else 'draft_fixture' if fixture else 'reviewed' if dates['review_status'] == 'approved' else 'draft_pending_review',
        'text': bulletin_text, 'audio_path': None, 'duration_seconds': None,
        'audio': {'status': 'unavailable', 'path': None, 'reason': 'MP3 regional pendiente'},
        **deepcopy(dates), 'data_as_of': source['data_as_of'],
        'distribution_status': 'prepared_not_broadcast',
        'reason': 'Guion pendiente de revisión P5/P6; audio no difundido',
    }}
    return output
