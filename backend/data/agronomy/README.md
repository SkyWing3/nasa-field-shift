# Parámetros de cultivos y rotaciones · borrador para P6

`crops.json` y `rotations.json` son configuraciones propias del proyecto. **No son descargas de NASA POWER**. Se crearon a partir de `PARA_DEV1_correcciones.md` porque P6 refería esos archivos, pero no se entregaron ni se encontraron en el repo o las fuentes conectadas.

Solo se consignan los datos expresamente comunicados por P6. Ambos archivos tienen `ready_for_simulation: false`: no hay cálculo agronómico activo a partir de estos borradores.

P6 o la líder deben proporcionar o validar:

- Orden de los cultivos de las secuencias A, B y C. La secuencia A es un escenario; no acredita la práctica del productor.
- Factor numérico de cobertura del descanso con maleza pastoreada. No se lo considera suelo desnudo.
- Zr y coeficientes de cultivo; ventanas de floración/antesis y fechas concretas de siembra/cosecha.
- Fila de FAO-56 Tabla 11 y adaptación de sus proporciones por cultivo; cualquier duración escalada se marcará `kind: assumption`, `source: assumption_fao56_t11`. Las etapas de coeficiente de cultivo no definen por sí solas la ventana de floración.
- Interpretación de los dos umbrales de quinua comunicados por P6 (−4/−2 °C en antesis).
- Umbrales de viento y lluvia fuerte, siempre marcados como `assumption`.
- Valor asumido de agua disponible dentro del rango 0,14–0,16 m/m; no hay medición ni profundidad de suelo. La política prevista usa la Zr del cultivo cuando esté validada.

Papa y haba: pozo + lluvia; KPI hídrico central previsto, **riego neto requerido (mm)**. Quinua: secano. Exposición a heladas: contar en floración/antesis, sin convertir todo el ciclo en floración. Granizo: límite declarado, sin KPI inventado.

La entrada `prepare_rotation_request(..., start_position=0)` está preparada para el futuro motor. **Los nueve casos siguen deshabilitados y pendientes de la líder**; no hay simulación ni enumeración de esos casos.

CHIRPS / P6-4: `unavailable` según P6. D1-2b cancelado.
