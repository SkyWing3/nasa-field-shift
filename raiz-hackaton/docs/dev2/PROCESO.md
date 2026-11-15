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

## Bitácora 2026-11-15 02:30–02:55 · Decisiones v3.2 de la líder (PROMPT_DEV2)

- **Decisiones registradas** en `dist/index.html`, `raiz.html` (nota «Plan v3.2») y `plan-equipo.json` (`decisions_v3_2`).
- **Tablero** (servidor 8787 y `team.sqlite3`): P6-1..6, P5-1, P5-2 y D1-4/5/6 en «Hecho».
  - D1 se marcó «Hecho» y no «En curso» porque Dev 2 ya entregó el paquete real y pasa el contrato.
  - El tablero solo admite tres estados: lo de «pendiente de integración web» de P5-2 queda en esta nota.
- **Recorte D1-5:**
  - un presupuesto (secano) y un suelo (descripción del productor, 150 mm/m);
  - KPI: riego requerido, estrés severo, helada en floración, suelo descubierto con lluvia y viento, cobertura;
  - ranking null y sensibilidad «not_evaluated» (P6-4);
  - resultado: 72 resultados que validan.
- **Publicador:**
  - 4 avisos obligatorios (`lim_zona`, `lim_granizo`, `lim_no_orden`, `sin_datos_fuente`) en el índice y las fichas;
  - boletín regional con el texto aprobado de P6, audio español aprobado por P5 y quechua del productor como `human_recording` con su nota;
  - `creditos.html` desde P6-6, más las fuentes de verificación;
  - `publicacion/editorial.json` aprobado por P5/P6, vigente hasta el 31-dic-2026.
- **Audio:** sin aymara ni quechua sintético; se quitaron del paquete de ejemplo. Mensajes con voz MMS (escucha pendiente, rotulados como borrador).
- **Túnel viejo apagado:** cloudflared PID 6956 y servidor PID 10948. El enlace devuelve 502.
- **Respaldo:** `Documents/raiz-respaldos/agricultural-site-20261115-0254` con SHA-256.
- **Pruebas:** 84 OK.
- **Pendientes:**
  - plantillas P5-1 (`communications_templates.json`): no están en el repo; los avisos usan el texto de P6-6 hasta reemplazarlos;
  - HTTPS estable (D2-6);
  - volver a sincronizar `beta-frontend` (`npm run paquete`) con esta publicación.

Comando completo de publicación:

```powershell
.venv-tts\Scripts\python scripts\generate_audio_mms.py --input datos --editorial publicacion\editorial.json --output assets\audio\<build> --languages es --filtro p2001-2025.nino-fuerte.secano
python scripts\ensamblar_audio_publicacion.py --input datos --editorial publicacion\editorial.json --mensajes assets\audio\<build> --salida assets\audio\<build>-publicacion
python -m raiz_delivery build --input datos --output build\package-real --editorial publicacion\editorial.json --audio-assets assets\audio\<build>-publicacion
python -m raiz_delivery publish --package build\package-real --site-root build\agricultural-site
```

### 03:45 · Plantillas P5-1 integradas

- `content/communications_templates.json` (20 plantillas, revisadas por P6) se embebe en `publicacion/editorial.json` (`message_templates`), así el paquete se reconstruye y valida solo.
- **Mensajes reales:** cmp_decision + agua_riego (papa y haba, con pozo) o agua_secano (quinua) + helada_floracion + cob_descubierto (+ cob_descanso) + lim_muestra + pie de evidencia (fuente · periodo · n · caso · build_id).
  - Con n < 3: lim_muestra_baja («no mostramos comparación»).
  - Con n = 0: sin_datos_kpi.
  - cmp_ciclo se omite porque el ranking es null (v3.2). Cualquier dato nulo omite su frase.
- **Avisos en cada página, con el texto exacto de P5:** lim_zona, lim_granizo, lim_suelo, lim_no_orden y sin_datos_fuente.
- **Audio de los 9 mensajes del escenario actual:** 60–80 s. Publicado y respaldado en `Documents/raiz-respaldos/agricultural-site-20261115-0341`.
- **Pruebas:** 88 OK (4 nuevas de plantillas).

### 04:00 · D2-6 publicado por HTTPS

- **URL:** https://morning-violet-efd4.mila-eloc.workers.dev/releases/raiz-oruro-power-20261111-v1/ (Cloudflare, desplegado por la líder desde `build/sitio-estatico`).
- **Verificado desde afuera:** portada, índice, créditos, fichas (Cloudflare quita `.html` con un 307, y las rutas relativas siguen bien) y audios. El MP3 en quechua publicado tiene el mismo SHA-256 que el aprobado.
- **Tablero:** D2-1, D2-2, D2-4, D2-5 y D2-6 en «Hecho». D2-3 sigue «En curso» porque los 9 MP3 de mensajes (voz MMS) no tienen escucha de P5; el boletín sí está aprobado.

### 15-nov · Integración web, contraste y movimiento

- Navegación superior, preferencias de lectura claras, bloques de color y movimiento editorial; guía en beta-frontend/DESIGN.md.
- Staging de raiz_data.web fuera de public/ para evitar exponer entradas y bloqueos del observador de Vite en Windows. Detener Vite antes de la publicación atómica de current.json en este entorno.
- La publicación derivada conserva derived_from_build_id en cada resultado; el pie hablado cita el cálculo original. Metadatos de publicación mantienen su ID propio. Se reutilizan solo voces con hash de texto e identificadores coincidentes: 11 incluidas, 0 omitidas; no se crean ni aprueban voces nuevas.
- Regresión: una derivación de presentación conserva el texto de voz; cambiar un KPI cambia ese texto. check_dev2.py: 89 pruebas, 1 omitida por dependencia de voz. npm run build completo pasó con Vite detenido.

### 15-nov 08:20 · Alarmas para leer y escuchar, y menú en quechua y aymara

- **Comando:** `python -m raiz_data alarmas --audio --publicar` (`raiz_data/alarms.py`).
  - Calcula señales con datos guardados: ONI de NOAA, frecuencia 4 de 5 de la verificación, lluvia de 30 días de una copia aparte de POWER (`power_reciente_alarmas.json`, no toca el paquete publicado), heladas recientes y fuegos ya aprobados.
  - Escribe `datos/alertas_app/alertas.json` (esquema `raiz-alertas-app-v1`) y un MP3 en español por alarma.
  - Copia todo a `beta-frontend/public/alertas/`, `simulacion/frontend/public/alertas/` y `build/sitio-estatico/alertas/`.
- **Alarmas de hoy:**
  - «El Niño fuerte está en curso» (atención; ONI ASO 2026 = +2,46; n = 5).
  - «Lluvia del último mes» (información; 42 mm frente a 23 mm normales).
- **Quechua y aymara:** son traducción automática con IA (Claude). Cada alarma lleva `traduccion.estado = revision_de_hablante_pendiente` y la nota «el español es la referencia».
- **Audio:** voz sintética Meta MMS, solo en español, con la etiqueta «Requiere revisión de pares antes de difundir». No se emite nada automáticamente.
- **beta-frontend:**
  - `components/Alertas.jsx`: el nivel se indica con texto e icono además del color, con reproductor, fuente, fecha de datos y vigencia. En quechua o aymara aparece un botón «Ver en español».
  - `lib/idioma.js`: selector de idioma (es/qu/ay/otro) en la cabecera. Cambia menú, portada, títulos de sección y pie, y muestra un aviso de traducción con IA. «Otro idioma» explica cómo usar la traducción del navegador. Los datos y las fichas siguen en español.
- **3D:**
  - `ui/components/AlertsPanel.tsx` y `ui/i18n.ts`: selector es/qu/ay en la pantalla inicial (textos principales y botones) y panel de alarmas.
  - Pruebas: 177 (3 nuevas). Lint y tipos OK.
- **Límites:**
  - Ninguna traducción fue revisada por hablantes.
  - No hay audio en quechua ni aymara para las alarmas: MMS no se usa en estas lenguas en el MVP.
  - Las alarmas son señales de datos históricos y del ONI, no un pronóstico.

### 15-nov 08:55 · Toda la interfaz cambia de idioma, y la franja editorial

- **Diccionarios por idioma:** `beta-frontend/src/i18n/qu.json` y `ay.json`, cada uno con 29 claves, 240 textos y 10 patrones con números. Un traductor de pantalla (`src/lib/traductor.js`) cambia los textos de las cuatro vistas, los diálogos, las ayudas de indicadores, la zona de las alarmas y las etiquetas `aria-label`. Al volver a español se restaura todo.
- **Qué no se traduce:** cifras, citas de fuentes, mensajes y boletín aprobados por P5/P6, y bloques con `lang="es"`. Todo es traducción automática con IA, sin revisión de hablantes, y la cabecera lo avisa.
- **Otro idioma:**
  - `npm run idioma -- nuevo <código> "<Nombre>"` crea la plantilla.
  - `npm run idioma -- revisar` lista lo que falta.
  - Guía en `src/i18n/LEEME.md`.
  - «Otro idioma…» sigue usando la traducción del navegador.
- **Franja «Observar · Comparar · Decidir»:** ahora se traduce, va en mayúsculas, con letras más separadas y más lenta (110 s por vuelta, antes 32 s).
  - Causa de que no se moviera: si Windows tiene desactivadas las animaciones, el navegador pide reducir el movimiento y la app lo respeta. Aun así el botón decía «Pausar movimiento».
  - Arreglo: el botón muestra el estado real. Si la persona pulsa «Activar movimiento», solo la franja se mueve, lenta, aunque el sistema pida reducirlo. La elección se guarda.
- **3D:** la zona y la nota «no pronostica» del panel de alarmas también salen en quechua y aymara.
- **Pruebas:** beta-frontend tiene 12 unitarias (3 nuevas) y la integración OK. El 3D tiene 177, con lint y tipos OK.

### 15-nov 09:20 · Enlace entre el 3D y beta-frontend, y siete idiomas listos

- **Enlace en los dos sentidos:**
  - beta-frontend tiene en la cabecera el botón «Simulación 3D». Abre `http://localhost:5173/` en desarrollo, o `VITE_RAIZ_SIMULACION_URL` si está definida. En producción, sin esa variable, no aparece.
  - En el 3D, «Comparar rotaciones» abre en desarrollo el beta-frontend local (`http://localhost:5175/`). En producción sigue abriendo el sitio publicado. Se admite http solo para localhost.
  - Las dos apps pasan `?idioma=` y abren en el mismo idioma.
- **Idiomas listos sin comandos:** español, quechua, aymara, guaraní, inglés, portugués y francés.
  - beta-frontend: `src/i18n/*.json`, 281 frases cada uno. Se eligen desde el selector de la cabecera y van incluidos en la app, así que funcionan sin internet.
  - 3D: pantalla inicial y panel de alarmas.
  - Todos los idiomas salvo el español son traducción automática con IA (Claude), sin revisión de hablantes, y cada pantalla lo avisa.
- **Alarmas en 7 idiomas:** `raiz_data/alarms.py` (`T_MAS`, `LANGS`). El audio sigue solo en español (voz sintética, requiere revisión de pares). Corregido un fallo: al regenerar sin `--audio` se perdía la referencia al MP3. Ahora se reutiliza si el texto hablado es idéntico.
- **Pruebas:** beta-frontend 12 unitarias y 7 de integración; 3D 179 (lint y tipos OK); `check_dev2.py` OK.
- **Límite:** generar un idioma nuevo desde la interfaz, en vivo, exigiría llamar a una IA desde el navegador o un servidor con clave de API. No se hizo, para no exponer claves ni depender de la red en la demo.

### 15-nov 09:55 · Bienvenida, lectura en voz alta y tutorial (3D y beta-frontend)

- **Fuente única:** `content/tutorial/tutorial.json`. Contiene la bienvenida, los textos de interfaz y 10 pasos (para qué sirve y un ejemplo) en 7 idiomas, más los recorridos `simulacion` (6 paradas) y `beta` (6 paradas). Todos los idiomas salvo el español son traducción automática con IA, sin revisión de hablantes.
- **Audios:** `raiz-hackaton/scripts/generar_audio_tutorial.py` (con `.venv-tts`) genera 11 MP3 por idioma con Meta MMS: español (spa), quechua (quh), aymara (ayr) y guaraní (grn, descargado hoy).
  - Quedan en `content/tutorial/audio/` con `manifest.json` (texto leído, sha256, duración) y se copian a `public/tutorial/` de las dos apps.
  - Están marcados «requiere revisión de pares» y solo se regeneran si cambia el texto.
  - Inglés, portugués y francés usan la voz del navegador.
- **Bienvenida:**
  - Se abre la primera vez, cuando no hay idioma configurado.
  - Tiene botones grandes de idioma, un botón redondo grande de altavoz que activa la lectura en voz alta y lee la bienvenida, un interruptor «Quiero ver el tutorial» y el botón «Empezar».
  - Se puede volver a abrir con «Tutorial» (beta-frontend) o «Ver tutorial» (3D).
- **Recorrido:**
  - Oscurece la pantalla y resalta con un anillo amarillo animado el lugar donde tocar, con la etiqueta «Toca aquí».
  - La tarjeta muestra el paso N de M, el título, «Para qué sirve», un ejemplo, botones de voz y de escuchar, Anterior/Siguiente y «Saltar tutorial ✕» siempre visible. También responde a Esc y a las flechas.
  - Con la voz activada, lee cada paso solo.
  - Respeta «reducir movimiento». En el móvil la tarjeta se muestra abajo.
- **Enlace entre apps:** el 3D pasa `idioma`, `voz` y `tutorial=si` al beta-frontend, que arranca su propio recorrido si la persona lo pidió y no lo vio antes.
- **Pruebas:** beta-frontend 15 unitarias (3 nuevas sobre el contenido del tutorial); 3D 179, con lint y tipos OK. Verificado en el navegador: bienvenida en los dos, recorrido en aymara (3D) y quechua (beta), y «Saltar».

### 15-nov 11:00 · Simulación revertida y voces de ElevenLabs para español e inglés

- **Simulación:** por decisión de la líder no se usa la versión remota de `simulacion/` (Raíz 2D como entrada, TerraLab en `/terralab.html`, motor `raiz.py`). El commit local `b2d12b8` la devuelve al estado de `3f04e30`. Se conservan `content/p6/`, la regla de `.gitignore` sobre el permiso del productor y el `README.md` de la raíz. Pruebas: frontend 180, backend 106.
- **Voces:**
  - `scripts/generar_audio_tutorial_elevenlabs.py` genera los 22 audios del tutorial en español e inglés con ElevenLabs (`eleven_multilingual_v2`, voces prediseñadas `EXAVITQu4vr4xnSDxMaL` para español y `21m00Tcm4TlvDq8ikWAM` para inglés, semilla 1234).
  - La clave se lee de `ELEVENLABS_API_KEY` en `raiz-hackaton/.env` (ignorado por git). No se imprime ni se escribe en ningún archivo (comprobado).
  - Quechua, aymara y guaraní siguen con Meta MMS. El generador MMS ya no pisa los audios de ElevenLabs.
  - El manifiesto registra en cada audio su motor, modelo y voz. Las apps muestran «Voz sintética: requiere revisión de pares (ElevenLabs)» o «(Meta MMS)».
  - El inglés ahora tiene MP3 propio en lugar de la voz del navegador.
- **Verificado por internet:** en el 3D y en beta-frontend suenan es/en con ElevenLabs y qu con MMS, y el recorrido lee cada paso.
