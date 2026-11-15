"""Contrato v3.1 de entradas precalculadas: estructura e integridad, no ciencia."""
import hashlib
import json
import math
import re
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qsl, urlsplit

FILES = ('catalog.json', 'climate.json', 'results.json')
CONTEXT = ('analysis_point_id', 'period_id', 'enso_initial_phase', 'water_budget_id', 'soil_profile_id')
ROTATIONS = {'papa-quinua-descanso': ['papa', 'quinua', 'descanso'], 'papa-quinua-haba': ['papa', 'quinua', 'haba'], 'papa-haba-descanso': ['papa', 'haba', 'descanso']}
KPI_UNITS = {'net_irrigation_requirement_mm': 'mm', 'net_irrigation_applied_mm': 'mm', 'water_stress_days': 'days', 'planned_coverage_pct': '%', 'bare_rain_exposure_days': 'days', 'bare_wind_exposure_days': 'days', 'thermal_exposure_days': 'days', 'constraint_pass_frequency': 'fraction'}


class ContractError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ContractError(message)


def identifier(value, label='ID'):
    require(isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}', value), f'{label} inseguro o vacío')
    return value


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f'Clave JSON duplicada: {key}')
            result[key] = value
        return result
    def invalid(value):
        raise ContractError(f'Número JSON no finito: {value}')
    def finite(value):
        parsed = float(value)
        require(math.isfinite(parsed), 'Número JSON no finito')
        return parsed
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique, parse_constant=invalid, parse_float=finite)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ContractError(f'JSON inválido en {Path(path).name}: {error}') from error


def timestamp(value):
    require(isinstance(value, str), 'Fecha ISO 8601 requerida')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ContractError(f'Fecha inválida: {value}') from error
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None, 'La fecha debe incluir zona horaria')
    return parsed


def safe_relative(value):
    require(isinstance(value, str) and bool(value), 'Ruta relativa requerida')
    path = PurePosixPath(value)
    require(not any(char in value for char in '%?#') and not any(ord(char) < 32 or ord(char) == 127 for char in value), 'Ruta relativa con escapes URL o controles no permitida')
    require(not path.is_absolute() and '\\' not in value and ':' not in value and not any(part in ('..', '.') for part in value.split('/')), 'Ruta relativa insegura')
    return value


def source_metadata(source):
    require(isinstance(source, dict), 'Fuente debe ser objeto')
    fields = ('source_id', 'agency', 'product', 'version', 'url', 'queried_at', 'period', 'spatial_resolution', 'temporal_resolution', 'units', 'qa', 'original', 'sha256', 'bytes', 'license')
    require(all(field in source for field in fields), 'Procedencia de fuente incompleta')
    identifier(source['source_id'], 'source_id')
    for key in ('agency', 'product', 'version', 'spatial_resolution', 'temporal_resolution', 'license'):
        require(isinstance(source[key], str) and bool(source[key].strip()), f'Fuente sin {key}')
    parsed = urlsplit(source['url'])
    require(parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password and not parsed.fragment, 'Fuente: URL HTTPS pública estable sin credenciales ni fragmento')
    credential_keys = {'token', 'access_token', 'api_key', 'apikey', 'authorization', 'auth', 'password', 'signature', 'sig', 'key', 'credential'}
    query_keys = [key.lower() for key, _ in parse_qsl(parsed.query, keep_blank_values=True)]
    require(not any(key in credential_keys or key.startswith(('x-amz-', 'x-goog-')) for key in query_keys), 'Fuente: URL con credenciales o firma no permitida')
    timestamp(source['queried_at'])
    period = source['period']
    require(isinstance(period, dict), 'Periodo de fuente inválido')
    require(date.fromisoformat(period['start']) <= date.fromisoformat(period['end']), 'Periodo de fuente invertido')
    require(isinstance(source['units'], dict) and bool(source['units']), 'Fuente sin unidades')
    require(isinstance(source['qa'], (dict, str)) and bool(source['qa']), 'Fuente sin QA')
    safe_relative(source['original'])
    require(isinstance(source['sha256'], str) and re.fullmatch('[0-9a-f]{64}', source['sha256']), 'SHA-256 de fuente inválido')
    require(type(source['bytes']) is int and source['bytes'] > 0, 'Bytes de fuente inválidos')


def envelope(doc, build_id=None):
    require(isinstance(doc, dict), 'Sobre JSON requerido')
    fields = ('schema_version', 'build_id', 'mode', 'generated_at', 'data_as_of', 'model_version', 'sources', 'assumptions', 'warnings', 'data')
    require(all(key in doc for key in fields), 'Sobre común incompleto')
    require(doc['schema_version'] == '3.0', 'schema_version debe ser 3.0')
    identifier(doc['build_id'], 'build_id')
    require(build_id is None or doc['build_id'] == build_id, 'build_id mezclados')
    require(doc['mode'] in ('fixture', 'downloaded', 'simulated'), 'mode inválido')
    for key in ('sources', 'assumptions', 'warnings'):
        require(isinstance(doc[key], list), f'{key} debe ser lista')
    require(all(isinstance(s, str) for key in ('assumptions', 'warnings') for s in doc[key]), 'Advertencias y supuestos deben ser textos')
    require(isinstance(doc['data'], dict), 'data debe ser objeto')
    if doc['mode'] == 'fixture':
        require(doc['sources'] == [], 'Fixture estructural sin fuentes científicas descargadas')
        require(doc['model_version'] is None and doc['data_as_of'] is None, 'Fixture sin cálculo ni fecha de datos reales')
        require(any('fixture' in w.lower() for w in doc['warnings']), 'Advertencia de fixture obligatoria')
        if doc['generated_at'] is not None:
            timestamp(doc['generated_at'])
    else:
        require(timestamp(doc['data_as_of']) <= timestamp(doc['generated_at']), 'Fecha de datos posterior a generación')
        require(bool(doc['sources']), 'Datos no fixture sin fuentes')
        if doc['mode'] == 'simulated':
            require(isinstance(doc['model_version'], str) and bool(doc['model_version']), 'Simulación sin model_version')
        ids = set()
        for source in doc['sources']:
            source_metadata(source)
            require(source['source_id'] not in ids, 'source_id duplicado')
            ids.add(source['source_id'])


def indexed(items, key):
    require(isinstance(items, list), f'{key}: lista requerida')
    result = {}
    for item in items:
        require(isinstance(item, dict), f'{key}: objeto requerido')
        value = identifier(item[key], key)
        require(value not in result, f'{key} duplicado')
        result[value] = item
    return result


def _cases(catalog):
    cases = indexed(catalog['cases'], 'case_id')
    require(len(cases) == 9, 'v3.1 exige nueve casos')
    pairs = set()
    for case in cases.values():
        rotation, position = case['rotation_id'], case['position_id']
        require(rotation in ROTATIONS and type(position) is int and 1 <= position <= 3, 'Secuencia/posición inválida')
        sequence = ROTATIONS[rotation]
        expected = sequence[position-1:] + sequence[:position-1]
        require(case['campaigns'] == expected and case['decision_crop'] == expected[0], 'Caso no corresponde a posición/cultivo de decisión')
        pairs.add((rotation, position))
    require(len(pairs) == 9, 'Casos cíclicos repetidos o ausentes')
    return cases


def _case_reference(record, cases):
    require(record['case_id'] in cases, 'case_id desconocido')
    case = cases[record['case_id']]
    require(all(record[key] == case[key] for key in ('rotation_id', 'position_id', 'decision_crop')), 'Referencias de caso/posición/cultivo no coinciden')


def _fixture(catalog, climate, records):
    point = catalog['analysis_point']
    require(point['latitude'] is None and point['longitude'] is None, 'Fixture inicial sin coordenadas confirmadas')
    require(point['location_status'] == 'unconfirmed' and bool(point['missing_reason']), 'Explicar ubicación pendiente')
    require(catalog['rotations'] == [{'rotation_id': key, 'campaigns': value, 'baseline_status': 'assumed'} for key, value in ROTATIONS.items()], 'Tres secuencias candidatas requeridas')
    require(catalog['water_budgets'] == [], 'Fixture sin presupuestos precalculados')
    require(climate['series'] == [] and bool(climate['missing_reason']), 'Fixture sin serie climática real')
    modern = 'cases' in catalog
    cases = _cases(catalog) if modern else None
    require(len(records) == (9 if modern else 3), 'Fixture: cantidad de registros incorrecta')
    rotations, case_ids = set(), set()
    for record in records:
        require(record['result_id'].startswith('fixture-'), 'ID de resultado fixture inválido')
        require(all(record[key] is None for key in CONTEXT[1:]), 'No inventar escenarios ni presupuestos evaluados')
        require(type(record['n_windows']) is int and record['n_windows'] == 0 and record['windows'] == [], 'No hay ventanas calculadas')
        require(record.get('kpis') is None and record['ranking'] is None and bool(record['missing_reason']), 'KPI/ranking faltantes: null y motivo')
        require(record.get('decision_kpis') is None and record.get('cycle_kpis') is None, 'Fixture sin KPI científicos')
        require(record['sensitivity_status'] == 'not_evaluated', 'Sensibilidad no evaluada')
        rotations.add(record['rotation_id'])
        if modern:
            require(type(record.get('n_unique_campaigns')) is int and record['n_unique_campaigns'] == 0, 'Fixture sin campañas evaluadas')
            _case_reference(record, cases)
            case_ids.add(record['case_id'])
    require(rotations == set(ROTATIONS), 'Falta una alternativa')
    if modern:
        require(case_ids == set(cases), 'Fixture sin los nueve casos')


def _kpis(group, n, sources):
    if group is None:
        return
    require(isinstance(group, dict) and bool(group), 'Grupo KPI inválido')
    for name, metric in group.items():
        require(name in KPI_UNITS, 'KPI fuera del MVP')
        require(isinstance(metric, dict), 'KPI requiere objeto de metadatos')
        require(metric['unit'] == KPI_UNITS[name], f'Unidad de KPI {name} inválida')
        require(metric['nature'] == 'simulated', 'KPI modelado debe marcarse simulated')
        require(isinstance(metric['method'], str) and bool(metric['method']), 'KPI sin método')
        require(isinstance(metric['source_ids'], list) and bool(metric['source_ids']) and set(metric['source_ids']) <= sources, 'Fuente KPI desconocida o ausente')
        value = metric['value']
        if value is None:
            require(bool(metric.get('missing_reason')), 'KPI null sin motivo')
        else:
            require(n > 0 and number(value) and value >= 0, 'KPI inválido o sin ventanas')
            if name == 'planned_coverage_pct':
                require(value <= 100, 'Porcentaje KPI fuera de rango')
            if name == 'constraint_pass_frequency':
                require(value <= 1 and type(metric.get('numerator')) is int and type(metric.get('denominator')) is int, 'Frecuencia requiere numerador/denominador')
                require(metric['denominator'] == n and 0 <= metric['numerator'] <= n and abs(value - metric['numerator']/n) < 1e-9, 'Frecuencia/denominador incoherente')


def _real(catalog, climate, records, docs):
    point = catalog['analysis_point']
    require(number(point['latitude']) and -90 <= point['latitude'] <= 90 and number(point['longitude']) and -180 <= point['longitude'] <= 180, 'Punto real sin coordenadas válidas')
    require(point['location_status'] in ('regional_point', 'validated_plot') and bool(point.get('representativeness')), 'Punto sin representatividad documentada')
    rotations = indexed(catalog['rotations'], 'rotation_id')
    require(set(rotations) == set(ROTATIONS), 'Se requieren tres secuencias v3.1')
    for key, rotation in rotations.items():
        require(rotation['campaigns'] == ROTATIONS[key], 'Secuencia alterada')
        require(rotation['baseline_status'] in ('assumed', 'confirmed'), 'Estado de secuencia inválido')
    cases = _cases(catalog)
    periods = indexed(catalog['periods'], 'period_id')
    budgets = indexed(catalog['water_budgets'], 'water_budget_id')
    soils = indexed(catalog['soil_profiles'], 'soil_profile_id')
    for period in periods.values():
        require(type(period['start_campaign_year']) is int and type(period['end_campaign_year']) is int and period['start_campaign_year'] <= period['end_campaign_year'], 'Periodo de campañas inválido')
    for budget in budgets.values():
        require(number(budget['net_limit_mm']) and budget['net_limit_mm'] >= 0, 'Presupuesto de agua inválido')
    for soil in soils.values():
        require(soil['nature'] in ('measured', 'map_estimate', 'scenario_assumption'), 'Naturaleza de suelo inválida')
    sources = {}
    for doc in docs.values():
        for source in doc['sources']:
            sid = source['source_id']
            require(sid not in sources or sources[sid] == source, 'Procedencia contradictoria para source_id')
            sources[sid] = source
    require(isinstance(climate['series'], list) and bool(climate['series']), 'Clima descargado sin series')
    for series in climate['series']:
        require(series['nature'] == 'downloaded' and series['source_id'] in sources, 'Serie climática sin naturaleza/procedencia')
        require(isinstance(series['unit'], str) and bool(series['unit']) and bool(series['variable']), 'Serie climática sin unidad/variable')
        require(isinstance(series['values'], list) and bool(series['values']), 'Serie climática vacía')
        days = set()
        for item in series['values']:
            day = date.fromisoformat(item['date'])
            require(day not in days, 'Fecha climática duplicada')
            days.add(day)
            require(number(item['value']) if item['value'] is not None else bool(item.get('missing_reason')), 'Valor climático inválido/null sin motivo')
    groups, group_windows, group_rank_rules = {}, {}, {}
    for record in records:
        _case_reference(record, cases)
        require(record['period_id'] in periods and record['water_budget_id'] in budgets and record['soil_profile_id'] in soils, 'Referencia de periodo/presupuesto/suelo desconocida')
        require(record['enso_initial_phase'] in ('Normal', 'Niño', 'Niña', 'Niño fuerte'), 'Escenario ENSO desconocido')
        for key in ('calendar', 'initialization', 'residues'):
            require(bool(record.get(key)), f'Resultado sin {key}')
        windows = record['windows']
        require(isinstance(windows, list) and type(record['n_windows']) is int and record['n_windows'] == len(windows), 'n_windows incoherente')
        window_ids, window_years, campaigns = set(), set(), set()
        period = periods[record['period_id']]
        for window in windows:
            wid = identifier(window['window_id'], 'window_id')
            require(wid not in window_ids, 'Ventana duplicada')
            window_ids.add(wid)
            years = window['campaign_years']
            require(isinstance(years, list) and len(years) == 3 and all(type(y) is int for y in years) and years == list(range(years[0], years[0]+3)), 'Ventana sin tres campañas consecutivas')
            require(tuple(years) not in window_years, 'Campañas de ventana duplicadas con distintos IDs')
            window_years.add(tuple(years))
            require(window['complete'] is True and period['start_campaign_year'] <= years[0] and years[-1] <= period['end_campaign_year'], 'Ventana incompleta o cruza periodos')
            require(1981 <= years[0] <= 2023, 'Ventana fuera del horizonte 1981-2023 de decisiones v3.1')
            campaigns.update(years)
        require(type(record['n_unique_campaigns']) is int and record['n_unique_campaigns'] == len(campaigns), 'n_unique_campaigns incoherente')
        n = len(windows)
        if n == 0:
            require(record['decision_kpis'] is None and record['cycle_kpis'] is None and record.get('ranking') is None and bool(record.get('missing_reason')), 'Sin ventanas: KPI/ranking null y motivo')
        elif n < 3:
            require(record.get('ranking') is None, 'Muestra insuficiente n<3: sin ranking/conclusión')
        if record['decision_kpis'] is None or record['cycle_kpis'] is None:
            require(bool(record.get('missing_reason')), 'Grupo KPI ausente sin motivo')
        if record.get('ranking') is not None:
            require(type(record['ranking']) is int and record['ranking'] > 0, 'Ranking inválido')
            rule = record.get('ranking_method')
            require(isinstance(rule, dict) and all(rule.get(key) for key in ('normalization', 'missing_data_policy', 'tie_rule')), 'Ranking sin reglas reproducibles')
            require(rule.get('metric_scope') in ('decision_kpis', 'cycle_kpis'), 'Ranking mezcla campaña y ciclo')
            weights = rule.get('weights')
            require(isinstance(weights, dict) and weights and all(number(w) and w >= 0 for w in weights.values()) and sum(weights.values()) > 0, 'Pesos de ranking inválidos')
            require(set(weights) <= set(KPI_UNITS), 'Pesos de ranking nombran KPI desconocidos')
            selected = record[rule['metric_scope']]
            require(isinstance(selected, dict) and set(weights) <= set(selected), 'Ranking omite métricas ponderadas')
            require(all(isinstance(selected[name], dict) and number(selected[name].get('value')) for name in weights), 'Ranking con métrica ponderada ausente/null')
            directions = rule.get('directions')
            require(isinstance(directions, dict) and set(directions) == set(weights) and all(value in ('minimize', 'maximize') for value in directions.values()), 'Direcciones de preferencia ausentes o inválidas')
            require(rule['missing_data_policy'] in ('exclude_case', 'no_rank_if_missing'), 'Ranking no puede premiar KPI ausentes')
            require(rule['normalization'] in ('min_max', 'fixed_range'), 'Normalización de ranking no soportada')
            ranges = rule.get('normalization_ranges')
            require(isinstance(ranges, dict) and set(ranges) == set(weights), 'Ranking sin rangos comparables de normalización')
            for name, bounds in ranges.items():
                require(isinstance(bounds, dict) and number(bounds.get('min')) and number(bounds.get('max')) and bounds['min'] <= bounds['max'], 'Rango de normalización inválido')
                require(bounds['min'] <= selected[name]['value'] <= bounds['max'], 'Valor KPI fuera de rango de normalización')
                if bounds['min'] == bounds['max']:
                    require(rule.get('constant_metric_policy') == 'tie', 'Métrica constante requiere regla de empate')
        for key in ('decision_kpis', 'cycle_kpis'):
            _kpis(record[key], n, set(sources))
        require(record['sensitivity_status'] in ('not_evaluated', 'evaluated'), 'Estado de sensibilidad inválido')
        if record['sensitivity_status'] == 'not_evaluated':
            require(bool(record.get('sensitivity_reason')), 'Sensibilidad no evaluada sin motivo')
        group = tuple(record[key] for key in CONTEXT[1:])
        require(record['case_id'] not in groups.setdefault(group, set()), 'Caso repetido dentro del escenario')
        groups[group].add(record['case_id'])
        signature = sorted((window['window_id'], tuple(window['campaign_years'])) for window in windows)
        require(group not in group_windows or group_windows[group] == signature, 'Casos del escenario usan ventanas diferentes')
        group_windows[group] = signature
        if record.get('ranking') is not None:
            ranking_signature = json.dumps(record['ranking_method'], sort_keys=True, ensure_ascii=False, allow_nan=False)
            require(group not in group_rank_rules or group_rank_rules[group] == ranking_signature, 'Casos comparados usan distintas reglas/rangos de ranking')
            group_rank_rules[group] = ranking_signature
    require(bool(records) and all(value == set(cases) for value in groups.values()), 'Cada escenario exige nueve casos, incluso faltantes explícitos')


def validate_inputs(docs):
    try:
        require(all(name in docs for name in FILES), 'Faltan archivos de entrada')
        catalog, climate, results = (docs[name] for name in FILES)
        build_id = catalog['build_id']
        for doc in docs.values():
            envelope(doc, build_id)
        modes = {doc['mode'] for doc in docs.values()}
        require(modes == {'fixture'} or 'fixture' not in modes, 'No mezclar fixture y datos reales')
        if 'fixture' not in modes:
            require(climate['mode'] == 'downloaded' and results['mode'] == 'simulated', 'Clima downloaded y resultados simulated requeridos')
        data = catalog['data']
        point = data['analysis_point']
        require(point['analysis_point_id'] == 'oruro-pilot' and point['region'] == 'Oruro', 'Solo piloto Oruro')
        records = results['data']['records']
        require(isinstance(records, list), 'records debe ser lista')
        ids = set()
        for record in records:
            rid = identifier(record['result_id'], 'result_id')
            require(rid not in ids, 'result_id duplicado')
            ids.add(rid)
            require(record['build_id'] == build_id, 'build_id de resultado no coincide')
            require(record['analysis_point_id'] == point['analysis_point_id'] and record['rotation_id'] in ROTATIONS, 'Punto/rotación no coincide')
        if modes == {'fixture'}:
            _fixture(data, climate['data'], records)
        else:
            _real(data, climate['data'], records, docs)
        return docs
    except (KeyError, TypeError, AttributeError, IndexError) as error:
        raise ContractError(f'Estructura de entrada incompleta: {error}') from error
    except ValueError as error:
        if isinstance(error, ContractError):
            raise
        raise ContractError(f'Valor de contrato inválido: {error}') from error


def load_inputs(directory):
    directory = Path(directory).resolve()
    docs = validate_inputs({name: read_json(directory / name) for name in FILES})
    checked = {}
    for doc in docs.values():
        for source in doc['sources']:
            name = source['original']
            if name in checked:
                require(checked[name] == (source['sha256'], source['bytes']), 'Original compartido con hashes contradictorios')
                continue
            checked[name] = (source['sha256'], source['bytes'])
            original = directory / name
            require(original.is_file() and not original.is_symlink() and directory in original.resolve().parents, 'Original de fuente ausente o fuera de entrada')
            content = original.read_bytes()
            require(len(content) == source['bytes'] and hashlib.sha256(content).hexdigest() == source['sha256'], 'Integridad del original de fuente no coincide')
    return docs
