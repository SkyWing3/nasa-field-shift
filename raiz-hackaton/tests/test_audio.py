"""Tests de estructura MPEG/identidad; los frames sintéticos no son voz demo."""
from copy import deepcopy
import hashlib
from pathlib import Path
import shutil
import unittest
from uuid import uuid4

from raiz_delivery.audio import attach_audio, mp3_duration, text_sha256, validate_attached_audio
from raiz_delivery.contracts import ContractError, load_inputs
from raiz_delivery.communications import make_communications
from raiz_delivery.package import write_json

ROOT = Path(__file__).resolve().parents[1]


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.root = ROOT / 'build/test-runs' / uuid4().hex
        self.root.mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.root)
        self.assets = self.root / 'assets'
        (self.assets / 'audio').mkdir(parents=True)
        self.output = self.root / 'output'
        self.comm = make_communications(load_inputs(ROOT / 'fixtures/dev2-v31'))
        # Cabeceras y tamaños MPEG válidos solo para probar parser y hashes.
        # No se guardan como evidencia de TTS o como archivos distribuibles.
        self.frame = bytes.fromhex('fffb90c0') + bytes(413)
        self.content = self.frame * 10

    def catalog(self, *, bulletin=False):
        message = self.comm['data']['regional_bulletin'] if bulletin else self.comm['data']['messages'][0]
        path = self.assets / 'audio/test.mp3'
        path.write_bytes(self.content)
        item = {
            'kind': 'regional_bulletin' if bulletin else 'message',
            'communication_id': message.get('communication_id'),
            'result_id': None if bulletin else message['result_id'],
            'case_id': None if bulletin else message.get('case_id'),
            'build_id': self.comm['build_id'],
            'path': 'audio/test.mp3', 'text_sha256': text_sha256(message['text']),
            'sha256': hashlib.sha256(self.content).hexdigest(), 'bytes': len(self.content),
            'duration_seconds': mp3_duration(path),
            'voice': {'provider': 'unit-test', 'name': 'not-real-speech', 'language': 'es'},
            'license': {'status': 'pending_confirmation', 'url': 'https://example.invalid/test'},
            'review': {'status': 'pending', 'reviewer': None, 'reviewed_at': None},
        }
        catalog = {'schema_version': '1.0', 'build_id': self.comm['build_id'], 'mode': self.comm['mode'], 'items': [item]}
        write_json(self.assets / 'catalog.json', catalog)
        return catalog

    def test_no_assets_stays_explicitly_missing(self):
        self.assertEqual(attach_audio(self.comm, None, self.output), self.comm)
        with self.assertRaises(ContractError):
            attach_audio(self.comm, None, self.output, production=True)

    def test_mp3_duration_and_truncation(self):
        path = self.root / 'sample.mp3'
        path.write_bytes(self.content)
        self.assertAlmostEqual(mp3_duration(path), 10 * 1152 / 44100, places=5)
        for content in (b'', b'not an MP3', self.content[:-7], b'ID3\x04\0\0\0\0\0\0'):
            path.write_bytes(content)
            with self.assertRaises(ContractError):
                mp3_duration(path)

    def test_attach_preserves_all_editorial_content(self):
        self.catalog()
        result = attach_audio(self.comm, self.assets, self.output)
        self.assertEqual(result['data']['messages'][0]['audio']['status'], 'available_fixture')
        self.assertEqual(validate_attached_audio(result, self.output)['audio_files'], 1)
        result['data']['messages'][0]['audio'] = deepcopy(self.comm['data']['messages'][0]['audio'])
        self.assertEqual(result, self.comm)

    def test_bulletin_has_same_guion_and_real_frame_duration(self):
        self.catalog(bulletin=True)
        result = attach_audio(self.comm, self.assets, self.output)
        bulletin = result['data']['regional_bulletin']
        self.assertEqual(bulletin['text'], self.comm['data']['regional_bulletin']['text'])
        self.assertEqual(bulletin['distribution_status'], 'prepared_not_broadcast')
        self.assertEqual(bulletin['audio_path'], '/audio/test.mp3')
        self.assertLess(bulletin['duration_seconds'], 60)

    def test_identity_path_and_integrity_fail_closed(self):
        mutations = [
            lambda x: x['items'][0].update(text_sha256='0' * 64),
            lambda x: x['items'][0].update(case_id='wrong-case'),
            lambda x: x['items'][0].update(build_id='wrong-build'),
            lambda x: x['items'][0].update(path='../escape.mp3'),
            lambda x: x['items'][0].update(path='audio/missing.mp3'),
            lambda x: x['items'][0].update(sha256='0' * 64),
            lambda x: x['items'][0].update(bytes=1),
            lambda x: x['items'][0].update(duration_seconds=58),
            lambda x: x.update(mode='simulated'),
            lambda x: x['items'].append(deepcopy(x['items'][0])),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                catalog = self.catalog()
                mutate(catalog)
                write_json(self.assets / 'catalog.json', catalog)
                with self.assertRaises(ContractError):
                    attach_audio(self.comm, self.assets, self.output)

    def test_over_sixty_second_bulletin_rejected(self):
        self.content = self.frame * 2300
        self.catalog(bulletin=True)
        with self.assertRaisesRegex(ContractError, '60 segundos'):
            attach_audio(self.comm, self.assets, self.output)

    def test_published_audio_cannot_be_tampered(self):
        self.catalog()
        result = attach_audio(self.comm, self.assets, self.output)
        (self.output / 'audio/test.mp3').write_bytes(self.content + b'X')
        with self.assertRaises(ContractError):
            validate_attached_audio(result, self.output)

    def test_production_refuses_fixture_license_and_review(self):
        self.catalog()
        with self.assertRaises(ContractError):
            attach_audio(self.comm, self.assets, self.output, production=True)


if __name__ == '__main__':
    unittest.main()
