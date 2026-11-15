"""Datos numéricos de estas pruebas son sintéticos; no son salidas científicas."""
import copy
import hashlib
import json
import shutil
import unittest
from pathlib import Path
from uuid import uuid4

from raiz_delivery.analysis import analyze_inputs
from raiz_delivery.contracts import ContractError, FILES, load_inputs, read_json, validate_inputs

ROOT = Path(__file__).resolve().parents[1]


def structural_real_inputs():
    """Paquete de prueba de estructura, no descarga NASA ni recomendación real."""
    docs = copy.deepcopy(load_inputs(ROOT / 'fixtures/dev2-v31'))
    content = b'UNIT TEST SYNTHETIC ORIGINAL; NOT NASA DATA\n'
    source = {'source_id': 'synthetic-unit-test', 'agency': 'UNIT TEST ONLY',
        'product': 'synthetic-contract-test', 'version': 'test-1',
        'url': 'https://example.com/synthetic-unit-test', 'queried_at': '2026-11-14T12:00:00Z',
        'period': {'start': '2001-01-01', 'end': '2026-11-10'},
        'spatial_resolution': 'unit-test only', 'temporal_resolution': 'daily',
        'units': {'synthetic_test_variable': 'mm'}, 'qa': 'Unit test; no scientific claim',
        'original': 'raw/synthetic.txt', 'sha256': hashlib.sha256(content).hexdigest(),
        'bytes': len(content), 'license': 'Synthetic test content authored for this project'}
    for doc in docs.values():
        doc.update(build_id='synthetic-contract-test', mode='simulated', generated_at='2026-11-14T15:00:00Z', data_as_of='2026-11-10T00:00:00Z', model_version='unit-test', sources=[copy.deepcopy(source)], warnings=['UNIT TEST ONLY; not a real scientific package'])
    docs['climate.json']['mode'] = 'downloaded'
    catalog = docs['catalog.json']['data']
    catalog['analysis_point'].update(latitude=-18.0, longitude=-67.0, location_status='regional_point', representativeness='Synthetic coordinates for validator tests, not a confirmed farm')
    catalog['periods'] = [{'period_id': 'test-period', 'start_campaign_year': 2001, 'end_campaign_year': 2025}]
    catalog['water_budgets'] = [{'water_budget_id': 'test-budget', 'net_limit_mm': 0, 'label': 'Synthetic test'}]
    catalog['soil_profiles'] = [{'soil_profile_id': 'test-soil', 'nature': 'scenario_assumption'}]
    docs['climate.json']['data']['series'] = [{'variable': 'synthetic_test_variable', 'unit': 'mm', 'nature': 'downloaded', 'source_id': source['source_id'], 'values': [{'date': '2001-11-01', 'value': 1}]}]
    for record in docs['results.json']['data']['records']:
        record.update(build_id='synthetic-contract-test', result_id='test-'+record['case_id'].lower(), period_id='test-period', enso_initial_phase='Niño', water_budget_id='test-budget', soil_profile_id='test-soil', calendar='Synthetic unit test', initialization='Synthetic unit test', residues='Synthetic unit test', n_windows=3, n_unique_campaigns=5)
        record['windows'] = [{'window_id': f'test-{y}', 'campaign_years': [y,y+1,y+2], 'complete': True} for y in (2001,2002,2003)]
        metric = {'value': 1, 'unit': 'days', 'nature': 'simulated', 'source_ids': [source['source_id']], 'method': 'Synthetic test, not an agronomic model'}
        record['decision_kpis'] = {'water_stress_days': copy.deepcopy(metric)}
        record['cycle_kpis'] = {'water_stress_days': copy.deepcopy(metric)}
    return docs, content


class ContractsV31Tests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / 'build/contract-tests'
        scratch.mkdir(parents=True, exist_ok=True)
        self.scratch = scratch / uuid4().hex
        self.scratch.mkdir()
        self.addCleanup(shutil.rmtree, self.scratch)

    def test_nine_cases_fixture_and_analysis(self):
        docs = load_inputs(ROOT / 'fixtures/dev2-v31')
        report = analyze_inputs(docs)
        self.assertEqual(report['case_count'], 9)
        self.assertEqual(report['record_count'], 9)
        self.assertEqual(report['source_count'], 0)
        self.assertIn('fixture_not_scientific_results', report['blockers_for_final_acceptance'])
        self.assertTrue(all(row['sample_status'] == 'not_evaluated' for row in report['results']))

    def test_legacy_fixture_remains_supported(self):
        self.assertEqual(len(load_inputs(ROOT / 'fixtures/dev2-v3')['results.json']['data']['records']), 3)

    def test_synthetic_structure_with_mixed_real_modes(self):
        docs, original = structural_real_inputs()
        validate_inputs(docs)
        report = analyze_inputs(docs)
        self.assertEqual(report['status'], 'structurally_valid_precalculated_inputs')
        self.assertNotIn('fixture_not_scientific_results', report['blockers_for_final_acceptance'])
        self.assertEqual(report['results'][0]['n_unique_campaigns'], 5)

    def test_original_file_integrity_is_required(self):
        docs, original = structural_real_inputs()
        for name, doc in docs.items():
            (self.scratch/name).write_text(json.dumps(doc), encoding='utf-8')
        with self.assertRaises(ContractError):
            load_inputs(self.scratch)
        raw = self.scratch/'raw'
        raw.mkdir()
        (raw/'synthetic.txt').write_bytes(original)
        load_inputs(self.scratch)
        (raw/'synthetic.txt').write_bytes(original+b'changed')
        with self.assertRaisesRegex(ContractError, 'Integridad'):
            load_inputs(self.scratch)

    def test_real_contract_rejects_incoherence(self):
        changes = [
            ('mixed_build', lambda d: d['climate.json'].update(build_id='other')),
            ('mode', lambda d: d['results.json'].update(mode='downloaded')),
            ('missing_source', lambda d: d['results.json'].update(sources=[])),
            ('bad_url', lambda d: d['results.json']['sources'][0].update(url='https://example.com/file?token=secret')),
            ('unknown_case', lambda d: d['results.json']['data']['records'][0].update(case_id='Z-1')),
            ('bad_crop', lambda d: d['results.json']['data']['records'][0].update(decision_crop='maiz')),
            ('unknown_period', lambda d: d['results.json']['data']['records'][0].update(period_id='unknown')),
            ('unknown_budget', lambda d: d['results.json']['data']['records'][0].update(water_budget_id='unknown')),
            ('bad_count', lambda d: d['results.json']['data']['records'][0].update(n_windows=10)),
            ('bad_unique', lambda d: d['results.json']['data']['records'][0].update(n_unique_campaigns=9)),
            ('incomplete', lambda d: d['results.json']['data']['records'][0]['windows'][0].update(complete=False)),
            ('nonconsecutive', lambda d: d['results.json']['data']['records'][0]['windows'][0].update(campaign_years=[2001,2003,2004])),
            ('different_windows', lambda d: d['results.json']['data']['records'][0]['windows'][0].update(window_id='different')),
            ('missing_case', lambda d: d['results.json']['data']['records'].pop()),
            ('duplicate_case', lambda d: d['results.json']['data']['records'].append(copy.deepcopy(d['results.json']['data']['records'][0]))),
            ('infinite_kpi', lambda d: d['results.json']['data']['records'][0]['decision_kpis']['water_stress_days'].update(value=float('inf'))),
            ('wrong_unit', lambda d: d['results.json']['data']['records'][0]['decision_kpis']['water_stress_days'].update(unit='mm')),
            ('wrong_nature', lambda d: d['results.json']['data']['records'][0]['decision_kpis']['water_stress_days'].update(nature='downloaded')),
            ('unknown_kpi_source', lambda d: d['results.json']['data']['records'][0]['decision_kpis']['water_stress_days'].update(source_ids=['unknown'])),
            ('null_kpi_without_reason', lambda d: d['results.json']['data']['records'][0]['decision_kpis']['water_stress_days'].update(value=None)),
            ('unscoped_rank', lambda d: d['results.json']['data']['records'][0].update(ranking=1)),
            ('unsigned_datetime', lambda d: d['results.json'].update(generated_at='2026-11-14T15:00:00')),
            ('future_data', lambda d: d['results.json'].update(data_as_of='2027-11-14T15:00:00Z')),
        ]
        for label, mutate in changes:
            with self.subTest(case=label):
                docs, _ = structural_real_inputs()
                mutate(docs)
                with self.assertRaises(ContractError):
                    validate_inputs(docs)

    def test_insufficient_sample_cannot_rank(self):
        docs, _ = structural_real_inputs()
        for record in docs['results.json']['data']['records']:
            record['windows'] = record['windows'][:1]
            record.update(n_windows=1, n_unique_campaigns=3)
        validate_inputs(docs)
        self.assertEqual(analyze_inputs(docs)['results'][0]['sample_status'], 'insufficient')
        docs['results.json']['data']['records'][0]['ranking'] = 1
        with self.assertRaisesRegex(ContractError, 'insuficiente'):
            validate_inputs(docs)

    def test_duplicate_campaigns_cannot_inflate_sample(self):
        docs, _ = structural_real_inputs()
        for record in docs['results.json']['data']['records']:
            for window in record['windows']:
                window['campaign_years'] = [2001, 2002, 2003]
            record['n_unique_campaigns'] = 3
        with self.assertRaisesRegex(ContractError, 'Campañas de ventana duplicadas'):
            validate_inputs(docs)

    def test_duplicate_and_conflicting_source_ids_rejected(self):
        docs, _ = structural_real_inputs()
        docs['results.json']['sources'].append(copy.deepcopy(docs['results.json']['sources'][0]))
        with self.assertRaisesRegex(ContractError, 'source_id duplicado'):
            validate_inputs(docs)
        docs, _ = structural_real_inputs()
        docs['results.json']['sources'][0]['product'] = 'different-product'
        with self.assertRaisesRegex(ContractError, 'Procedencia contradictoria'):
            validate_inputs(docs)

    def test_frequency_denominator(self):
        docs, _ = structural_real_inputs()
        metric = {'value': 1/3, 'unit': 'fraction', 'nature': 'simulated', 'source_ids': ['synthetic-unit-test'], 'method': 'Test', 'numerator':1,'denominator':3}
        docs['results.json']['data']['records'][0]['decision_kpis']['constraint_pass_frequency'] = metric
        validate_inputs(docs)
        metric['denominator'] = 2
        with self.assertRaises(ContractError):
            validate_inputs(docs)

    def test_rank_requires_existing_complete_metrics_and_shared_rules(self):
        docs, _ = structural_real_inputs()
        rule = {'normalization': 'min_max', 'normalization_ranges': {'water_stress_days': {'min':0, 'max':10}},
                'missing_data_policy': 'exclude_case', 'tie_rule': 'equal_values_share_rank',
                'metric_scope': 'decision_kpis', 'weights': {'water_stress_days':1},
                'directions': {'water_stress_days':'minimize'}}
        for record in docs['results.json']['data']['records']:
            record.update(ranking=1, ranking_method=copy.deepcopy(rule))
        validate_inputs(docs)
        changes = [
            ('unknown_weight', lambda r: r['ranking_method'].update(weights={'invented_metric':1})),
            ('missing_metric', lambda r: r['decision_kpis'].pop('water_stress_days')),
            ('null_metric', lambda r: r['decision_kpis']['water_stress_days'].update(value=None, missing_reason='Test missing')),
            ('missing_directions', lambda r: r['ranking_method'].pop('directions')),
            ('invalid_direction', lambda r: r['ranking_method'].update(directions={'water_stress_days':'upwards'})),
            ('wrong_direction_keys', lambda r: r['ranking_method'].update(directions={'other_metric':'minimize'})),
            ('reward_missing', lambda r: r['ranking_method'].update(missing_data_policy='ignore_missing')),
            ('missing_ranges', lambda r: r['ranking_method'].pop('normalization_ranges')),
            ('inverted_ranges', lambda r: r['ranking_method']['normalization_ranges']['water_stress_days'].update(min=20)),
            ('outside_ranges', lambda r: r['ranking_method']['normalization_ranges']['water_stress_days'].update(min=2)),
            ('different_ranges', lambda r: r['ranking_method']['normalization_ranges']['water_stress_days'].update(max=20)),
            ('different_directions', lambda r: r['ranking_method'].update(directions={'water_stress_days':'maximize'})),
        ]
        for label, mutate in changes:
            with self.subTest(case=label):
                changed = copy.deepcopy(docs)
                mutate(changed['results.json']['data']['records'][0])
                with self.assertRaises(ContractError):
                    validate_inputs(changed)

    def test_constant_rank_metric_has_explicit_tie_rule(self):
        docs, _ = structural_real_inputs()
        for record in docs['results.json']['data']['records']:
            record.update(ranking=1, ranking_method={'normalization':'min_max', 'normalization_ranges':{'water_stress_days':{'min':1,'max':1}}, 'missing_data_policy':'exclude_case','tie_rule':'equal_values_share_rank','metric_scope':'decision_kpis','weights':{'water_stress_days':1},'directions':{'water_stress_days':'minimize'},'constant_metric_policy':'tie'})
        validate_inputs(docs)
        docs['results.json']['data']['records'][0]['ranking_method'].pop('constant_metric_policy')
        with self.assertRaisesRegex(ContractError, 'constante'):
            validate_inputs(docs)

    def test_fixture_cannot_be_relabelled_as_real(self):
        docs = copy.deepcopy(load_inputs(ROOT/'fixtures/dev2-v31'))
        for doc in docs.values():
            doc['mode'] = 'simulated'
        with self.assertRaises(ContractError):
            validate_inputs(docs)

    def test_original_paths_reject_encoded_traversal_and_controls(self):
        for path in ('raw/%2e%2e/secret.txt', 'raw/%252e%252e/secret.txt', 'raw/file.txt?download=1', 'raw/file.txt#fragment', 'raw/new\nline.txt', 'raw/null\x00.txt', 'raw/control\x7f.txt'):
            with self.subTest(path=repr(path)):
                docs, _ = structural_real_inputs()
                for doc in docs.values():
                    doc['sources'][0]['original'] = path
                with self.assertRaisesRegex(ContractError, 'escapes URL o controles'):
                    validate_inputs(docs)

    def test_public_source_query_allowed_but_signed_credentials_rejected(self):
        docs, _ = structural_real_inputs()
        for doc in docs.values():
            doc['sources'][0]['url'] = 'https://example.com/data?parameters=RAIN&start=20010101'
        validate_inputs(docs)
        for query in ('access_token=secret', 'X-Amz-Signature=secret', 'x-goog-credential=secret', 'api_key=secret', 'sig=secret'):
            with self.subTest(query=query):
                changed = copy.deepcopy(docs)
                changed['results.json']['sources'][0]['url'] = 'https://example.com/data?' + query
                with self.assertRaisesRegex(ContractError, 'credenciales o firma'):
                    validate_inputs(changed)

    def test_malformed_json(self):
        path = self.scratch/'bad.json'
        for content in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":1e9999}', '{broken', '[1,2,]'):
            with self.subTest(content=content):
                path.write_text(content, encoding='utf-8')
                with self.assertRaises(ContractError):
                    read_json(path)


if __name__ == '__main__':
    unittest.main()
