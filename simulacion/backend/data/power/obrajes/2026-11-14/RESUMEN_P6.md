# D1-2 · Obrajes, Soracachi · Revisión pública para P6

## Privacidad y procedencia

**Punto público: lat −17.83, lon −67.00. Precisión: 0,01°.** Punto redondeado por privacidad del productor. La consulta POWER se descargó de nuevo con este punto y se conserva su respuesta original sin editar. El manifiesto contiene `coordinate_precision_deg: 0.01` y la nota de privacidad.

La elevación **3809 m EGM96** fue obtenida previamente con el módulo NASADEM del repo para la parcela. Se conserva el valor, pero se omiten las coordenadas de muestreo, fila/columna y georreferencia detallada. Las coordenadas públicas no se presentan como el píxel exacto de elevación.

Fuente de elevación: NASA JPL, [NASADEM HGT v001](https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001), distribuido por [OpenTopography](https://opentopography.org).

## Resultado «4 de 5»

**Se mantiene 4 de 5.** Cuatro campañas Niño fuerte tienen lluvia noviembre–marzo inferior a la referencia Normal: **364.803846 mm**, promedio de **13 campañas Normal**. La comparación usa el promedio sin redondear.

| Campaña | ONI NDJ (°C) | Lluvia nov–mar (mm) | Diferencia frente a Normal | Menor que Normal |
| --- | ---: | ---: | ---: | :---: |
| 1982-83 | 2.12 | 230.11 | -36.92 % | Sí |
| 1997-98 | 2.37 | 219.77 | -39.76 % | Sí |
| 2009-10 | 1.50 | 472.51 | +29.52 % | No |
| 2015-16 | 2.59 | 234.90 | -35.61 % | Sí |
| 2023-24 | 1.99 | 336.35 | -7.80 % | Sí |

Se incluyen **45 campañas completas, 1981-82 a 2025-26**, con 151 o 152 días de lluvia válidos. El mínimo de inclusión es 140 días. La campaña **2026-27 sigue parcial y excluida**: 11 días y 13,10 mm observados hasta el 11 de noviembre; todavía no se dispone de su ONI NDJ.

P6 confirmó que su cuaderno reprodujo los mismos valores de lluvia del paquete anterior. Este repo ejecutó el cálculo local, no Colab. El redondeo mantiene idénticas las seis series meteorológicas y, por tanto, el resultado de lluvia.

## Hallazgo al redondear: radiación diferente

**No todas las series permanecen iguales.** La reconsulta pública cambia `ALLSKY_SFC_SW_DWN` en **15.633 fechas**, frente a la descarga anterior. Lluvia, Tmin, Tmax, Tmedia, viento y humedad sí son idénticos en las 16.751 fechas comparadas de cada variable. `rounding_comparison.json` registra la comparación sin conservar la ubicación privada.

POWER sirve los parámetros en las mallas nativas de cada fuente ([metodología NASA POWER](https://power.larc.nasa.gov/docs/methodology/)); meteorología y radiación no deben tratarse como una única celda de resolución idéntica. No se ha verificado el centro o índice de la celda solar ni se atribuye la diferencia a una causa específica. **No se afirma que un futuro cálculo de ET0 sería idéntico al del punto privado.**

P6 informa que Obrajes y Oruro comparten la celda meteorológica. Se registra como confirmación proporcionada por P6; no se recibió la consulta de Oruro para una comprobación independiente. Texto de UI: **«Dato regional de la celda NASA POWER, no medición de la parcela»**. Se declara también que POWER no mide granizo.

## Descarga y cobertura

- Fuente: [NASA POWER Daily Point API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), comunidad AG, JSON, hora solar local **LST**.
- Reconsulta redondeada descargada: **2026-11-14T22:19:51-04:00**, America/La_Paz. El instante UTC exacto figura en el manifiesto.
- Período: **1981-01-01 a 2026-11-11**, 16.751 días; se mantiene el período de la entrega inicial para comparar.
- Variables: `PRECTOTCORR`, `T2M_MIN`, `T2M_MAX`, `WS2M`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `T2M`.
- Las seis series meteorológicas no tienen faltantes.
- Radiación: **1984-01-01 a 2026-11-10**, 15653 días válidos y 1098 faltantes; huecos internos: 2026-09-07, 2026-11-05.
- Unidades de radiación: **MJ/m²/día**. No se calculó ET0. No hay radiación antes de 1984 y no se imputa ninguno de sus faltantes.
- Faltantes: `null` en JSON y campos vacíos en CSV. Los ceros reales se conservan.
- ENSO: [ONI de NOAA CPC](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt), ANOM de NDJ, YR del año inicial de campaña. Niño ≥0,5; Niña ≤−0,5; Niño fuerte ≥1,5.

## Archivos y checksums

- `lluvia_campanias.csv`, `ninos_fuertes.csv`, `resultado_4de5.json`: entrega de lluvia y ENSO.
- `daily_normalized.json` / `.csv`: las siete series, recalculadas desde la respuesta redondeada.
- `power_original.json`: respuesta auténtica del punto público. **SHA-256: `d5a8e438dac6434c4c3326f28ab24e86ed2b45980fd4a7580c275166ae062eeb`**.
- `manifest.json`: precisión, fuentes, fecha, URL exacta pública, cobertura y checksums nuevos.
- `P6_correcciones.md` y `D1-2_especificacion_POWER.md`: ediciones públicas de las instrucciones, sin prefijos privados.
- `elevacion_nasadem.json`: valor de elevación con posición pública aproximada y sin georreferencia detallada de la parcela.
- `rounding_comparison.json`, `verificacion.json`: comparación y comprobaciones.
- `CHECKSUMS.sha256` dentro del ZIP cubre todos sus archivos.

El ZIP anterior dentro del repo se sustituye por esta edición pública. No se encontraron coincidencias de las coordenadas privadas en el historial Git revisado; no se reescribió el historial.

La búsqueda literal de las coordenadas en `backend/` queda vacía, incluyendo el entorno virtual. El comando de búsqueda sugerido por P6 usa puntos sin escapar: también encuentra números de tablas Unicode en dos archivos de `idna` dentro del entorno virtual ignorado por Git. Son falsos positivos del patrón, no coordenadas de la parcela. No se alteraron dependencias para ocultarlos.

## Parámetros para el motor

Se crearon `backend/data/agronomy/crops.json` y `rotations.json` como **borradores incompletos**, porque los archivos referidos por P6 no fueron entregados. No son parámetros oficiales ya validados por P6. Solo contienen los datos comunicados; factores, duraciones, Zr, coeficientes y secuencias ausentes quedan en `null`.

- Papa y haba: pozo + lluvia; KPI hídrico central previsto, riego neto requerido (mm). Quinua: secano.
- Heladas: exposición en floración/antesis; hace falta validar las ventanas y la interpretación de los dos umbrales de quinua.
- Descanso: cobertura parcial con maleza pastoreada; falta su factor numérico.
- Secuencia A: escenario, no práctica demostrada del productor.
- Duraciones FAO-56, umbrales de viento/lluvia y agua disponible del suelo se identifican como `assumption`; no se inventan valores donde faltan.
- Entrada preparada con `start_position`, sin ejecutar los nueve casos. **D1-5 sigue pendiente de la líder.**
- **CHIRPS/P6-4: unavailable. D1-2b cancelado** según P6; no se intentó el contraste.

P6 o la líder deben entregar o validar los parámetros faltantes antes de activar el motor.

## Reproducción sin red

Desde la raíz del repo o del ZIP extraído, con Python estándar:

```sh
python3 scripts/power_d1_2.py backend/data/power/obrajes/2026-11-14
python3 -m unittest discover -s scripts -p 'test_power_d1_2.py' -v
```

El regenerador rechaza un punto que no sea el público redondeado y verifica los checksums de POWER y ONI antes de procesar. La reconsulta de esta entrega usó la URL guardada en `download_metadata.json`; no se alteró el JSON recibido.
