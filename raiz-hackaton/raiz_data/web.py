"""Vistas precalculadas para la web: clima nov-mar y calendario del modelo.

No modifica la entrada de Dev 2 ni recalcula KPI. Publica una release derivada,
identificada por contenido, con el publicador oficial y sin consultas de red.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date, timedelta
import hashlib
import json
import math
from pathlib import Path
from statistics import mean, pstdev
import shutil
from tempfile import gettempdir

from . import agro
from .scenarios import phase_of
from raiz_delivery.contracts import load_inputs, read_json, safe_relative
from raiz_delivery.package import build, publish, sources_in, write_json, staging_directory
from raiz_delivery.communications import make_communications
from raiz_delivery.audio import text_sha256

VERSION = 'web-v32-2'
KPIS = ['net_irrigation_requirement_mm', 'water_stress_days', 'thermal_exposure_days',
        'bare_rain_exposure_days', 'bare_wind_exposure_days', 'planned_coverage_pct']
VARIABLES = {
    'precip_campaign': ('PRECTOTCORR', 'Lluvia por campaña', 'mm', sum),
    'tmax_mean': ('T2M_MAX', 'Temperatura máxima media', '°C', mean),
    'tmin_mean': ('T2M_MIN', 'Temperatura mínima media', '°C', mean),
    'frost_days': ('T2M_MIN', 'Noches bajo 0 °C', 'días', lambda values: sum(v < 0 for v in values)),
}


def campaign_days(year):
    day, end = date(year, 11, 1), date(year + 1, 4, 1)
    while day < end:
        yield day
        day += timedelta(days=1)


def climate_views(doc, periods, oni):
    series = {s['variable']: {date.fromisoformat(v['date']): v['value'] for v in s['values']}
              for s in doc['data']['series']}
    source = next(s for s in doc['sources'] if s['source_id'] == 'nasa-power-daily')
    campaigns, by_year = [], {}
    for p in periods:
        for year in range(p['start_campaign_year'], p['end_campaign_year'] + 1):
            days = list(campaign_days(year))
            values, missing = {}, {}
            for variable, (name, _, _, aggregate) in VARIABLES.items():
                raw = [series.get(name, {}).get(day) for day in days]
                missing[variable] = sum(not isinstance(v, (float, int)) or not math.isfinite(v) for v in raw)
                values[variable] = None if missing[variable] else aggregate(raw)
            anom = oni.get(('NDJ', year))
            phases = phase_of(anom) if anom is not None else []
            phase = next((p for p in phases if p != 'Niño fuerte'), None)
            campaigns.append({'campaign_year': year, 'label': f'{year}–{str(year + 1)[-2:]}', 'period_id': p['period_id'],
                              'oni_ndj': anom, 'enso_phase': phase, 'strong_nino': 'Niño fuerte' in phases,
                              'complete': all(n == 0 for n in missing.values()), 'expected_days': len(days),
                              'missing_days': missing, 'nature': 'downloaded', 'source_id': 'noaa-cpc-oni',
                              'missing_reason': None if anom is not None else 'ONI NDJ no disponible'})
            by_year[year] = values
    def summary(group, variable):
        _, label, unit, _ = VARIABLES[variable]
        years = [c['campaign_year'] for c in campaigns if group['start_campaign_year'] <= c['campaign_year'] <= group['end_campaign_year']]
        values = [by_year[y][variable] for y in years if by_year[y][variable] is not None]
        n = len(values)
        return {'variable': variable, 'label': label, 'unit': unit, 'period_id': group['period_id'],
                'period_label': group['label'], 'start_campaign_year': group['start_campaign_year'], 'end_campaign_year': group['end_campaign_year'],
                'statistic': 'media por campaña completa (nov–mar); desviación poblacional entre campañas',
                'value': round(mean(values), 2) if n else None, 'sd': round(pstdev(values), 2) if n else None,
                'min': round(min(values), 2) if n else None, 'max': round(max(values), 2) if n else None,
                'n_campaigns': n, 'n_missing': len(years) - n, 'nature': 'downloaded', 'source_id': source['source_id'],
                'spatial_resolution': source['spatial_resolution'], 'temporal_resolution': 'diaria agregada por campaña nov–mar',
                'method': 'Exige todos los días de la campaña para esta variable; no rellena ni prorratea. Lluvia: suma; temperatura: media; frío: Tmin < 0 °C.',
                'missing_reason': None if n else 'Sin campañas completas para esta variable'}
    start = min(p['start_campaign_year'] for p in periods)
    end = max(p['end_campaign_year'] for p in periods)
    decades = [{'period_id': f'decade-{year}', 'start_campaign_year': max(start, year), 'end_campaign_year': min(end, year + 9),
                'label': f'{max(start, year)}–{min(end, year + 9)}'} for year in range(start // 10 * 10, end + 1, 10)]
    return {'campaigns': campaigns, 'period_summaries': [summary(p, v) for p in periods for v in VARIABLES],
            'decade_summaries': [summary(p, v) for p in decades for v in VARIABLES],
            'summary_rule': {'season': '1-nov-y a 31-mar-y+1', 'completeness': 'todos los días; por variable',
                             'frost_threshold_c': 0, 'frost_operator': '<', 'note': 'Conteo descriptivo regional, no daño de cultivo ni helada medida en parcela.'}}


def coverage_calendar(crop, years):
    if not years:
        return []
    months = defaultdict(list)
    for year in years:
        for day, (phase, _, cover, *_rest) in agro.campaign_plan(crop, year).items():
            kind = 'crop' if phase == 'cultivo' else 'fallow_vegetation' if phase == 'descanso' else 'residue' if cover > 0 else 'bare'
            months[day.month].append((kind, cover))
    out = []
    for month in [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7]:
        rows = months[month]
        counts = Counter(kind for kind, _ in rows)
        out.append({'month': month, 'cover': counts.most_common(1)[0][0],
                    'mean_coverage_pct': round(100 * mean(cover for _, cover in rows), 1),
                    'bare_days_mean': round(sum(cover < agro.THRESHOLDS['bare_cover_fraction']['value'] for _, cover in rows) / len(years), 1),
                    'days_by_cover_mean': {kind: round(count / len(years), 1) for kind, count in sorted(counts.items())},
                    'nature': 'scenario_assumption', 'n_campaigns': len(years)})
    return out


def enrich(docs, oni):
    out = deepcopy(docs)
    cat = out['catalog.json']['data']
    records = out['results.json']['data']['records']
    out['climate.json']['data'].update(climate_views(out['climate.json'], cat['periods'], oni))
    noaa = next(s for s in out['results.json']['sources'] if s['source_id'] == 'noaa-cpc-oni')
    if not any(s['source_id'] == noaa['source_id'] for s in out['climate.json']['sources']):
        out['climate.json']['sources'].append(deepcopy(noaa))
    for key, field in [('soil_profiles', 'soil_profile_id'), ('water_budgets', 'water_budget_id')]:
        used = {r[field] for r in records}
        cat[key] = [item for item in cat[key] if item[field] in used]
    cat['presentation'] = {'version': VERSION, 'ranking_enabled': False, 'risk_levels_enabled': False, 'kpis': KPIS,
                           'coverage_method': 'Plan diario agro.campaign_plan; estado predominante del mes y cobertura media. La presencia de cultivo no implica cobertura total.'}
    cat['ranking_rule'] = {'enabled': False, 'reason': 'Alcance v3.2: se comparan indicadores; no se ordena ni recomienda qué sembrar.'}
    for r in records:
        r['coverage_calendar'] = coverage_calendar(r['decision_crop'], [w['campaign_years'][0] for w in r['windows']])
        r['coverage_calendar_method'] = cat['presentation']['coverage_method']
        r['ranking'] = None
        r.pop('ranking_method', None)
        r.pop('ranking_score', None)
    digest = hashlib.sha256(json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()[:12]
    original = out['catalog.json']['build_id']
    derived = f'{original[:92]}-web-{digest}'
    for doc in out.values():
        doc['derived_from_build_id'] = original
        doc['build_id'] = derived
    for r in records:
        r['derived_from_build_id'] = original
        r['build_id'] = derived
    return out


def prepare(input_dir, site_root, audio_dir=None, editorial=None):
    input_dir, site_root = Path(input_dir).resolve(), Path(site_root).resolve()
    docs = load_inputs(input_dir)
    default_editorial = input_dir.parent / 'publicacion' / 'editorial.json'
    if editorial is None and default_editorial.exists():
        editorial = read_json(default_editorial)
    # Leer ONI de la evidencia asociada a ESTA entrada, no de otro directorio global.
    oni_source = next(s for s in docs['results.json']['sources'] if s['source_id'] == 'noaa-cpc-oni')
    oni = {}
    for line in (input_dir / safe_relative(oni_source['original'])).read_text(encoding='utf-8').splitlines()[1:]:
        parts = line.split()
        if len(parts) == 4:
            oni[(parts[0], int(parts[1]))] = float(parts[3])
    enriched = enrich(docs, oni)
    audio_catalog = Path(audio_dir) / 'catalog.json' if audio_dir else None
    publication = {'data_version': enriched['catalog.json']['build_id'], 'editorial': editorial,
                   'audio_catalog': read_json(audio_catalog) if audio_catalog and audio_catalog.exists() else None}
    publication_hash = hashlib.sha256(json.dumps(publication, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()[:12]
    release_id = f"{docs['catalog.json']['build_id'][:92]}-web-{publication_hash}"
    for doc in enriched.values():
        doc['build_id'] = release_id
    for record in enriched['results.json']['data']['records']:
        record['build_id'] = release_id
    site_root.parent.mkdir(parents=True, exist_ok=True)
    # Fuera de public/: Vite puede observar y bloquear el renombrado del
    # staging en Windows. Tampoco se exponen entradas temporales por HTTP.
    temp_root = Path(gettempdir()).resolve()
    work = staging_directory(temp_root, '.raiz-web-')
    try:
        source = work / 'input'
        for name, doc in enriched.items():
            write_json(source / name, doc)
        for name in sources_in(enriched):
            relative = safe_relative(name)
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(input_dir / relative, target)
        # Reutilizar voz SOLO si coinciden el texto y los identificadores del
        # original. El publicador valida después hashes, duración y revisiones.
        audio = None
        included, skipped = 0, 0
        if audio_dir and (Path(audio_dir) / 'catalog.json').exists():
            old = read_json(Path(audio_dir) / 'catalog.json')
            expected = make_communications(enriched, editorial)
            messages = {m['communication_id']: m for m in expected['data']['messages']}
            bulletin = expected['data']['regional_bulletin']
            messages[bulletin['communication_id']] = bulletin
            items = []
            for item in old['items']:
                message = messages.get(item.get('communication_id'))
                translated = item.get('kind', '').endswith('translation')
                text_hash = item.get('source_text_sha256') if translated else item.get('text_sha256')
                if (old.get('build_id') != docs['results.json']['build_id'] or item.get('build_id') != old['build_id']
                    or not message or text_hash != text_sha256(message['text'])
                    or item.get('result_id') != message.get('result_id')
                    or (translated and item.get('language') not in ('que', 'quh', 'quz'))
                    or (translated and item.get('translation', {}).get('method') != 'human_recording')):
                    skipped += 1
                    continue
                mapped = deepcopy(item)
                mapped['original_build_id'] = item['build_id']
                mapped['build_id'] = enriched['results.json']['build_id']
                items.append(mapped)
                path = safe_relative(item['path'])
                target = work / 'audio' / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(Path(audio_dir) / path, target)
            if items:
                audio = work / 'audio'
                write_json(audio / 'catalog.json', {**old, 'build_id': enriched['results.json']['build_id'], 'items': items})
                included = len(items)
        build(source, work / 'package', editorial=editorial, audio_assets=audio)
        release = publish(work / 'package', site_root)
        return {'build_id': enriched['results.json']['build_id'], 'release': str(release),
                'records': len(enriched['results.json']['data']['records']), 'audio_included': included, 'audio_skipped': skipped}
    finally:
        # Solo retirar el directorio temporal creado por esta ejecución.
        if work.resolve().parent != temp_root or not work.name.startswith('.raiz-web-') or work.is_symlink():
            raise ValueError('Directorio de trabajo inesperado')
        if work.exists():
            shutil.rmtree(work)


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--site-root', required=True)
    parser.add_argument('--audio-assets')
    parser.add_argument('--editorial')
    args = parser.parse_args()
    result = prepare(args.input, args.site_root, args.audio_assets, read_json(args.editorial) if args.editorial else None)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
