# Plan, decisiones y bitácora de Dev 2

Responsable: Nicole. Inicio: 2026-11-14, America/La_Paz.

## Inventario comprobado

Se leyeron completos `README.md`, `plan-equipo.json` y `contracts/README.md`.
Se inspeccionó `server.py` y se buscaron integraciones en los archivos existentes.
El proyecto original contiene HTML/CSS/JS de coordinación, plan, contrato,
scripts macOS y una base del tablero. `server.py` usa biblioteca estándar,
SQLite y `/api/tasks`. No hay FastAPI integrado ni motor agrícola, entradas
NASA/NOAA, catálogos/resultados científicos, MP3 o pipeline Dev 2.

No se descargaron datos: falta confirmar el punto y no es responsabilidad D2
inventar coordenadas o reemplazar el trabajo científico de D1/P6.

## Estado de las tareas v3

| Tarea | Estado real | Evidencia de este incremento | Pendiente |
| --- | --- | --- | --- |
| D2-1 Estructura modular | En curso | Módulos, CLI, fixture y detalle de contrato | Acuerdo D1/D3 |
| D2-2 Mensajes | Base implementada con fixture | Texto prudente de falta de datos; referencias coherentes | Plantillas P5/P6 y resultado real |
| D2-3 Audio español | Pendiente | Catálogo informa ausencia; ninguna reproducción falsa | MP3, licencia y revisión P5 |
| D2-4 Ficha | Base implementada con fixture | Tres HTML por selección, tres alternativas y límites | Evidencia real y revisión visual/Dev 3 |
| D2-5 Boletín regional | Pendiente | Estado ausente y distribución sin emisión | Guion P5/P6, MP3 <=60 s |
| D2-6 Publicación y comprobación | Base local implementada | Releases, hashes, puntero y pruebas locales | Paquete real, HTTPS y aceptación integrada |

No se marcaron tareas como Hecho ni se cambió `plan-equipo.json`.
Los vencimientos del plan siguen siendo metas del equipo; no evidencias de ejecución.

## Secuencia de trabajo y puertas de aceptación

1. **Estructura inicial:** reproducir el fixture y verificar que un error no publica
   contenido parcial. Entregado en este incremento.
2. **Contrato real:** acordar detalle con D1/D3; P6 confirma punto, secuencia y riego.
   Entregable: ejemplo real versionado y decisiones registradas en esta carpeta.
3. **Adaptador real:** aceptar `downloaded`/`simulated` por archivo y validar metadatos,
   referencias, ventanas, unidades, KPI y faltantes según v3. No calcular ciencia en D2.
4. **Contenido:** integrar plantillas P5/P6, texto de comparación y vigencia editorial;
   permitir n insuficiente y faltantes sin recomendaciones inventadas.
5. **Audio y radio:** producir fuera del recorrido de demo, guardar MP3, licencia,
   equivalencia de texto, revisión de escucha y duración real del boletín. Registrar
   quién revisó y cuándo; no rellenar revisiones por otra persona.
6. **Integración:** Dev 3 conecta una release completa; probar impresión, teclado,
   móvil, descarga real, archivo ausente, caducidad, ausencia de red y HTTPS público.
7. **Cierre:** respaldo del paquete final, inventario, comandos, fuentes/licencias y
   reporte de aceptación. Mantener versión anterior hasta comprobar la nueva.

## Decisiones registradas

| Decisión | Motivo | Consecuencia |
| --- | --- | --- |
| Sin FastAPI nuevo | No estaba integrado; v3 no lo exige | Python estándar, publicación estática |
| Separar `raiz_delivery` de `server.py` | El tablero es otro sistema | No reutilizar API ni base del centro |
| Perfil inicial solo fixture | No hay paquete científico ni acuerdo detallado | Rechazar modo real hasta implementar adaptador |
| Tres registros sin métricas | Probar enlaces/selección sin simular evidencia | Advertencias visibles, n=0, KPI null |
| Audio/radio ausentes | No existen archivos, licencia ni revisión | Ninguna ruta falsa, duración o emisión inventada |
| Releases inmutables y puntero | Evitar mezcla de builds y pérdida de versión previa | Publicación local por lotes; sin proveedor en demo |
| HTML con impresión nativa | Suficiente para v3 | Sin motor PDF obligatorio |
| Nicole como responsable D2 | Instrucción explícita de esta sesión | Corregida la mención anterior en `contracts/README.md` de esta copia |

## Bitácora 2026-11-14 · incremento inicial

- Preparada copia de trabajo del proyecto local; la fuente original y su tablero
  permanecen intactos. No se copió la base activa `team.sqlite3`.
- Añadidos módulos, fixtures, CLI, pruebas y documentación de continuidad.
- La comprobación produce `build/verification.json`, con hora UTC real, versión
  Python, comandos, códigos de salida y salida completa. Consultar ese archivo
  para el resultado de la última ejecución; no usar el reporte como validación agronómica.
- Auditoría de `server.py`: sin modificaciones respecto a la fuente inspeccionada.
- Pendiente revisión visual de impresión y todos los entregables reales.
- Primera ejecución: `tempfile.mkdtemp` creó directorios con ACL inaccesible
  para este entorno de Windows. Se sustituyó por carpetas de nombre UUID con
  permisos heredados del workspace y limpieza acotada a la carpeta creada.
  Los temporales de pruebas viven dentro de `build/test-runs/`.
- Comprobación aprobada: **12 pruebas**, con subcasos de rechazo, construcción,
  validación, publicación local y descargas HTTP. Ver la salida exacta en
  `build/verification.json`. No equivale a revisión visual ni científica.

## Cómo registrar el siguiente incremento

Agregar fecha y responsable, archivos modificados, decisión y motivo, comando
ejecutado, resultado con ruta de evidencia, límites de la prueba y siguiente paso.
Si cambia un acuerdo, conservar la decisión anterior y explicar la sustitución.
El `build_id` identifica un paquete; nunca reutilizarlo con contenido diferente.

## Mensaje de traspaso sugerido

“Soy Dev 2 de Raíz. Lee `docs/dev2/CONTINUAR.md`, el alcance v3 y la bitácora.
Ejecuta `python scripts/check_dev2.py`. El adaptador actual procesa solo fixtures
sin métricas; faltan acuerdo D1/D3, adaptador real y audio revisado. Continúa con
la siguiente puerta de aceptación y documenta la evidencia. El servidor del
tablero no es la API agrícola.”

## Actualización de planificación v3.1

El plan vigente ahora exige tres posiciones por secuencia (9 casos), KPI de
decisión/ciclo separados y contexto NOAA/IRI fechado. Ver
`docs/actualizacion-plan-v3.1.md`. Este adaptador inicial sigue probando solo
los tres registros fixture originales: no constituye integración de nueve
casos ni del paquete real. Antes de ampliarlo, acordar IDs caso/posición con D1/D3.

## Bitácora 2026-11-14 20:00–21:00 · audio con Meta MMS (Claude Code)

Sesión con Claude Code a pedido de Dev 2. Base: la copia de trabajo de Codex
(`Documents\Codex\2026-11-14\new-chat\work\raiz-hackathon`, 54 pruebas en verde
antes de cambiar nada). El código Dev 2 (módulo, scripts, pruebas, fixtures, docs,
`contracts/dev2-v31.md`) se copió a `Documents\raiz-hackathon`. No se tocaron
`dist/`, `plan-equipo.json`, `raiz.html`, `README.md`, `contracts/README.md`,
`server.py` ni `team.sqlite3`: el centro de coordinación sigue en el plan v3 y la
copia Codex tiene la actualización v3.1 sin aplicar al tablero en vivo.

### Decisiones

| Decisión | Motivo | Consecuencia |
| --- | --- | --- |
| Voz Meta MMS-TTS local en lugar de SAPI | SAPI bloqueado (`0x80045040`); MMS es abierto e incluye español, quechua y aymara | Entorno aparte `.venv-tts` (torch CPU, transformers, lameenc, num2words); `raiz_delivery` sigue sin dependencias |
| `mms-tts-quh` y no `mms-tts-quz` | `quz` es quechua de Cusco; `quh` es quechua sudboliviano (Oruro) | El texto automático (NLLB `quy_Latn`) sigue siendo variante Ayacucho: adaptar con hablante |
| Ejecución local, no API | Ningún proveedor de inferencia de Hugging Face sirve estos modelos (comprobado en su API) | Generación por lotes; la demo sirve MP3 guardados, como exige el contrato |
| Licencia `licensed` con `spdx: CC-BY-NC-4.0` | Licencia publicada en la ficha del modelo; la hackatón es uso no comercial | Crédito visible en ficha/índice; cambiar de voz si hay uso comercial |
| Otros idiomas como `translations` junto al español | El plan exige hablante y revisión para otros idiomas | Estado experimental; `--production` los rechaza sin `speaker_review` aprobado |
| Texto hablado normalizado + semilla fija | MMS omite dígitos; VITS es estocástico | Números/fechas/siglas en palabras; mismo texto → mismo MP3 |

### Archivos

- Nuevos: `scripts/generate_audio_mms.py`, `tests/test_audio_translations.py`,
  `.claude/launch.json` (vista previa local), `assets/audio/fixture-dev2-v31-demo/`.
- Modificados: `raiz_delivery/audio.py` (traducciones, comprobaciones comunes de
  archivo/voz/licencia, rutas MP3 únicas), `raiz_delivery/package.py` (inventario y
  comparación semántica con traducciones), `raiz_delivery/print_sheet.py` (crédito de voz y
  sección «Otros idiomas» con aviso experimental), `docs/dev2/AUDIO.md`, `CONTINUAR.md`, `.gitignore`.

### Evidencia

- `python scripts/check_dev2.py --audio-assets assets/audio/fixture-dev2-v31-demo`
  → `build/verification.json` con `status: passed`.
- Español: 10 MP3 (9 mensajes de ~46–48 s y boletín de 46,8 s ≤ 60 s), modelo
  `facebook/mms-tts-spa` commit `833b96c0278c85cf09776d565ba8f1cb2819f7ec`, semilla 1234.
  Se comprobó que es reproducible: la misma frase sintetizada dos veces da el mismo audio.
- Navegador local: los 10 reproductores sin autoplay; `message-01.mp3` se reproduce y su
  duración (46,692 s) coincide con la del catálogo. El crédito de la voz es visible.

### Quechua y aymara (experimental)

- 10 MP3 en quechua (`mms-tts-quh`, ~46–51 s; boletín de 45,9 s) y 10 en aymara
  (`mms-tts-ayr`, ~49–52 s; boletín de 52,4 s), con texto traducido por NLLB-200.
  No se omitió ninguna letra (`dropped_characters: []`). Todos quedan con
  `speaker_review: pending`.
- **Fallo encontrado y corregido:** en la primera corrida NLLB entró en bucle y
  repitió «mana allinchu» 29 veces en una frase. Ahora se prohíben los trigramas
  repetidos, se limita la longitud y `check_translation` rechaza las salidas
  degeneradas (prueba `TranslationGuardTests`).
- **Fallo encontrado y corregido:** NLLB tradujo «Oruro.» al aymara como «Jisk'a
  manq'aña». Ahora las frases de una sola palabra (nombres) no se traducen.
- La calidad sigue siendo de borrador: por ejemplo, «cobertura» → *huñunakunata*
  («reuniones») y «pronóstico» → «profecía» en aymara. Para corregirlo,
  `source/traducciones-borrador.json` trae los 20 textos en el formato de
  `--translations`, con la referencia en español hablado. Un hablante los corrige y
  firma en `translator`, y se regeneran las voces con su texto.
- Incidente de la sesión: al detener la primera corrida, el proceso de Python siguió
  vivo y compitió con la segunda durante unos 30 minutos. Se detuvo a mano (PID 484/1512).
  En Windows, si se interrumpe una generación, hay que comprobar que no queden procesos
  `generate_audio_mms.py`.
- Tiempos en este equipo, solo CPU: español ~4 min para 10 audios; quechua o aymara
  ~8–10 min cada uno, sobre todo por la traducción NLLB (~5–15 s por frase).
- Comprobación final: `rm -rf build` y luego `check_dev2.py --audio-assets …` →
  **63 pruebas OK** (1 omitida: la normalización corre en `.venv-tts`, también OK), 30 MP3
  en el manifiesto con hash. El español regenerado es idéntico byte a byte a la primera
  corrida. En el navegador, `print/fixture-a-1.html` reproduce las 3 versiones y muestra el aviso EXPERIMENTAL.
- Registro de la generación: `assets/audio/fixture-dev2-v31-demo/source/generacion.log`.

### Límites

- Nadie ha escuchado aún los MP3 completos: la revisión de escucha P5 (`review.status: pending`) sigue abierta.
- Quechua y aymara son demostraciones de la ruta técnica. No deben presentarse como
  mensajes válidos hasta que un hablante corrija el texto.
- Todo es fixture: el texto dice que no hay resultados reales. Con el paquete de D1
  hay que regenerar el audio con `--input` real (el hash del texto cambia).
- La pronunciación de siglas y nombres no se verificó de oído.

## Bitácora 2026-11-15 00:00–00:50 · Dev 2 asume D1: datos reales, KPI, verificación, alertas y boletines

Trabajo hecho en `nasa-field-shift/raiz-hackaton` (Claude Code). Detalle en `docs/datos/METODOLOGIA.md`;
cifras en `docs/datos/RESULTADOS.md` (se genera desde los datos).

- **Módulo nuevo `raiz_data/`** (solo biblioteca estándar):
  - registro de fuentes por capas;
  - descarga con respaldo y hash;
  - modelo FAO-56 (ET0, Kc, balance diario);
  - escenarios ENSO × periodo × presupuesto × 9 casos;
  - KPI con media, mínimo, máximo y desviación, y ranking con reglas explícitas;
  - sensibilidad con SENAMHI y verificación externa (SENAMHI, INE, VIDECI/prensa, calendario, MERRA-2);
  - dataset SQLite local, alertas (FIRMS, USGS, GDACS) con aprobación humana, y boletines manuales y periódicos.
- **Paquete real** `datos/` (build `raiz-oruro-power-20261111-v1`, 144 resultados): el validador Dev 2 lo
  acepta (`structurally_valid_precalculated_inputs`). Se publicó localmente con 9 MP3 del escenario
  actual (2001–2025, Niño fuerte, secano) y el boletín regional (38 s).
- **Cambios en `raiz_delivery`:**
  - mensajes reales en lenguaje claro (resumen, rango y sensibilidad) con indicadores clave, de ~80–110 s de audio;
  - el audio en borrador se puede escuchar, rotulado (producción sigue exigiendo aprobación);
  - fuentes legibles en la ficha, sin desbordar en móvil.
- **Generador de audio:** modo texto suelto (boletines y alertas, ≤60 s), filtro por escenario, MP3 nombrados por `result_id`.
- **Pruebas:** 77 en total (63 de Dev 2 y 14 de datos), todas OK. Incluyen los ejemplos 8 y 18 de FAO-56 y el cierre del balance de agua.
- **Fallos encontrados y corregidos:**
  - unidades de SoilGrids (factor 100, no 1000);
  - umbral de viento que nunca se alcanzaba;
  - KPI de estrés y regla de cumplimiento que no distinguían nada;
  - frecuencia redondeada que rompía el contrato;
  - títulos desfasados en la web del INE;
  - metadatos de audio que pisaban el JSON del boletín;
  - conexiones SQLite sin cerrar.
- **Pendiente humano:**
  - P6 confirma el punto y revisa los supuestos;
  - P5 escucha los audios y aprueba;
  - alguien aprueba o descarta las alertas borrador en `datos/alertas/`;
  - pedir series diarias a SENAMHI (dirmethi@senamhi.gob.bo);
  - cuenta Earthdata para GPM, SMAP y MODIS.
