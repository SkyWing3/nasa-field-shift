import copy
import functools
import http.server
import json
import shutil
from uuid import uuid4
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from raiz_delivery.contracts import ContractError, load_inputs, read_json, timestamp, validate_inputs
from raiz_delivery.package import build, digest, publish, validate_package, write_json

ROOT = Path(__file__).resolve().parents[1]


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / 'build/test-runs'
        scratch.mkdir(parents=True, exist_ok=True)
        self.root = scratch / uuid4().hex
        self.root.mkdir()
        self.addCleanup(shutil.rmtree, self.root)
        self.package = self.root / 'package'
        self.inputs = ROOT / 'fixtures/dev2-v3'
        build(self.inputs, self.package)

    def altered(self):
        return copy.deepcopy(load_inputs(self.inputs))

    def test_complete_fixture_and_same_result_links(self):
        validate_package(self.package)
        comm = read_json(self.package / 'data/communications.json')
        for message in comm['data']['messages']:
            html = (self.package / message['print_sheet']['path'].lstrip('/')).read_text(encoding='utf-8')
            self.assertIn(message['result_id'], html)
            self.assertIn(message['text'], html)
            self.assertEqual(len(message['print_sheet']['alternatives']), 3)

    def test_build_is_reproducible(self):
        other = self.root / 'other'
        build(self.inputs, other)
        for path in self.package.rglob('*'):
            if path.is_file():
                self.assertEqual(path.read_bytes(), (other / path.relative_to(self.package)).read_bytes())
        build(self.inputs, self.package)

    def test_input_boundaries(self):
        cases = [
            ('mixed_build', lambda d: d['climate.json'].update(build_id='other')),
            ('false_real', lambda d: d['results.json'].update(mode='simulated')),
            ('coordinates', lambda d: d['catalog.json']['data']['analysis_point'].update(latitude=-1)),
            ('nasa_claim', lambda d: d['climate.json'].update(sources=[{'agency': 'NASA'}])),
            ('fake_kpi', lambda d: d['results.json']['data']['records'][0].update(kpis={'water_stress_days': 0})),
            ('duplicate_id', lambda d: d['results.json']['data']['records'][1].update(result_id=d['results.json']['data']['records'][0]['result_id'])),
            ('invented_budget', lambda d: d['results.json']['data']['records'][0].update(water_budget_id='zero')),
            ('no_warning', lambda d: d['results.json'].update(warnings=[])),
            ('path_id', lambda d: d['catalog.json'].update(build_id='../escape')),
            ('evaluated_enso', lambda d: d['results.json']['data']['records'][0].update(enso_initial_phase='Niño')),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                docs = self.altered()
                mutate(docs)
                with self.assertRaises(ContractError):
                    validate_inputs(docs)

    def test_corrupted_file_rejected(self):
        path = self.package / 'data/catalog.json'
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ContractError, 'Hashes'):
            validate_package(self.package)

    def test_unlisted_file_rejected(self):
        (self.package / 'secret.txt').write_text('not public')
        with self.assertRaises(ContractError):
            validate_package(self.package)

    def test_manifest_cannot_self_hash_or_traverse(self):
        for name in ('../secret', '/secret', 'C:/secret', 'data/manifest.json'):
            with self.subTest(name=name):
                path = self.package / 'data/manifest.json'
                original = path.read_bytes()
                manifest = read_json(path)
                manifest['data']['files'][name] = {'sha256': '0'*64, 'bytes': 0}
                write_json(path, manifest)
                with self.assertRaises(ContractError):
                    validate_package(self.package)
                path.write_bytes(original)

    def test_wrong_audio_or_result_rejected(self):
        path = self.package / 'data/communications.json'
        original = path.read_bytes()
        for field, value in (('result_id', 'other'), ('audio', {'status': 'available', 'path': '/audio/fake.mp3'}), ('valid_until', '2026-11-15T10:00:00-04:00')):
            with self.subTest(field=field):
                comm = json.loads(original)
                comm['data']['messages'][0][field] = value
                write_json(path, comm)
                with self.assertRaises(ContractError):
                    validate_package(self.package)
                path.write_bytes(original)

    def test_missing_audio_and_bulletin_are_explicit(self):
        comm = read_json(self.package / 'data/communications.json')['data']
        self.assertTrue(all(m['audio']['path'] is None and m['audio']['status'] == 'unavailable' for m in comm['messages']))
        bulletin = comm['regional_bulletin']
        self.assertEqual(bulletin['status'], 'unavailable')
        self.assertEqual(bulletin['distribution_status'], 'prepared_not_broadcast')
        self.assertIsNone(bulletin['duration_seconds'])

    def test_publish_failure_keeps_previous_pointer(self):
        site = self.root / 'site'
        target = publish(self.package, site)
        before = (site / 'current.json').read_bytes()
        publish(self.package, site)
        (self.package / 'data/results.json').write_text('{}')
        with self.assertRaises((ContractError, KeyError)):
            publish(self.package, site)
        self.assertEqual((site / 'current.json').read_bytes(), before)
        validate_package(target)

    def test_reusing_build_id_for_changed_content_fails(self):
        site = self.root / 'site'
        publish(self.package, site)
        before = (site / 'current.json').read_bytes()
        inputs = self.root / 'inputs'
        inputs.mkdir()
        docs = self.altered()
        docs['catalog.json']['assumptions'].append('Cambio de prueba')
        for name, doc in docs.items():
            write_json(inputs / name, doc)
        other = self.root / 'changed'
        build(inputs, other)
        with self.assertRaises(ContractError):
            publish(other, site)
        self.assertEqual(before, (site / 'current.json').read_bytes())

    def test_timezone_and_strict_json(self):
        with self.assertRaises(ContractError):
            timestamp('2026-11-14T18:00:00')
        timestamp('2026-11-14T18:00:00-04:00')
        for content in ('{"x":1,"x":2}', '{"x":NaN}'):
            path = self.root / 'invalid.json'
            path.write_text(content)
            with self.assertRaises(ContractError):
                read_json(path)

    def test_static_http_integration(self):
        site = self.root / 'site'
        publish(self.package, site)
        class QuietHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        handler = functools.partial(QuietHandler, directory=str(site))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            with urlopen(base + '/current.json', timeout=5) as response:
                pointer = json.load(response)
            release = base + pointer['base_path']
            manifest = read_json(self.package / 'data/manifest.json')
            for path, expected in manifest['data']['files'].items():
                with urlopen(release + path, timeout=5) as response:
                    import hashlib
                    self.assertEqual(hashlib.sha256(response.read()).hexdigest(), expected['sha256'])
            for path in ('audio/missing.mp3', 'api/tasks', 'forecast', 'verification', 'api/observations'):
                with self.assertRaises(HTTPError) as error:
                    urlopen(release + path, timeout=5)
                self.assertEqual(error.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
