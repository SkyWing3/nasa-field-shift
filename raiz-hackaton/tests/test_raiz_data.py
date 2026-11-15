"""Pruebas del módulo de datos (D1): ecuaciones FAO-56 contra sus ejemplos resueltos, balance, ENSO, ranking y alertas."""
from datetime import date, timedelta
import json
import math
from pathlib import Path
import shutil
import unittest
from uuid import uuid4

from raiz_data import agro, alerts, scenarios, verify

ROOT = Path(__file__).resolve().parents[1]


class Fao56Tests(unittest.TestCase):
    def test_extraterrestrial_radiation_example_8(self):
        # FAO-56 ejemplo 8: 20° S, 3 de septiembre → Ra = 32,2 MJ m-2 día-1
        self.assertAlmostEqual(agro.extraterrestrial(-20.0, date(2026, 9, 3)), 32.2, delta=0.2)

    def test_penman_monteith_example_18(self):
        # FAO-56 ejemplo 18 (Bruselas, 6 de julio): ET0 = 3,9 mm/día
        ea = 1.409
        tdew = 237.3 * math.log(ea / 0.6108) / (17.27 - math.log(ea / 0.6108))
        ra = agro.extraterrestrial(50.8, date(2026, 7, 6))
        et0 = agro.et0_penman_monteith(21.5, 12.3, tdew, 22.07, 2.078, 100.1, ra, 100)
        self.assertAlmostEqual(et0, 3.9, delta=0.1)

    def test_scs_runoff(self):
        self.assertEqual(agro.runoff(10.0), 0.0)
        self.assertAlmostEqual(agro.runoff(50.0), 9.29, delta=0.05)


def synthetic_climate(start, years, rain_every=4, rain_mm=12.0):
    out, day = {}, start
    while day < date(start.year + years, 12, 31):
        out[day] = {'PRECTOTCORR': rain_mm if day.toordinal() % rain_every == 0 else 0.0, 'T2M_MAX': 18.0, 'T2M_MIN': 1.0,
                    'WS2M_MAX': 5.0, 'WS2M': 2.0}
        day += timedelta(days=1)
    return out


class BalanceTests(unittest.TestCase):
    soil = {'theta_fc': 0.29, 'theta_wp': 0.14}

    def test_balance_closes_exactly_with_declared_adjustment(self):
        climate = synthetic_climate(date(2001, 1, 1), 5)
        et0 = {d: 4.0 for d in climate}
        for crops in (['papa', 'quinua', 'descanso'], ['haba', 'descanso', 'papa']):
            for budget in (None, 0, 100):
                for c in agro.simulate([2001, 2002, 2003], crops, climate, et0, self.soil, budget):
                    closure = (c['storage_end'] - c['storage_start']) - (c['rain'] - c['runoff'] + c['irrigation'] - c['eta'] - c['drainage'] + c['adjust'])
                    self.assertLess(abs(closure), 1e-6)

    def test_no_rain_means_full_stress_and_budget_is_respected(self):
        climate = synthetic_climate(date(2001, 1, 1), 5, rain_mm=0.0)
        et0 = {d: 5.0 for d in climate}
        dry = agro.simulate([2001, 2002, 2003], ['papa', 'quinua', 'haba'], climate, et0, self.soil, 0)
        self.assertGreater(dry[0]['stress_days'], 0.8 * dry[0]['crop_days'])
        limited = agro.simulate([2001, 2002, 2003], ['papa', 'quinua', 'haba'], climate, et0, self.soil, 100)
        self.assertTrue(all(c['irrigation'] <= 100 + 1e-9 for c in limited))
        free = agro.simulate([2001, 2002, 2003], ['papa', 'quinua', 'haba'], climate, et0, self.soil, None)
        self.assertGreater(free[0]['irrigation'], limited[0]['irrigation'])
        self.assertEqual(free[0]['stress_days'], 0)

    def test_flowering_frost_uses_stage_threshold(self):
        # Tmin −1,5 °C todo el ciclo: la haba (floración −1, letal −5) solo cuenta helada en floración (etapa media).
        climate = synthetic_climate(date(2001, 1, 1), 5)
        for c in climate.values():
            c['T2M_MIN'] = -1.5
        sim = agro.simulate([2001, 2002, 2003], ['haba', 'descanso', 'papa'], climate, {d: 4.0 for d in climate}, self.soil, 0)
        mid = agro.CROPS['haba']['stages'][2]
        self.assertEqual(sim[0]['flowering_frost_days'], mid)
        self.assertEqual(sim[0]['thermal_days'], mid)
        self.assertEqual(sim[2]['thermal_days'], 0)  # papa: umbral −2,5 °C no se alcanza

    def test_fallow_has_no_crop_days(self):
        climate = synthetic_climate(date(2001, 1, 1), 5)
        sim = agro.simulate([2001, 2002, 2003], ['descanso', 'papa', 'quinua'], climate, {d: 4.0 for d in climate}, self.soil, 0)
        self.assertEqual(sim[0]['crop_days'], 0)
        self.assertEqual(sim[1]['crop_days'], agro.season_length('papa'))


class ScenarioTests(unittest.TestCase):
    def test_enso_thresholds(self):
        self.assertEqual(scenarios.phase_of(1.6), ['Niño', 'Niño fuerte'])
        self.assertEqual(scenarios.phase_of(0.5), ['Niño'])
        self.assertEqual(scenarios.phase_of(-0.6), ['Niña'])
        self.assertEqual(scenarios.phase_of(0.2), ['Normal'])

    def test_nine_cases_are_cyclic(self):
        cases = scenarios.cases()
        self.assertEqual(len(cases), 9)
        self.assertEqual(next(c for c in cases if c['case_id'] == 'A-3')['campaigns'], ['descanso', 'papa', 'quinua'])

    def test_ranking_competition_with_ties(self):
        def rec(rid, stress):
            group = {name: {'value': 10.0} for name in scenarios.RANK_WEIGHTS}
            group['water_stress_days'] = {'value': stress}
            return {'result_id': rid, 'cycle_kpis': group}
        records = [rec('a', 10.0), rec('b', 10.0), rec('c', 50.0)]
        scenarios.rank(records)
        self.assertEqual([r['ranking'] for r in records], [1, 1, 3])
        self.assertEqual(records[0]['ranking_method'], records[2]['ranking_method'])


@unittest.skipUnless((ROOT / 'datos' / 'results.json').exists(), 'Requiere `python -m raiz_data procesar`')
class PackageTests(unittest.TestCase):
    def test_real_package_passes_dev2_contract(self):
        from raiz_delivery.contracts import load_inputs
        from raiz_delivery.analysis import analyze_inputs
        report = analyze_inputs(load_inputs(ROOT / 'datos'))
        self.assertEqual(report['status'], 'structurally_valid_precalculated_inputs')
        self.assertEqual(report['case_count'], 9)


class VerifyAndAlertTests(unittest.TestCase):
    def setUp(self):
        self.tmp = ROOT / 'build' / 'test-runs' / uuid4().hex
        self.tmp.mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_spearman(self):
        self.assertAlmostEqual(verify.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(verify.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)

    def test_distance_and_direction(self):
        d = alerts.distance_km(-17.97153, -67.0932, -18.289, -66.83583)
        self.assertAlmostEqual(d, 44, delta=2)
        self.assertEqual(alerts.direction(-17.97153, -67.0932, -18.289, -66.83583), 'sureste')

    def test_fire_near_locality_creates_cited_draft(self):
        csv_path = self.tmp / 'firms-test.csv'
        csv_path.write_text('latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n'
                            '-18.30,-66.85,330,0.4,0.4,2026-11-14,1830,N20,n,2.0NRT,290,5.1,D\n', encoding='utf-8')
        result = alerts.fires({'firms-test.csv': csv_path})
        self.assertEqual(len(result), 1)
        self.assertIn('Huanuni', result[0]['texto'])
        self.assertIn('pendiente de confirmación oficial', result[0]['texto'])
        far = self.tmp / 'firms-far.csv'
        far.write_text(csv_path.read_text(encoding='utf-8').replace('-18.30,-66.85', '-12.00,-60.00'), encoding='utf-8')
        self.assertEqual(alerts.fires({'firms-far.csv': far}), [])

    def test_approval_requires_a_person(self):
        with self.assertRaises(ValueError):
            alerts.aprobar('cualquiera', '  ')


if __name__ == '__main__':
    unittest.main()
