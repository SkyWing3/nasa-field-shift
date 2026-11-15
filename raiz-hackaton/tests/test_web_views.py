"""Estadísticas descriptivas y calendario web, comprobados contra días explícitos."""
from copy import deepcopy
from datetime import date
from statistics import mean
import unittest

from raiz_data import agro
from raiz_data.web import campaign_days, climate_views, coverage_calendar, enrich


def climate_fixture():
    days = [d for y in [1999, 2000] for d in campaign_days(y)]
    return {'sources': [{'source_id': 'nasa-power-daily', 'spatial_resolution': 'celda de prueba'}],
            'data': {'series': [{'variable': name, 'values': [{'date': d.isoformat(), 'value': value} for d in days]}
                                for name, value in [('PRECTOTCORR', 2), ('T2M_MAX', 12), ('T2M_MIN', -1)]]}}


PERIODS = [{'period_id': 'test', 'start_campaign_year': 1999, 'end_campaign_year': 2000, 'label': '1999–2000'}]


class ClimateViewsTests(unittest.TestCase):
    def test_leap_year_and_statistics_are_per_complete_campaign(self):
        view = climate_views(climate_fixture(), PERIODS, {('NDJ', 1999): 1.5, ('NDJ', 2000): -0.5})
        summaries = {r['variable']: r for r in view['period_summaries']}
        self.assertEqual(len(list(campaign_days(1999))), 152)
        self.assertEqual(len(list(campaign_days(2000))), 151)
        self.assertEqual(summaries['precip_campaign']['value'], 303)
        self.assertEqual(summaries['precip_campaign']['sd'], 1)
        self.assertEqual(summaries['frost_days']['value'], 151.5)
        self.assertEqual(summaries['tmax_mean']['value'], 12)
        self.assertEqual(summaries['precip_campaign']['n_campaigns'], 2)
        self.assertEqual(view['campaigns'][0]['enso_phase'], 'Niño')
        self.assertTrue(view['campaigns'][0]['strong_nino'])
        self.assertEqual(view['campaigns'][1]['enso_phase'], 'Niña')
        self.assertEqual(len(view['decade_summaries']), 8)

    def test_missing_day_excludes_campaign_only_for_affected_variable(self):
        doc = climate_fixture()
        doc['data']['series'][0]['values'][0]['value'] = None
        view = climate_views(doc, PERIODS, {})
        rain = next(r for r in view['period_summaries'] if r['variable'] == 'precip_campaign')
        temp = next(r for r in view['period_summaries'] if r['variable'] == 'tmax_mean')
        self.assertEqual((rain['n_campaigns'], rain['n_missing'], rain['value']), (1, 1, 302))
        self.assertEqual(temp['n_campaigns'], 2)
        self.assertFalse(view['campaigns'][0]['complete'])
        self.assertIsNone(view['campaigns'][0]['enso_phase'])
        self.assertIsNotNone(view['campaigns'][0]['missing_reason'])

    def test_no_complete_campaign_is_null_not_zero(self):
        doc = climate_fixture()
        doc['data']['series'][0]['values'] = []
        row = climate_views(doc, PERIODS, {})['period_summaries'][0]
        self.assertIsNone(row['value'])
        self.assertIsNone(row['sd'])
        self.assertEqual(row['n_campaigns'], 0)
        self.assertEqual(row['n_missing'], 2)
        self.assertTrue(row['missing_reason'])


class CoverageTests(unittest.TestCase):
    def test_calendar_uses_actual_daily_crop_plan(self):
        calendar = coverage_calendar('papa', [1999, 2000])
        self.assertEqual([m['month'] for m in calendar], [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7])
        april = next(m for m in calendar if m['month'] == 4)
        plans = [agro.campaign_plan('papa', y) for y in [1999, 2000]]
        values = [entry[2] for plan in plans for day, entry in plan.items() if day.month == 4]
        self.assertEqual(april['mean_coverage_pct'], round(100 * mean(values), 1))
        self.assertEqual(set(april['days_by_cover_mean']), {'crop', 'residue'})
        self.assertEqual(next(m for m in calendar if m['month'] == 8)['cover'], 'residue')

    def test_fallow_is_partial_vegetation_and_not_full_soil_protection(self):
        rows = coverage_calendar('descanso', [1999])
        self.assertTrue(all(m['cover'] == 'fallow_vegetation' and m['mean_coverage_pct'] == 25 for m in rows))
        self.assertTrue(all(m['bare_days_mean'] > 0 for m in rows))
        self.assertEqual(coverage_calendar('papa', []), [])

    def test_enrichment_keeps_kpi_and_source_input_unchanged_and_is_reproducible(self):
        env = {'build_id': 'test-v1', 'mode': 'simulated'}
        docs = {'catalog.json': {**env, 'data': {'periods': PERIODS, 'soil_profiles': [{'soil_profile_id': 'used'}, {'soil_profile_id': 'unused'}],
                 'water_budgets': [{'water_budget_id': 'secano'}]}},
                'climate.json': {**climate_fixture(), **env},
                'results.json': {**env, 'sources': [{'source_id': 'noaa-cpc-oni'}], 'data': {'records': [
                    {'build_id': 'test-v1', 'soil_profile_id': 'used', 'water_budget_id': 'secano', 'decision_crop': 'papa',
                     'windows': [{'campaign_years': [1999, 2000, 2001]}], 'decision_kpis': {'x': {'value': 7}}, 'cycle_kpis': {'x': {'value': 12}}}]}}}
        before = deepcopy(docs)
        output = enrich(docs, {})
        self.assertEqual(docs, before)
        self.assertEqual(output, enrich(docs, {}))
        self.assertEqual(output['results.json']['data']['records'][0]['decision_kpis'], {'x': {'value': 7}})
        self.assertNotEqual(output['catalog.json']['build_id'], 'test-v1')
        self.assertFalse(output['catalog.json']['data']['presentation']['ranking_enabled'])
        self.assertEqual(output['results.json']['data']['records'][0]['derived_from_build_id'], 'test-v1')
        self.assertEqual(len(output['catalog.json']['data']['soil_profiles']), 1)


if __name__ == '__main__':
    unittest.main()
