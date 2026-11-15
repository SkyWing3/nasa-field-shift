# Resultados del modelo (generado automáticamente)

Build `raiz-oruro-power-20261111-v1` · datos hasta 2026-11-11 · generado 2026-11-15T05:39:08+00:00.
No editar a mano: `python -m raiz_data procesar` y luego `python -m raiz_data informe`.

## 1. Papa en secano por periodo y fase ENSO (campaña de decisión, caso A-1)

| Periodo | ENSO | n | Años | Lluvia campaña (mm) | ETa/ETc | Estrés severo (días) | Riego necesario (mm) | Campaña aceptable | Estrés con lluvia SENAMHI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1981-2000 | Normal | 7 | 1981, 1985, 1989, 1990, 1992, 1993, 1996 | 419.3 | 0.467 | 111,3 | 437 | 0/7 | 116,1 |
| 1981-2000 | Niño | 6 | 1982, 1986, 1987, 1991, 1994, 1997 | 355.7 | 0.374 | 131,8 | 533 | 0/6 | 134,3 |
| 1981-2000 | Niña | 5 | 1983, 1984, 1988, 1995, 1998 | 411.1 | 0.453 | 125,0 | 461 | 0/5 | 127,2 |
| 1981-2000 | Niño fuerte | 2 | 1982, 1997 | 313.7 | 0.326 | 146,0 | 584 | 0/2 | 148,5 |
| 2001-2025 | Normal | 5 | 2001, 2003, 2012, 2013, 2016 | 441.6 | 0.481 | 111,8 | 444 | 0/5 | 115,6 |
| 2001-2025 | Niño | 9 | 2002, 2004, 2006, 2009, 2014, 2015, 2018, 2019, 2023 | 511.8 | 0.472 | 112,3 | 447 | 0/9 | 115,8 |
| 2001-2025 | Niña | 9 | 2005, 2007, 2008, 2010, 2011, 2017, 2020, 2021, 2022 | 416.4 | 0.447 | 118,2 | 448 | 0/9 | 120,3 |
| 2001-2025 | Niño fuerte | 3 | 2009, 2015, 2023 | 420.1 | 0.448 | 113,0 | 471 | 0/3 | 117,3 |

## 2. Escenario actual: 2001–2025, Niño fuerte, secano (orden por ciclo de 3 campañas)

El Niño en curso: ONI ASO 2026 = +2,46 (NOAA CPC). Las ventanas análogas son las campañas con ONI NDJ ≥ 1,5.

| Puesto | Caso | Rotación | Cultivo este año | Puntaje | Estrés decisión (d) | Riego decisión (mm) | Estrés ciclo (d) | Riego ciclo (mm) | Lluvia erosiva expuesta ciclo (d) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A-2 | papa-quinua-descanso | quinua | 0.6705 | 78,0 | 329 | 191,3 | 770 | 8,0 |
| 2 | A-1 | papa-quinua-descanso | papa | 0.6691 | 113,0 | 471 | 182,0 | 761 | 8,3 |
| 3 | A-3 | papa-quinua-descanso | descanso | 0.668 | — | 0 | 177,0 | 762 | 6,7 |
| 4 | C-3 | papa-haba-descanso | descanso | 0.5401 | — | 0 | 221,7 | 920 | 7,0 |
| 5 | C-2 | papa-haba-descanso | haba | 0.5146 | 120,7 | 500 | 234,0 | 940 | 8,3 |
| 6 | B-1 | papa-quinua-haba | papa | 0.4736 | 113,0 | 471 | 306,0 | 1258 | 2,7 |
| 7 | B-3 | papa-quinua-haba | haba | 0.4005 | 120,7 | 500 | 297,7 | 1261 | 2,7 |
| 8 | C-1 | papa-haba-descanso | papa | 0.3925 | 113,0 | 471 | 238,3 | 1001 | 9,7 |
| 9 | B-2 | papa-quinua-haba | quinua | 0.3543 | 78,0 | 329 | 314,7 | 1297 | 3,7 |

Pesos: {"water_stress_days": 0.3, "net_irrigation_requirement_mm": 0.2, "thermal_exposure_days": 0.15, "bare_rain_exposure_days": 0.15, "bare_wind_exposure_days": 0.1, "planned_coverage_pct": 0.1}. Las rotaciones con descanso tienen menos campañas cultivadas: menos agua y estrés, pero también menos producción, que no se cuantifica.

## 3. Verificación externa

### SENAMHI (estación Oruro – Ciudad) frente a NASA POWER

Normal nov–mar 1991–2020: SENAMHI 320.5 mm · POWER 331.3 mm (sesgo +3 %). 4/6 periodos con anomalía del mismo signo.

| Periodo | SENAMHI (mm) | Anomalía SENAMHI | POWER (mm) | Anomalía POWER | Mismo signo |
| --- | --- | --- | --- | --- | --- |
| 2025-12 | 115.6 | +104 % | 82.8 | +16 % | sí |
| 2026-01 | 142.3 | +44 % | 100.0 | +4 % | sí |
| 2025-11..2026-01 | 306.7 | +69 % | 216.2 | +9 % | sí |
| 2026-03 | 90.6 | +68 % | 65.5 | +22 % | sí |
| 2026-01..2026-03 | 263.9 | +11 % | 191.9 | -16 % | no |
| 2026-04 | 33.8 | +133 % | 12.4 | -23 % | no |

Factores de corrección mensual usados en la sensibilidad (normal SENAMHI / normal POWER): mes 11: 0.851, mes 12: 0.797, mes 1: 1.021, mes 2: 1.076, mes 3: 1.005, mes 4: 0.901.

### INE: rendimiento departamental de Oruro frente al agua simulada

| Cultivo | Campañas | Spearman (ETa/ETc vs. anomalía de rendimiento) | 3 campañas más secas simuladas (anomalía kg/ha) |
| --- | --- | --- | --- |
| papa | 1983-2024 | 0.25 | 1991 (-847); 2022 (-1337); 2003 (+567) |
| quinua | 1983-2024 | 0.42 | 1991 (-144); 2022 (-224); 1988 (-121) |
| haba | 1983-2024 | 0.02 | 1991 (-88); 2022 (-31); 1998 (+131) |

### Eventos reportados (VIDECI y prensa que lo cita)

| Campaña | Tipo | Lluvia nov–mar POWER (mm) | Percentil | Veredicto |
| --- | --- | --- | --- | --- |
| 1982 | sequía | 230 | 13 | coincide; sequía: lluvia nov–mar en el tercio más seco |
| 2015 | sequía | 235 | 16 | coincide; sequía: lluvia nov–mar en el tercio más seco |
| 2022 | sequía | 193 | 7 | coincide; sequía: lluvia nov–mar en el tercio más seco |
| 2023 | helada/sequía | 336 | 56 | no coincide; sequía: lluvia en percentil 56, no en el tercio más seco; helada: POWER (celda ~50 km) no registra Tmin ≤ −2 °C; subestima heladas locales |
| 2025 | helada | 308 | 40 | no coincide; helada: POWER (celda ~50 km) no registra Tmin ≤ −2 °C; subestima heladas locales |

### Calendario: 3/3 fechas de siembra dentro de las épocas reportadas.

### NASA MERRA-2: Spearman 0.9 entre humedad de zona radicular (GWETROOT) y ETa/ETc simulada (43 campañas). MERRA-2 comparte la lluvia de entrada con POWER: confirma la física del balance, no la lluvia.

