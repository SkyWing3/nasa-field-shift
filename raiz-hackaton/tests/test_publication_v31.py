import json
import shutil
import threading
import unittest
from pathlib import Path
from uuid import uuid4
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from raiz_delivery.contracts import ContractError, read_json
from raiz_delivery.package import activate, build, digest, publish, validate_package
from raiz_delivery.serve import create_server

ROOT=Path(__file__).resolve().parents[1]


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.root=ROOT/'build/test-runs'/uuid4().hex
        self.root.mkdir(parents=True)
        self.addCleanup(shutil.rmtree,self.root)
        self.package=self.root/'package'
        self.site=self.root/'site'
        build(ROOT/'fixtures/dev2-v31',self.package)

    def test_nine_print_sheets_and_quality_report(self):
        comm=read_json(self.package/'data/communications.json')
        self.assertEqual(len(comm['data']['messages']),9)
        self.assertEqual(len(list((self.package/'print').glob('*.html'))),9)
        report=read_json(self.package/'data/quality.json')
        self.assertEqual(report['record_count'],9)
        self.assertIn('fixture_not_scientific_results',report['blockers_for_final_acceptance'])

    def test_production_does_not_promote_fixture(self):
        with self.assertRaises(ContractError):
            publish(self.package,self.site,production=True)
        self.assertFalse((self.site/'current.json').exists())

    def test_activate_known_release_and_reject_unknown(self):
        target=publish(self.package,self.site)
        before=(self.site/'current.json').read_bytes()
        self.assertEqual(activate(self.site,target.name),target)
        with self.assertRaises((ContractError,OSError)):
            activate(self.site,'missing')
        self.assertEqual(before,(self.site/'current.json').read_bytes())
        with self.assertRaises(ContractError):
            activate(self.site,'../outside')

    def test_read_only_server_routes_hashes_and_downloads(self):
        target=publish(self.package,self.site)
        server=create_server(self.site,port=0)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        self.addCleanup(thread.join,5)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base=f'http://127.0.0.1:{server.server_port}'
        with urlopen(base+'/',timeout=5) as response:
            self.assertTrue(response.url.endswith('/index.html'))
            self.assertIn(b'FIXTURE',response.read())
        with urlopen(base+'/current.json',timeout=5) as response:
            pointer=json.load(response)
        self.assertEqual(pointer['manifest_sha256'],digest(target/'data/manifest.json')['sha256'])
        for path in validate_package(target)['data']['files']:
            with urlopen(base+pointer['base_path']+path,timeout=5) as response:
                self.assertEqual(response.read(),(target/path).read_bytes())
        for path in ('/server.py','/team.sqlite3','/api/tasks','/forecast','/verification','/releases/','/releases/'+target.name+'/','/releases/'+target.name+'/%2e%2e/server.py'):
            with self.subTest(path=path):
                with self.assertRaises(HTTPError) as error:
                    urlopen(base+path,timeout=5)
                self.assertEqual(error.exception.code,404)
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(base+'/',data=b'{}',method='POST'),timeout=5)
        self.assertEqual(error.exception.code,501)

    def test_pointer_integrity_before_serving(self):
        publish(self.package,self.site)
        pointer=read_json(self.site/'current.json')
        pointer['manifest_sha256']='0'*64
        (self.site/'current.json').write_text(json.dumps(pointer))
        with self.assertRaises(ContractError): create_server(self.site,port=0)


if __name__=='__main__': unittest.main()
