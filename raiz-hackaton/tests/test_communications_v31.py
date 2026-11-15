"""Mensajes, equivalencia imprimible y reglas editoriales sobre datos de prueba."""
import copy
import unittest
from html.parser import HTMLParser
from pathlib import Path

from raiz_delivery.communications import editorial_state, make_communications
from raiz_delivery.contracts import ContractError, load_inputs
from raiz_delivery.print_sheet import render_index, render_sheet

ROOT = Path(__file__).resolve().parents[1]


class Tags(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class CommunicationsV31Tests(unittest.TestCase):
    def docs(self):
        return copy.deepcopy(load_inputs(ROOT / 'fixtures/dev2-v31'))

    def test_nine_cases_reference_their_own_selection_and_text(self):
        docs = self.docs()
        comm = make_communications(docs)
        self.assertEqual(len(comm['data']['messages']), 9)
        for record, message in zip(docs['results.json']['data']['records'], comm['data']['messages']):
            for field in ('result_id', 'build_id', 'rotation_id', 'case_id', 'position_id', 'decision_crop'):
                self.assertEqual(message[field], record[field])
            self.assertEqual(message['print_sheet']['selected_case_id'], record['case_id'])
            self.assertEqual(len(message['print_sheet']['alternatives']), 3)
            self.assertEqual(len(message['print_sheet']['cases']), 9)
            html = render_sheet(message)
            self.assertIn(message['text'], html)
            self.assertIn(message['result_id'], html)
            self.assertIn('FIXTURE', html)
            self.assertIn('No disponibles', html)

    def test_real_message_projects_existing_metrics_without_new_science(self):
        docs = self.docs()
        source = docs['results.json']
        source['mode'] = 'simulated'
        record = source['data']['records'][0]
        record.update(n_windows=2, n_unique_campaigns=4, period_id='period-test', enso_initial_phase='Niño', water_budget_id='budget-test')
        record['decision_kpis'] = {'water_stress_days': {'value': 12, 'unit': 'días', 'method': 'TEST ONLY', 'nature': 'simulated'}}
        record['cycle_kpis'] = {'water_stress_days': {'value': 44, 'unit': 'días', 'method': 'TEST ONLY', 'nature': 'simulated'}}
        message = make_communications(docs)['data']['messages'][0]
        self.assertIn('Campaña de decisión: días de estrés hídrico: 12 días', message['text'])
        self.assertIn('Ciclo completo de tres campañas: días de estrés hídrico: 44 días', message['text'])
        self.assertIn('Muestra insuficiente', message['text'])
        self.assertEqual(message['status'], 'draft_pending_review')
        self.assertEqual(message['print_sheet']['n_windows'], 2)
        self.assertIn('KPI de campaña de decisión', render_sheet(message))
        self.assertIn('>44<', render_sheet(message))

    def test_null_metric_has_reason_in_text_instead_of_zero(self):
        docs = self.docs()
        docs['results.json']['mode'] = 'simulated'
        docs['results.json']['data']['records'][0]['decision_kpis'] = {'water_stress_days': {'value': None, 'unit': 'días', 'missing_reason': 'sin umbral revisado'}}
        text = make_communications(docs)['data']['messages'][0]['text']
        self.assertIn('no disponible (sin umbral revisado)', text)
        self.assertNotIn('estrés hídrico: 0', text)

    def test_editorial_dates_do_not_change_date_of_data(self):
        docs = self.docs()
        editorial = {'issued_at': '2026-11-14T18:00:00-04:00', 'valid_until': '2026-11-15T11:00:00-04:00'}
        comm = make_communications(docs, editorial)
        for message in comm['data']['messages']:
            self.assertEqual(message['issued_at'], editorial['issued_at'])
            self.assertEqual(message['valid_until'], editorial['valid_until'])
            self.assertIsNone(message['data_as_of'])
            self.assertEqual(message['review_status'], 'pending_p5_p6')

    def test_exact_editorial_boundaries_and_timezone(self):
        item = {'issued_at': '2026-11-14T18:00:00-04:00', 'valid_until': '2026-11-15T11:00:00-04:00'}
        self.assertEqual(editorial_state(item, '2026-11-14T17:59:59-04:00'), 'not_yet_valid')
        self.assertEqual(editorial_state(item, '2026-11-14T18:00:00-04:00'), 'current')
        self.assertEqual(editorial_state(item, '2026-11-15T11:00:00-04:00'), 'expired')
        self.assertEqual(editorial_state({}, '2026-11-15T11:00:00-04:00'), 'not_issued')
        for editorial in ({'issued_at': item['issued_at']}, {'issued_at': item['valid_until'], 'valid_until': item['issued_at']}, {'issued_at': '2026-11-14T18:00:00', 'valid_until': item['valid_until']}):
            with self.subTest(editorial=editorial), self.assertRaises(ContractError):
                make_communications(self.docs(), editorial)

    def test_approval_requires_actual_attribution(self):
        with self.assertRaises(ContractError):
            make_communications(self.docs(), {'review_status': 'approved'})
        config = {'review_status': 'approved', 'reviewer': 'test reviewer, not production', 'reviewed_at': '2026-11-14T19:00:00-04:00'}
        message = make_communications(self.docs(), config)['data']['messages'][0]
        self.assertEqual(message['review_status'], 'approved')
        self.assertEqual(message['status'], 'draft_fixture')

    def test_fixture_bulletin_is_short_general_and_not_broadcast(self):
        bulletin = make_communications(self.docs())['data']['regional_bulletin']
        self.assertLessEqual(len(bulletin['text'].split()), 100)
        self.assertIn('fixture', bulletin['text'])
        self.assertIn('Oruro', bulletin['text'])
        self.assertNotIn('latitude', bulletin['text'])
        self.assertNotIn('-17', bulletin['text'])
        self.assertEqual(bulletin['distribution_status'], 'prepared_not_broadcast')

    def test_untrusted_text_is_escaped_and_not_executable(self):
        comm = make_communications(self.docs())
        message = comm['data']['messages'][0]
        message['text'] = '<script>alert("unsafe")</script>'
        message['print_sheet']['limitations'] = ['<img src=x onerror=alert(1)>']
        html = render_sheet(message)
        self.assertNotIn('<script>alert', html)
        self.assertNotIn('<img src=x', html)
        self.assertIn('&lt;script&gt;', html)

    def test_audio_is_voluntary_local_and_matches_result(self):
        comm = make_communications(self.docs())
        message = comm['data']['messages'][0]
        message['audio'] = {'status': 'available_fixture', 'path': '/audio/' + message['result_id'] + '.mp3'}
        sheet = Tags(render_sheet(message))
        index = Tags(render_index(comm))
        sheet_audio = next(attrs for tag, attrs in sheet.tags if tag == 'audio')
        index_audio = next(attrs for tag, attrs in index.tags if tag == 'audio')
        self.assertEqual(sheet_audio['src'], '../audio/' + message['result_id'] + '.mp3')
        self.assertEqual(index_audio['src'], './audio/' + message['result_id'] + '.mp3')
        self.assertIn('controls', sheet_audio)
        self.assertEqual(sheet_audio['preload'], 'none')
        self.assertNotIn('autoplay', sheet_audio)
        self.assertTrue(any(tag == 'a' and 'download' in attrs for tag,attrs in sheet.tags))
        for path in ('https://outside.test/voice.mp3', '/audio/../../secret.mp3', '/audio/x.mp3?token=secret'):
            message['audio']['path'] = path
            self.assertFalse(any(tag == 'audio' for tag,_ in Tags(render_sheet(message)).tags))

    def test_audio_of_another_result_or_unreviewed_real_content_is_not_playable(self):
        message = make_communications(self.docs())['data']['messages'][0]
        message['audio'] = {'status': 'available_fixture', 'path': '/audio/demo.mp3', 'result_id': 'different-result'}
        self.assertFalse(any(tag == 'audio' for tag,_ in Tags(render_sheet(message)).tags))
        message['audio'] = {'status': 'available', 'path': '/audio/demo.mp3'}
        self.assertFalse(any(tag == 'audio' for tag,_ in Tags(render_sheet(message)).tags))


if __name__ == '__main__':
    unittest.main()
