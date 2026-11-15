"""Regresiones independientes. Todos los archivos sensibles son marcadores sintéticos."""
import json
import shutil
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from uuid import uuid4

from raiz_delivery.contracts import ContractError, safe_relative
from raiz_delivery.package import activate, build, publish, read_json, safe_path, write_json
from raiz_delivery.serve import create_server

ROOT = Path(__file__).resolve().parents[1]


class AuditRegressions(unittest.TestCase):
    def setUp(self):
        self.scratch = ROOT / 'build/audit' / uuid4().hex
        self.scratch.mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.scratch)

    def test_source_paths_reject_url_metacharacters(self):
        for value in ('raw/%2e%2e/private.txt', 'raw/x?token=1', 'raw/x#fragment', 'raw/x\nname.txt'):
            with self.subTest(path=value):
                with self.assertRaises(ContractError):
                    safe_relative(value)

    def test_publication_paths_reject_encoded_segments(self):
        for value in ('data/raw/%2e%2e/x', 'data/raw/x?y', 'data/raw/x#y', 'data/raw/x\n'):
            with self.subTest(path=value):
                with self.assertRaises(ContractError):
                    safe_path(self.scratch, value)

    def test_double_encoded_path_cannot_leave_release(self):
        package, site = self.scratch/'package', self.scratch/'site'
        build(ROOT/'fixtures/dev2-v31', package)
        release = publish(package, site)
        (site/'private.txt').write_text('AUDIT_PRIVATE_OUTSIDE_RELEASE', encoding='utf-8')
        server = create_server(site, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            # Simular manifiesto alterado DESPUÉS de arrancar. La allowlist no
            # debe transformarse en otra ruta al entregar al manejador estándar.
            literal = 'data/raw/' + '/'.join(['%2e%2e']*4) + '/private.txt'
            malicious = release/literal
            malicious.parent.mkdir(parents=True)
            malicious.write_text('AUDIT_DECLARED_RAW_FILE', encoding='utf-8')
            manifest_path = release/'data/manifest.json'
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            manifest['data']['files'][literal] = {'sha256':'0'*64, 'bytes':23}
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            base = f'http://127.0.0.1:{server.server_port}'
            attack = '/releases/'+release.name+'/'+literal.replace('%','%25')
            with self.assertRaises(HTTPError) as error:
                urlopen(base+attack, timeout=5)
            self.assertEqual(error.exception.code, 404)
            for path in ('/private.txt', '/releases/'+release.name+'/%252e%252e/private.txt'):
                with self.subTest(path=path):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(base+path, timeout=5)
                    self.assertEqual(error.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_activate_restores_previous_complete_release(self):
        package, site = self.scratch/'first-package', self.scratch/'site'
        build(ROOT/'fixtures/dev2-v31', package)
        first = publish(package, site)
        first_pointer = read_json(site/'current.json')
        second_inputs = self.scratch/'second-inputs'
        second_inputs.mkdir()
        for name in ('catalog.json', 'climate.json', 'results.json'):
            doc = read_json(ROOT/'fixtures/dev2-v31'/name)
            doc['build_id'] = 'fixture-audit-second'
            if name == 'results.json':
                for result in doc['data']['records']:
                    result['build_id'] = doc['build_id']
            write_json(second_inputs/name, doc)
        second_package = self.scratch/'second-package'
        build(second_inputs, second_package)
        publish(second_package, site)
        self.assertEqual(read_json(site/'current.json')['build_id'], 'fixture-audit-second')
        activate(site, first.name)
        self.assertEqual(read_json(site/'current.json'), first_pointer)
        self.assertTrue((site/'releases/fixture-audit-second/index.html').is_file())


if __name__ == '__main__':
    unittest.main()
