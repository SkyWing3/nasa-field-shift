# P6-3 · Registro de fuentes y afirmaciones permitidas

Revisado: 14-nov-2026, ~19:40 (hora de Bolivia), por P6.

## 1. Fuentes de datos
| Fuente | Rol | Estado | Nota |
| --- | --- | --- | --- |
| NASA POWER (diario, comunidad AG; `PRECTOTCORR`, `T2M_MIN`, `T2M_MAX`; viento `WS2M` si se usa) | Base climática | Usada por P6 en Colab el 14-nov; Dev 1 la descarga oficialmente (D1-2) | Reanálisis MERRA-2 (~50 km), no estación. https://power.larc.nasa.gov/ |
| NOAA ONI (`oni.ascii.txt`, CPC) | Clasificación externa Normal/Niño/Niña | Usada por P6; Dev 1 la versiona (D1-4) | No es NASA. ONI = Niño 3.4 (media de 3 meses). **No es Niño 1+2.** |
| NOAA CPC ENSO Diagnostic Discussion | Contexto del pronóstico vigente | Consultada el 14-nov | Emitida el 12-nov-2026: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml |
| IRI Columbia ENSO Quick Look | Contexto del pronóstico vigente | Solo resumen de búsqueda (no se pudo abrir la página) | https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/ |

## 2. Metodología del análisis "4 de 5" (recuperada)
- **Archivo:** `prueba_descarte_oruro.ipynb` (P6, Colab, 14-nov) + celda 8 (Niño fuerte).
- **Punto:** −17,97; −67,11. **Periodo:** 1981-01-01 a 2026-11-10.
- **Campaña:** suma de lluvia de noviembre de *y* a marzo de *y+1*; se excluye si tiene menos de 140 días.
- **Fase:** ONI del trimestre NDJ con YR = *y*. Niño ≥ 0,5; Niña ≤ −0,5; Normal entre ambos. **Niño fuerte:** ONI NDJ ≥ 1,5.
- **Normal de referencia:** promedio de las campañas con fase Normal (365 mm, n = 13), no el promedio de todos los años.
- **Resultado P6:** 4 de 5 Niños fuertes por debajo de la normal (1982-83 −37 %, 1997-98 −40 %, 2015-16 −36 %, 2023-24 −8 %; 2009-10 +30 %).
- **Estado:** `reproduced` (14-nov 21:10). Dev 1 lo reprodujo de forma independiente con `scripts/power_d1_2.py` (POWER descargado 14-nov 20:56 BOT, SHA-256 del original 4fe8a6ed…4924; 45 campañas completas; 2026-27 parcial excluida). Coincide con el cuaderno de P6: 230,11 / 219,77 / 472,51 / 234,90 / 336,35 mm; normal 364,80 mm (n = 13).
- **Re-ejecución en el punto final (14-nov 20:55, Obrajes -17,83; -67,00):** resultados **idénticos** a la ciudad de Oruro (normal 365 mm, n = 13; Niño 305 mm, n = 15; Niña 340 mm, n = 17; mismos 5 Niños fuertes; 4 de 5 bajo la normal). Interpretación: ambos puntos caen en la **misma celda de NASA POWER**, lo que confirma que el dato es regional.
- **Heladas con umbral de papa (≤ -2,5 °C):** días por campaña nov–mar en promedio Niña 1,2; Niño 0,8; Normal 1,4. Febreros con al menos una helada: 4 de 46 (9 %). No sacar conclusiones ENSO–helada (valores bajos y n pequeño).
- **Celda POWER:** ciudad de Oruro y Obrajes dan valores de campaña idénticos → misma celda (pregunta de Dev 1 cerrada).
- **Uso permitido:** "4 de 5 Niños fuertes desde 1981 tuvieron menos lluvia de noviembre a marzo que el promedio de las campañas Normales (datos NASA POWER, celda regional que incluye Obrajes)". Decir siempre n = 5 y que es una frecuencia histórica.

## 3. Afirmaciones
| Afirmación | Estado | Fuente / condición |
| --- | --- | --- |
| "NOAA (12-nov-2026): El Niño sigue fortaleciéndose y es probable un Niño fuerte a muy fuerte hasta enero–marzo de 2027." | **Permitida** (corrección 2 aprobada por la líder, 14-nov 22:45). Cita de pronóstico, siempre con fecha. | NOAA CPC, 12-nov-2026 |
| "NOAA estima ~60 % de probabilidad de un evento histórico (RONI ≥ +2,5 °C) en oct–dic y nov–ene." | Igual que la anterior. Aclarar que es **RONI**, no ONI. | NOAA CPC, 12-nov-2026 |
| "Niño 1+2 llegó a +4,4 °C" (frente a Perú) | Permitida (corrección 2 aprobada). Nombrarlo **Niño 1+2**, no ONI. | NOAA CPC, 12-nov-2026 |
| "+5 °C en Niño 1+2" | **No usar**: solo en el resumen del IRI, no verificado en la página. Usar el +4,4 °C de NOAA. | — |
| "El Niño más fuerte en décadas" | **No usar.** | No verificado en fuente primaria |
| "En el Altiplano, los años Niño tienden a tener menos lluvia de verano." | **Permitida** (consenso científico). | Garreaud y Aceituno 2001; Vuille y Keimig 2004, *J. Climate* |
| "4 de 5 Niños fuertes desde 1981 tuvieron menos lluvia nov–mar que las campañas Normales (celda POWER de Obrajes)." | **Permitida** (reproducida por P6 y Dev 1). Decir n = 5 y "frecuencia histórica". | Cuaderno P6 + `power_d1_2.py` |
| "Va a haber sequía en Oruro" / "todos los Niños son secos" | **Prohibida.** | Contradice el 2009-10 y el método |
| "Hasta 90 % de pérdida de papa por heladas 2025-26" | **No usar** en el relato del MVP: dato de prensa (CIPCA vía Correo del Sur), no reproducido. | — |
| Puntuaciones 17/25, 24/25 de los informes | **Prohibidas** como hechos o rúbrica oficial. | — |
| "Un productor de Obrajes nos contó que…" (testimonio, sin nombre) | **Permitida**: permiso concedido el 14-nov. Citar fiel a `nota_productor.md`. | Nota P6-1 |
| "Validado con el productor" | **Prohibida.** Decir "calendario aportado por un productor de Oruro; orden y riego por confirmar". | Nota P6-1 |

## 4. Reglas que se mantienen
- NASA POWER se llama "reanálisis", no "medición". Un contraste con otro reanálisis no se llama "validación en campo".
- Niño 1+2, ONI y RONI se nombran por separado.
- El pronóstico vigente no se usa como entrada del cálculo; el análisis es retrospectivo.
