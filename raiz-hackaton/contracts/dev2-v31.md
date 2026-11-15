# Contrato ejecutable de publicación Dev 2 · v3.1

Este detalle concreta `contracts/README.md`; no acredita aprobación de D1/P6/D3.
La validación está implementada en `raiz_delivery/contracts.py`. La auditoría
descriptiva está en `raiz_delivery/analysis.py`. Ninguno calcula clima ni balances.

## Directorio de entrada

```text
entrada/
  catalog.json
  climate.json
  results.json
  raw/...
```

Los tres JSON usan el sobre común `schema_version="3.0"`, `build_id`, `mode`,
`generated_at`, `data_as_of`, `model_version`, `sources`, `assumptions`, `warnings`
y `data`. El `build_id` coincide en todos los archivos y registros.

| Perfil | Catálogo | Clima | Resultados |
| --- | --- | --- | --- |
| Demo sin datos reales | fixture | fixture | fixture |
| Entrada científica precalculada | simulated o downloaded | downloaded | simulated |

No mezclar fixture con no fixture. En fixtures: fuentes vacías; fecha de datos y
modelo nulos; advertencia con la palabra `FIXTURE`. Coordenadas desconocidas nulas,
sin ventanas, KPI ni ranking. Fechas editoriales se gestionan por separado.
En no fixture: instantes ISO 8601 con zona, datos no posteriores a generación,
fuentes completas y `model_version` en los archivos simulados.

## Catálogo

`data.analysis_point`: `analysis_point_id="oruro-pilot"`, `region="Oruro"`,
`latitude`, `longitude`, `location_status`. En datos no fixture se exigen coordenadas
válidas, estado `regional_point` o `validated_plot` y texto `representativeness`.
El validador no verifica una entrevista ni el carácter de parcela del punto.

`data.rotations`: tres objetos con `rotation_id`, `campaigns`, `baseline_status`.
IDs: `papa-quinua-descanso`, `papa-quinua-haba`, `papa-haba-descanso`. La lista
`campaigns` coincide con la secuencia del ID; `baseline_status` es `assumed` o
`confirmed`, sin convertir el texto de un calendario en confirmación humana.

`data.cases`: nueve objetos con `case_id`, `rotation_id`, `position_id`, `campaigns`
y `decision_crop`. `position_id` es 1, 2 o 3. La secuencia se desplaza cíclicamente,
y `decision_crop` es su primer elemento. Se exige cada par secuencia/posición una
sola vez. El fixture usa `A-1`..`C-3`; otros IDs seguros son admisibles si se acuerdan.

| Lista | Campos mínimos en no fixture |
| --- | --- |
| `periods` | `period_id`, `start_campaign_year`, `end_campaign_year` |
| `water_budgets` | `water_budget_id`, `net_limit_mm` >=0; se recomienda `label` |
| `soil_profiles` | `soil_profile_id`, `nature`: measured/map_estimate/scenario_assumption |

Los IDs de cada lista son únicos. El fixture usa las tres listas vacías.
Los parámetros científicos de cultivo/suelo y sus fuentes siguen bajo D1/P6;
el publicador no los rellena ni calibra. El perfil legado de tres registros en
`fixtures/dev2-v3` sigue aceptado para regresión, pero no satisface los nueve casos.

## Fuentes y originales

Cada fuente declara:

`source_id`, `agency`, `product`, `version`, `url`, `queried_at`,
`period: {start: "YYYY-MM-DD", end: "YYYY-MM-DD"}`, `spatial_resolution`,
`temporal_resolution`, `units` (objeto no vacío), `qa` (texto u objeto no vacío),
`original`, `sha256`, `bytes`, `license`.

`url` debe ser HTTPS, estable, sin credenciales, firmas ni fragmento. Puede incluir
parámetros públicos reproducibles, como variables y fechas, pero se rechazan claves
de token, API key y firmas de URLs temporales. `original` es una ruta POSIX relativa
a este directorio de entrada, por ejemplo `raw/power.json`, sin `..`, unidad Windows,
backslash, `%`, `?`, `#` ni caracteres de control. No se aceptan escapes URL literales
que pudieran convertirse en traversal al servir los originales por HTTP.
El original debe existir dentro de la entrada, sin symlink y con tamaño/SHA-256
exactos. Si dos fuentes comparten una ruta, deben declarar el mismo hash/tamaño.

En el paquete publicado el directorio científico es `data/`: el original se ubica
en `data/<original>`. El publicador copia solo los originales expresamente declarados.
Un mismo `source_id` debe tener idéntica procedencia en todos los archivos.

Estas comprobaciones prueban coherencia e integridad local. **No autentican el
origen del proveedor ni demuestran calidad científica**, y no convierten una
afirmación de `agency` en una descarga verificada por Dev 2. D1/P6 aportan y revisan
los originales NASA POWER, NOAA ONI, metodología, licencia, completitud y QA.

## Clima

`data.series` es una lista de objetos:

```json
{
  "variable": "nombre_de_variable",
  "unit": "unidad_de_la_fuente",
  "nature": "downloaded",
  "source_id": "id_de_fuente_declarada",
  "values": [{"date": "YYYY-MM-DD", "value": null, "missing_reason": "motivo"}]
}
```

Las fechas no se repiten dentro de una serie. Cada valor es un número finito o
`null` con motivo. No se transforma un faltante en cero. No se exige consulta
remota, ni se rellenan días o coordenadas durante la publicación.

## Resultados

`data.records` contiene `result_id`, `build_id`, `analysis_point_id`, `rotation_id`,
`position_id`, `case_id`, `decision_crop`, `period_id`, `enso_initial_phase`,
`water_budget_id`, `soil_profile_id`, `n_windows`, `n_unique_campaigns`, `windows`,
`decision_kpis`, `cycle_kpis`, `ranking`, `missing_reason`, `sensitivity_status`.
En no fixture se añaden descripciones no vacías `calendar`, `initialization`,
`residues` y `sensitivity_reason` si no se evaluó sensibilidad.

Los IDs referencian el catálogo. `enso_initial_phase` admite `Normal`, `Niño`,
`Niña`, `Niño fuerte`. Cada combinación periodo/ENSO/presupuesto/suelo contiene
los nueve casos, aun si una salida está explícitamente sin datos.

Una ventana se representa así:

```json
{"window_id": "id_seguro", "campaign_years": [2001, 2002, 2003], "complete": true}
```

El ejemplo ilustra formato, no una ventana evaluada del proyecto.
Se exigen tres años consecutivos, completos, dentro del periodo del registro y
campaña de decisión no posterior a 2023. No se comprueba la conservación del agua
por leer `complete=true`: esa prueba y sus series diarias corresponden a D1.
`n_windows` coincide con la lista; `n_unique_campaigns` cuenta los años únicos.
Los nueve casos del contexto usan las mismas ventanas, no muestras seleccionadas
para favorecer un caso. No sumar n de casos como si fueran muestras independientes.

Cada grupo KPI es un objeto por nombre. Ejemplo de forma sin dato:

```json
{
  "water_stress_days": {
    "value": null,
    "unit": "days",
    "nature": "simulated",
    "source_ids": ["id_de_fuente"],
    "method": "metodología reproducible de D1",
    "missing_reason": "motivo del faltante"
  }
}
```

| KPI admitido | Unidad |
| --- | --- |
| net_irrigation_requirement_mm / net_irrigation_applied_mm | mm |
| water_stress_days / thermal_exposure_days | days |
| bare_rain_exposure_days / bare_wind_exposure_days | days |
| planned_coverage_pct | % (0..100) |
| constraint_pass_frequency | fraction (0..1) |

Frecuencia exige `numerator`/`denominator`, denominador igual a `n_windows` y valor
coherente. No se cuantifican rendimiento, ingresos, carbono o erosión calibrada.
Si n=0: ambos grupos KPI y ranking nulos con motivo. Si n<3: ranking nulo y el
analizador informa muestra insuficiente. Un grupo KPI ausente exige motivo.

Un ranking recibido, cuando existe, requiere entero positivo y `ranking_method`:
`normalization` (`min_max` o `fixed_range`), `normalization_ranges`,
`missing_data_policy` (`exclude_case` o `no_rank_if_missing`), `tie_rule`,
`metric_scope` (decision_kpis o cycle_kpis), `weights` no negativos con suma positiva
y `directions` por métrica (`minimize` o `maximize`). Las claves de `weights`,
`directions` y `normalization_ranges` deben coincidir. Cada métrica ponderada
debe existir en el grupo seleccionado, estar dentro del MVP y tener valor finito
no nulo: un caso no obtiene ranking por omitir una métrica desfavorable.

Cada rango es `{min: número, max: número}` y contiene el valor de la métrica.
Un rango constante min=max exige `constant_metric_policy: tie`. Los casos con
ranking dentro del mismo contexto periodo/ENSO/presupuesto/suelo deben usar
idénticas reglas, pesos, direcciones y rangos, y las mismas ventanas históricas.
No se mezclan campaña y ciclo, ni se normaliza cada caso con su propio rango.
La ausencia de un KPI no se reemplaza por cero ni renormaliza sus pesos para
favorecerlo; el caso queda sin ranking según la política declarada.

Dev 2 no recalcula ni certifica el ranking de D1: comprueba la coherencia de las
reglas recibidas. Empates y ausencia explícita de ranking son admisibles.

## Informe de análisis de calidad

`analyze_inputs(docs)` valida antes de emitir un diccionario con versión, build,
modos por archivo, cantidad de casos/registros/fuentes y detalle por resultado:
n de ventanas/campañas únicas, disponibilidad de KPI, muestra, sensibilidad y
faltantes. El perfil fixture genera bloqueos explícitos para aceptación final.
Las revisiones editorial/agronómica no se infieren de este análisis.

## Pruebas y alcance

```powershell
python -m unittest discover -s tests -p test_contracts_v31.py -v
```

Pruebas incluyen el perfil legado y nueve casos, rechazo de referencias/casos,
ventanas y n incoherentes, unidades/naturalezas, fuentes, fechas, modo, ranking,
faltantes, originales ausentes/corruptos y JSON duplicado/no finito/inválido.
El constructor de entradas no fixture dentro de los tests es **sintético y de
uso exclusivo de la prueba de estructura**; no es un paquete NASA descargado,
resultado agronómico real ni entrega científica de Dev 1.
