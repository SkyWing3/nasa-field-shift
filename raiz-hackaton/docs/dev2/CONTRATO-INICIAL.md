# Detalle inicial de publicación · propuesta pendiente de acuerdo D1/D3

Este documento concreta únicamente el perfil de fixture implementado.
`contracts/README.md` sigue siendo el alcance científico y funcional v3.
No reemplaza el contrato del equipo ni afirma acuerdo de otros integrantes.

## Rutas y lectura consistente

| Ruta dentro de una release | Contenido |
| --- | --- |
| `/data/catalog.json` | Punto sin coordenadas, tres secuencias candidatas, presupuestos vacíos |
| `/data/climate.json` | Series vacías y motivo de ausencia |
| `/data/results.json` | Tres registros fixture sin evaluación |
| `/data/communications.json` | Mensajes y ficha por resultado, audio/radio ausentes |
| `/data/manifest.json` | Sobre común, método, inventario SHA-256 y bytes |
| `/print/<result_id>.html` | Ficha imprimible equivalente al texto |
| `/audio/*.mp3` | Reservado; ningún MP3 publicado en este incremento |

La raíz de hosting contiene `current.json` y `releases/<build_id>/`.
Dev 3 deberá leer el puntero una sola vez por recorrido y resolver todas las
rutas contra su `base_path`. Una ruta `/data/...` del contrato se interpreta
relativa a la raíz de esa release, no a la raíz global del hosting.
Esto evita mezclar archivos si el puntero cambia durante una visita.
Esta estrategia de integración sigue pendiente de acuerdo con Dev 3.

## Sobre común

Se conservan `schema_version`, `build_id`, `mode`, `generated_at`, `data_as_of`,
`model_version`, `sources`, `assumptions`, `warnings` y `data` del contrato v3.
En el fixture: `mode=fixture`, fechas/modelo `null`, fuentes vacías y advertencia
visible. `generated_at` puede ser nulo porque el fixture no representa una corrida.
El reporte de comprobación guarda aparte la hora real de la ejecución.
No confundir esa hora con disponibilidad de datos ni emisión editorial.

El perfil se valida con Python (`contracts.py`); no se ha creado aún un JSON Schema
intercambiable ni un validador completo del futuro paquete científico.
Se rechazan claves JSON duplicadas, NaN/Infinity, IDs inseguros, builds mezclados,
coordenadas, presupuestos o KPI agregados al fixture y fuentes científicas falsas.

## Referencias y faltantes

Cada mensaje incluye `build_id`, `result_id`, `analysis_point_id`, `rotation_id`,
`period_id`, `enso_initial_phase`, `water_budget_id` y `soil_profile_id`.
Los cuatro últimos están `null` en este fixture y el texto explica por qué.
La ficha incluye las tres alternativas y su selección; `n_windows=0` significa
que no se calculó ninguna ventana. Los KPI y ranking quedan nulos, nunca cero.

Audio: `status=unavailable`, `path=null` y motivo; no se usa un MP3 de otro escenario.
Mensajes: `draft_fixture`, `not_issued`, revisión `pending_p5_p6`, fechas editoriales
nulas. No se han emitido y no tienen una vigencia inventada.

Boletín: `status=unavailable`, texto/audio/duración/fechas nulos y motivo.
`distribution_status=prepared_not_broadcast` es el estado de distribución reservado
por v3; **no significa que un MP3 esté preparado**. Leer también `status`.

## Acuerdos necesarios antes de aceptar resultados reales

| Decisión | Responsables | Condición de aceptación |
| --- | --- | --- |
| IDs de periodos, ENSO, campañas, suelo, presupuestos y rotaciones | D1/P6/D3 | Catálogo y referencias exactas; horizonte de tres campañas |
| Ventanas, unidades, métodos y faltantes | D1/P6 | Series reproducibles, n, exclusiones, fuentes, supuestos y naturaleza por variable |
| Modo por archivo y mezcla legítima de datos/simulación | D1/D2 | Clima descargado distinguido de resultados simulados; build común |
| Fuentes y manifiesto científico | D1/P6/D2 | Campos de procedencia v3 completos, licencia, originales y QA |
| Plantillas específicas y vigencia editorial | P5/P6/D2 | Texto revisado y enlazado al resultado exacto |
| MP3 español | P5/D2 | Archivo reproducible, licencia, texto equivalente, revisión de escucha y hash |
| Radio regional | P5/P6/D2 | Sin información de finca; duración medida <=60 s; emisión no afirmada |
| Resolución de rutas y hosting HTTPS | D2/D3 | Todos los recursos en misma release; verificación en móvil y red externa |

La próxima versión debe agregar pruebas de muestra insuficiente con resultados
reales, expiración editorial, audio coincidente/no coincidente, duración y licencia,
manteniendo el rechazo de cifras sin procedencia. Hoy solo se cubre ausencia explícita.

## Actualización de planificación v3.1

El plan vigente ahora exige tres posiciones por secuencia (9 casos), KPI de
decisión/ciclo separados y contexto NOAA/IRI fechado. Ver
`docs/actualizacion-plan-v3.1.md`. Este adaptador inicial sigue probando solo
los tres registros fixture originales: no constituye integración de nueve
casos ni del paquete real. Antes de ampliarlo, acordar IDs caso/posición con D1/D3.
