"""Casos de borde de las reglas científicas de D1-2 (sin red)."""

import unittest
from datetime import date, timedelta

from power_d1_2 import campaign, normalize, phase, validate_public_point


class CampaignRulesTest(unittest.TestCase):
    def test_public_delivery_rejects_coordinates_with_finer_precision(self):
        validate_public_point(-17.83, -67.00)
        with self.assertRaisesRegex(ValueError, "punto redondeado"):
            validate_public_point(-17.83 - 0.003, -67.00)

    def test_140_valid_days_are_included_without_imputing_missing_rain(self):
        rain = {(date(2024, 11, 1) + timedelta(days=i)).isoformat(): 2 for i in range(140)}
        result = campaign(2024, rain, {2024: 0.49}, date(2025, 3, 31))
        self.assertTrue(result["incluida_analisis"])
        self.assertEqual(result["lluvia_campania_mm"], 280)
        self.assertEqual(result["dias_faltantes_transcurridos"], 11)

    def test_139_valid_days_are_excluded(self):
        rain = {(date(2024, 11, 1) + timedelta(days=i)).isoformat(): 2 for i in range(139)}
        result = campaign(2024, rain, {2024: 0.49}, date(2025, 3, 31))
        self.assertFalse(result["incluida_analisis"])
        self.assertIsNone(result["lluvia_campania_mm"])
        self.assertEqual(result["lluvia_observada_mm"], 278)

    def test_partial_campaign_is_excluded_even_with_140_valid_days(self):
        rain = {(date(2026, 11, 1) + timedelta(days=i)).isoformat(): 1 for i in range(140)}
        result = campaign(2026, rain, {}, date(2027, 3, 20))
        self.assertFalse(result["completa"])
        self.assertFalse(result["incluida_analisis"])
        self.assertIsNone(result["fase_enso"])

    def test_november_march_boundaries_and_leap_day(self):
        rain = {"2023-10-31": 1000, "2023-11-01": 2, "2024-02-29": 3,
                "2024-03-31": 4, "2024-04-01": 1000}
        result = campaign(2023, rain, {2023: 1.5}, date(2024, 4, 1))
        self.assertEqual(result["dias_esperados"], 152)
        self.assertEqual(result["lluvia_observada_mm"], 9)
        self.assertTrue(result["nino_fuerte"])

    def test_enso_thresholds_and_missing_values(self):
        self.assertEqual(phase(-0.5), "Niña")
        self.assertEqual(phase(0.5), "Niño")
        self.assertEqual(phase(0.49), "Normal")
        self.assertIsNone(phase(None))
        self.assertIsNone(normalize(-999, -999))
        self.assertEqual(normalize(0, -999), 0)
        self.assertEqual(normalize(-2.5, -999), -2.5)


if __name__ == "__main__":
    unittest.main()
