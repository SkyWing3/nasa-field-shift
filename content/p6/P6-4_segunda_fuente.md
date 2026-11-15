# P6-4 · Inventario de segunda fuente de lluvia (corte 22:00, 14-nov-2026)

**Punto:** Obrajes, celda POWER regional (punto publicado -17,83; -67,00). **Variable:** lluvia diaria, campañas nov–mar, 1981-82 a 2025-26.

## Resultado al corte (14-nov, 21:40)
**Estado: `unavailable`.** Se intentó CHIRPS por dos vías y ninguna dio una serie diaria utilizable:
1. **NOAA ERDDAP:** la serie está incompleta (4.481 días entre 1984 y 2026, cuando deberían ser unos 15.400), así que ninguna campaña llega a los 140 días válidos.
2. **IRI Data Library:** devuelve una página HTML en vez de un CSV.

**Consecuencia para el speech:**
- El "4 de 5" se presenta como una **frecuencia histórica de una sola fuente (NASA POWER, n = 5)**, reproducida de forma independiente por dos miembros del equipo.
- **No** se dice "confirmado con dos fuentes".
- La literatura respalda MERRA-2 (la base de POWER) como una de las fuentes con menor error en los Andes y el Altiplano (ver más abajo).

**Después de la hackatón:**
- descargar CHIRPS completo (UCSB o Google Earth Engine);
- pedir la serie de la estación de Oruro a SENAMHI.

## Decisión (diseño original)
**Contraste principal: CHIRPS v2 diario.** Es la fuente que mejor cumple los criterios: cubre todo el periodo, es descargable sin cuenta, tiene licencia abierta y fue evaluada en el Altiplano boliviano.

- **SENAMHI (estación):** existe, pero no hay serie diaria descargable hoy (`unavailable` para el MVP).
- **IMERG:** contraste secundario opcional, solo desde 2000-01, con un sesgo conocido en el Altiplano.

## Inventario
| Fuente | Tipo | Cobertura | Acceso y licencia | Evidencia en Bolivia | Estado |
| --- | --- | --- | --- | --- | --- |
| **CHIRPS v2.0 diario, 0,05°** (UCSB/USGS, no NASA) | Satélite infrarrojo + estaciones | 1981 → presente (fuente UCSB); el espejo ERDDAP de NOAA solo cubre 1984-01 a 2026-06; respaldo: IRI Data Library | Sin cuenta, por punto (NOAA ERDDAP `chirps20GlobalDailyP05`). Dominio público (CC0) | Remote Sensing 2024 (2002–2020): CHIRPS estimó mejor las cantidades de lluvia, con sesgos relativos menores al 10 % en las tres regiones | **Elegida** |
| **GPM IMERG Final diario V07, 0,1°** (NASA) | Multisatélite | Desde 2000-06; versión Final con ~4 meses de retraso | Cuenta Earthdata; Giovanni o GES DISC | Mismo estudio: IMERG sobreestimó la lluvia hasta un 75 % en el Altiplano | Opcional, solo como sensibilidad 2000+ |
| **SENAMHI Oruro-Ciudad / Oruro-Aeropuerto** | Estación (medición) | Series largas; boletines mensuales públicos | Sin descarga diaria abierta; se pide por canal oficial. El INE publica estadísticas meteorológicas mensuales por estación (catálogo ANDA) | Referencia de terreno | `unavailable` para el MVP; dejar el pedido documentado |
| **MSWEP V2.2** | Mezcla estaciones + satélite + reanálisis | 1979+ | Licencia restringida | MDPI 2025: mejor puntaje en el Altiplano (CAI 0,91 frente a 0,80 de CHIRPS) | Descartada por licencia y tiempo |
| **ERA5 / ERA5-Land** | Reanálisis | 1950+ | Cuenta Copernicus | ERA5-Land con el menor puntaje en el Altiplano (MDPI 2025) | Descartada |

## Qué dice la literatura sobre nuestra fuente base (MERRA-2, la que usa POWER)
- **Andes, 2001–2023, con estaciones:** MERRA-2 tuvo los menores errores frente a pluviómetros, seguido de MSWEP y ERA5 (Maina y Kumar 2025, *J. Hydrometeorology*, NASA GSFC).
- **Altiplano:** MERRA-2 produce menores errores de precipitación gracias a su corrección con pluviómetros (Birkel et al. 2022, *Earth and Space Science*).
- **Límite conocido:** los reanálisis MERRA y CFSR sobreestiman la lluvia ligera a moderada (1–20 mm/día) y subestiman la muy intensa (> 50 mm/día) en Bolivia (Blacutt et al. 2015, *Atmos. Res.*). Por eso el KPI de "lluvia fuerte" se interpreta con cautela.

## Método de contraste (mismo periodo y reglas)
1. Descargar CHIRPS diario en el punto publicado, 1984-01-01 (ERDDAP) o 1981 (IRI) a 2026-03-31 (cuaderno `P6-4_contraste_CHIRPS.py`).
2. Calcular los totales por campaña nov–mar con las mismas reglas que D1-2 (≥ 140 días válidos; faltantes = `null`).
3. Comparar con POWER:
   - correlación de los totales por campaña;
   - diferencia media (mm y %);
   - repetir el "4 de 5" usando la normal de CHIRPS (promedio de sus propias campañas Normales).
4. **Interpretación:** si CHIRPS también da 4 de 5 (o 3 de 5), el patrón Niño fuerte → menos lluvia es robusto entre fuentes. Si no, la sensibilidad queda "alta" y se dice así.
5. **Límite:** CHIRPS y POWER no son independientes del todo (ambos usan estaciones). No se llama "validación en campo".

## Pendiente
- Ejecutar el cuaderno (Dev 1 o P6) y pegar la salida en este registro.
- **Pedido a SENAMHI (fuera del MVP):** serie diaria de lluvia y Tmin de Oruro-Aeropuerto 1981–2026, para validar después de la hackatón.

## Fuentes
- CHIRPS v2 diario en NOAA ERDDAP: https://coastwatch.pfeg.noaa.gov/erddap/griddap/chirps20GlobalDailyP05
- CHIRPS, ficha de catálogo (data.gov): https://catalog.data.gov/dataset/chirps-version-2-0-precipitation-global-0-05-daily-1981-present
- Remote Sensing 2024, CHIRPS e IMERG en Bolivia: https://doaj.org/article/4b94c4aa96754172bcfcfea4c66ec546
- MDPI 2025, MSWEP, CHIRPS y ERA5-Land en Bolivia: https://www.mdpi.com/3584186
- IMERG Final diario V07: https://oidc.rda.ucar.edu/datasets/d734000
- Maina y Kumar 2025, J. Hydrometeorology: https://mdsoar.org/items/6443e5cc-33a5-4ef0-a8d3-919bb4047e98
- Birkel et al. 2022, Earth and Space Science: https://doaj.org/article/e37b4589dc2c48c8b919c9c05069d76b
- Blacutt et al. 2015, Atmospheric Research: https://iai.int/en/?p=4269
- INE, Estadísticas de meteorología (ANDA): https://anda.ine.gob.bo/index.php/catalog/239/pdf-documentation
- SENAMHI, resúmenes climáticos (estación Oruro-Ciudad): https://senamhi.gob.bo/climatologia/2026/03%20RESUMEN%20CLIM%C3%81TICO%20MARZO%202026.pdf
