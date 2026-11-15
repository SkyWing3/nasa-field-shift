"""Audio en otros idiomas (quechua/aymara): enlace al texto español y revisión de hablante.

Los frames MPEG son sintéticos y solo prueban estructura; no son voz.
"""
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path
import shutil
import unittest
from uuid import uuid4

from raiz_delivery.audio import _validate_translation, attach_audio, mp3_duration, text_sha256, validate_attached_audio
from raiz_delivery.communications import make_communications
from raiz_delivery.contracts import ContractError, load_inputs, read_json
from raiz_delivery.package import build, validate_package, write_json

ROOT = Path(__file__).resolve().parents[1]
FRAME = bytes.fromhex('fffb90c0') + bytes(413)


class TranslationAudioTests(unittest.TestCase):
    def setUp(self):
        self.root = ROOT / 'build/test-runs' / uuid4().hex
        self.root.mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.root)
        self.assets = self.root / 'assets'
        (self.assets / 'audio').mkdir(parents=True)
        self.output = self.root / 'output'
        self.comm = make_communications(load_inputs(ROOT / 'fixtures/dev2-v31'))

    def mp3(self, name, frames=10):
        path = self.assets / 'audio' / name
        path.write_bytes(FRAME * frames)
        content = path.read_bytes()
        return {'path': f'audio/{name}', 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'duration_seconds': mp3_duration(path)}

    def spanish(self, index=0):
        message = self.comm['data']['messages'][index]
        return {'kind': 'message', 'communication_id': message['communication_id'], 'result_id': message['result_id'],
                'case_id': message['case_id'], 'build_id': self.comm['build_id'], **self.mp3(f'es-{index}.mp3'),
                'text_sha256': text_sha256(message['text']),
                'voice': {'provider': 'unit-test', 'name': 'not-real-speech', 'language': 'es'},
                'license': {'status': 'licensed', 'url': 'https://example.invalid/license', 'spdx': 'CC-BY-NC-4.0'},
                'review': {'status': 'pending', 'reviewer': None, 'reviewed_at': None}}

    def translation(self, index=0, language='quh', bulletin=False):
        message = self.comm['data']['regional_bulletin'] if bulletin else self.comm['data']['messages'][index]
        text = f'Texto sintético de prueba en {language}, no es traducción real.'
        return {'kind': 'bulletin_translation' if bulletin else 'message_translation',
                'communication_id': message['communication_id'],
                'result_id': None if bulletin else message['result_id'],
                'case_id': None if bulletin else message['case_id'],
                'build_id': self.comm['build_id'], **self.mp3(f'{"b" if bulletin else index}.{language}.mp3'),
                'language': language, 'language_name': f'Prueba {language}', 'text': text,
                'text_sha256': text_sha256(text), 'source_text_sha256': text_sha256(message['text']),
                'translation': {'method': 'machine', 'model': 'unit-test-translator'},
                'voice': {'provider': 'unit-test', 'name': 'not-real-speech', 'language': language},
                'license': {'status': 'licensed', 'url': 'https://example.invalid/license'},
                'speaker_review': {'status': 'pending', 'reviewer': None, 'reviewed_at': None}}

    def write(self, *items):
        catalog = {'schema_version': '1.0', 'build_id': self.comm['build_id'], 'mode': self.comm['mode'], 'items': list(items)}
        write_json(self.assets / 'catalog.json', catalog)
        return catalog

    def test_translations_attach_beside_spanish_without_changing_it(self):
        self.write(self.spanish(), self.translation(), self.translation(language='ayr'), self.translation(bulletin=True))
        result = attach_audio(self.comm, self.assets, self.output)
        message = result['data']['messages'][0]
        self.assertEqual([t['language'] for t in message['translations']], ['ayr', 'quh'])
        self.assertTrue(all(t['status'] == 'available_fixture' for t in message['translations']))
        self.assertEqual(result['data']['regional_bulletin']['translations'][0]['language'], 'quh')
        self.assertEqual(validate_attached_audio(result, self.output)['audio_files'], 4)
        message.pop('translations')
        result['data']['regional_bulletin'].pop('translations')
        message['audio'] = deepcopy(self.comm['data']['messages'][0]['audio'])
        self.assertEqual(result, self.comm)

    def test_translation_without_spanish_audio_is_allowed_outside_production(self):
        self.write(self.translation(index=3))
        result = attach_audio(self.comm, self.assets, self.output)
        self.assertEqual(result['data']['messages'][3]['audio']['status'], 'unavailable')
        self.assertEqual(len(result['data']['messages'][3]['translations']), 1)

    def test_identity_language_and_provenance_fail_closed(self):
        mutations = [
            lambda x: x.update(source_text_sha256='0' * 64),
            lambda x: x.update(text_sha256='0' * 64),
            lambda x: x.update(text='Otro texto distinto'),
            lambda x: x.update(language='spa'),
            lambda x: x.update(language='es'),
            lambda x: x.update(language_name=''),
            lambda x: x['voice'].update(language='ayr'),
            lambda x: x.pop('translation'),
            lambda x: x.update(translation={'method': 'machine'}),
            lambda x: x.update(translation={'method': 'human'}),
            lambda x: x.update(speaker_review={'status': 'approved', 'reviewer': None, 'reviewed_at': None}),
            lambda x: x.update(case_id='Z-9'),
            lambda x: x.update(build_id='otro-build'),
            lambda x: x.update(kind='bulletin_translation'),
            lambda x: x.update(kind='otra_cosa'),
            lambda x: x.update(path='audio/es-0.mp3'),
            lambda x: x.update(duration_seconds=99),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                item = self.translation()
                mutate(item)
                self.write(self.spanish(), item)
                with self.assertRaises(ContractError):
                    attach_audio(self.comm, self.assets, self.output)

    def test_duplicate_language_rejected(self):
        self.write(self.translation(), self.translation())
        with self.assertRaises(ContractError):
            attach_audio(self.comm, self.assets, self.output)

    def test_bulletin_translation_limited_to_sixty_seconds(self):
        self.write(self.translation(bulletin=True) | self.mp3('largo.quh.mp3', frames=2300))
        with self.assertRaisesRegex(ContractError, '60 segundos'):
            attach_audio(self.comm, self.assets, self.output)

    def test_production_requires_speaker_review(self):
        comm = deepcopy(self.comm)
        comm['mode'] = 'simulated'
        message = comm['data']['messages'][0]
        message['review_status'] = 'approved'
        item = self.translation()
        with self.assertRaisesRegex(ContractError, 'hablante'):
            _validate_translation(item, message, comm, self.assets, production=True)
        item['speaker_review'] = {'status': 'approved', 'reviewer': 'Hablante real', 'reviewed_at': '2026-11-15T08:00:00-04:00'}
        _validate_translation(item, message, comm, self.assets, production=True)
        item['license']['status'] = 'pending_confirmation'
        with self.assertRaises(ContractError):
            _validate_translation(item, message, comm, self.assets, production=True)

    def test_package_lists_translation_mp3_and_marks_it_experimental(self):
        self.write(self.spanish(), self.translation())
        package = self.root / 'package'
        build(ROOT / 'fixtures/dev2-v31', package, audio_assets=self.assets)
        manifest = validate_package(package)
        self.assertIn('audio/0.quh.mp3', manifest['data']['files'])
        sheet = (package / 'print/fixture-a-1.html').read_text(encoding='utf-8')
        self.assertIn('EXPERIMENTAL', sheet)
        self.assertIn('lang="quh"', sheet)
        self.assertIn('CC-BY-NC-4.0', sheet)
        comm = read_json(package / 'data/communications.json')
        comm['data']['messages'][0]['translations'][0]['text'] = 'Texto cambiado después del build'
        write_json(package / 'data/communications.json', comm)
        with self.assertRaises(ContractError):
            validate_package(package)


class TranslationGuardTests(unittest.TestCase):
    def test_degenerate_machine_translation_is_rejected(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        from generate_audio_mms import check_translation
        source = 'Los indicadores de campaña y ciclo no están disponibles.'
        self.assertEqual(check_translation(source, 'Kay textoqa manam prediccionchu.'), 'Kay textoqa manam prediccionchu.')
        for bad in ('', 'Chayqa mana allinchu' + ', mana allinchu' * 28, 'x' * 500):
            with self.subTest(bad=bad[:30]), self.assertRaises(ContractError):
                check_translation(source, bad)


@unittest.skipUnless(importlib.util.find_spec('num2words'), 'num2words solo está en el entorno de voz .venv-tts')
class SpokenTextTests(unittest.TestCase):
    def test_numbers_dates_and_acronyms_become_words(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        from generate_audio_mms import spoken_spanish
        said = spoken_spanish('DEMOSTRACIÓN CON FIXTURE. Posición 2. Emisión editorial: 14/11/2026 a las 20:30 -0400. '
                              'Periodo 1981–2000, 12.5 mm y 40 % según KPI de NOAA.')
        self.assertNotRegex(said, r'\d')
        for expected in ('datos de ejemplo', 'posición dos', 'catorce de noviembre de dos mil veintiséis',
                         'veinte horas con treinta minutos, hora de bolivia', 'mil novecientos ochenta y uno a dos mil',
                         'doce coma cinco milímetros', 'cuarenta por ciento', 'indicadores', 'ene o a a'):
            self.assertIn(expected, said.lower())


if __name__ == '__main__':
    unittest.main()
