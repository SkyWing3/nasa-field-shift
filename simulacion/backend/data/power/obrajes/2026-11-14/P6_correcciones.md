Edición pública: la línea de búsqueda de prefijos privados se expresa sin conservar dichos prefijos.

# Para Dev 1 (pegar a tu IA) · P6 → Dev 1 · 14-nov

Tu paquete D1-2 está verificado: checksums OK, 5 tests OK, "4 de 5" reproducido con los mismos valores del cuaderno de P6. Faltan estos cambios, en orden:

## 1. Privacidad (URGENTE, antes de subir a Git)
- **Problema:** las coordenadas exactas de la parcela del productor aparecen en 7 archivos (manifest, power_original.json, CSVs, resultado, verificación, RESUMEN).
- **Cambio:** usar en todo el paquete **lat = -17.83, lon = -67.00** (redondeo a 0,01°). Agregar en el manifest `"coordinate_precision_deg": 0.01` y `"note": "punto redondeado por privacidad del productor"`.
- **Cómo:** volver a correr `power_d1_2.py` con el punto redondeado. Cae en la misma celda POWER, así que los resultados no cambian. Regenerar los checksums.
- **Comprobar:** el paquete público no debe conservar coordenadas de la parcela con más precisión que 0,01°.
- Si las exactas ya están en el historial de Git, borrar el historial (o crear un repo nuevo) antes de hacerlo público.

## 2. Celda POWER
- El punto de Obrajes y la ciudad de Oruro dan **valores idénticos**: es la misma celda (~50 km).
- Así debe decirse en la UI: "dato regional de la celda NASA POWER, no medición de la parcela".

## 3. Cambios por las respuestas del productor (para el motor)
- **Riego:** papa y haba se riegan con pozo + lluvia, así que el KPI central es **riego neto requerido (mm)**, no solo el estrés. Quinua es de secano.
- **Helada:** el KPI de exposición térmica se cuenta **en floración** (umbrales en `crops.json`: papa -2,5 °C; haba -1 °C en flor; quinua -4/-2 °C en antesis).
- **Granizo:** POWER no lo mide. Va como **límite declarado** en la UI y no se inventa un KPI.
- **Descanso:** tiene cobertura parcial (maleza pastoreada), no es suelo desnudo. Usar el factor de cobertura parcial de `crops.json`.
- **Baseline:** la secuencia A es un **escenario**, no la práctica del productor (`rotations.json`, `baseline_status`).

## 4. Nueve casos en D1-5 (PENDIENTE de aprobación de la líder)
- Cada secuencia (A, B, C) se evalúa en sus **3 posiciones cíclicas**, de modo que el año Niño caiga en cada cultivo: 9 casos.
- Mostrar los KPIs de la campaña de decisión y los del ciclo completo.
- `rotations.json` → `positions_proposed`.
- No implementar hasta que la líder confirme. Dejar la función preparada para recibir `start_position`.

## 5. Supuestos que deben ir marcados como `assumption` en el código
- **Duración de etapas:** viene `null` en `crops.json`. Usar las proporciones FAO-56 (Tabla 11) escaladas al calendario del productor (siembra sep–oct, cosecha abril) y marcarlas `"source": "assumption_fao56_t11"`.
- **Umbrales de viento y lluvia fuerte:** marcarlos `assumption`. Nota: MERRA-2 subestima la lluvia > 50 mm/día en Bolivia (Blacutt et al. 2015), así que el KPI de lluvia fuerte se lee con cautela.
- **Agua disponible del suelo:** 0,14–0,16 m/m (NRCS, textura franco arcillo arenosa, no medida). La profundidad es `null`, así que se usa la Zr del cultivo.

## 6. Contraste CHIRPS: CANCELADO
P6 lo intentó a las 21:40: el espejo NOAA ERDDAP está incompleto (4.481 días) e IRI devuelve HTML. P6-4 queda `unavailable`. No hagas D1-2b.

## 7. Devolver a P6
- El paquete D1-2 con coordenadas redondeadas, con los checksums nuevos.
