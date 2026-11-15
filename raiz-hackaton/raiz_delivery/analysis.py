"""Auditoría descriptiva: no calcula balances, recomendaciones ni probabilidades."""
from .contracts import validate_inputs


def analyze_inputs(docs):
    validate_inputs(docs)
    records = docs['results.json']['data']['records']
    fixture = docs['results.json']['mode'] == 'fixture'
    per_result = []
    for record in records:
        count = record['n_windows']
        per_result.append({'result_id': record['result_id'], 'case_id': record.get('case_id'),
            'n_windows': count, 'n_unique_campaigns': record.get('n_unique_campaigns', 0),
            'sample_status': 'not_evaluated' if fixture or count == 0 else 'insufficient' if count < 3 else 'available',
            'decision_kpis_available': record.get('decision_kpis') is not None,
            'cycle_kpis_available': record.get('cycle_kpis') is not None,
            'sensitivity_status': record['sensitivity_status'], 'missing_reason': record.get('missing_reason')})
    sources = {source['source_id'] for doc in docs.values() for source in doc['sources']}
    blockers = ['fixture_not_scientific_results'] if fixture else []
    if any(item['sample_status'] != 'available' for item in per_result):
        blockers.append('missing_or_insufficient_samples')
    if docs['catalog.json']['data']['analysis_point']['location_status'] == 'unconfirmed':
        blockers.append('analysis_point_unconfirmed')
    blockers.append('human_editorial_and_agronomic_review_not_verified_by_data_validation')
    return {'schema_version': '3.0', 'build_id': docs['catalog.json']['build_id'],
        'status': 'valid_fixture' if fixture else 'structurally_valid_precalculated_inputs',
        'modes': {name: doc['mode'] for name, doc in docs.items()},
        'record_count': len(records), 'case_count': len(docs['catalog.json']['data'].get('cases', [])),
        'source_count': len(sources), 'blockers_for_final_acceptance': blockers, 'results': per_result,
        'limits': ['Validación estructural e integridad no autentican al proveedor ni reproducen el cálculo de D1.',
                   'No se suman n entre casos: comparten ventanas que pueden solaparse.',
                   'No calcula ranking, probabilidades, tendencias ni efectos agronómicos.']}
