# Registro de decisiones — TerraLab 3D

Formato ADR ligero. Estados: **Aceptada**, **Propuesta** (se confirmará al implementarla), **Reemplazada por ADR-XXX**.

Las decisiones no se borran: si cambian, se añade una nueva ADR que reemplaza a la anterior.

---

## ADR-001 — Stack tecnológico base
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Definido en las instrucciones maestras (`CLAUDE.md`).
- **Decisión:** Frontend con React 19 + TypeScript + Vite + Three.js + React Three Fiber 9 + Drei + Zustand. Backend con Python + FastAPI + NumPy.
- **Consecuencias:** Las versiones exactas se fijan al instalar y se registran en `ARCHITECTURE.md`.

## ADR-002 — Separación en seis capas
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Requisito explícito de separar renderizado, interacción, estado de simulación, motor agronómico, datos científicos y persistencia.
- **Decisión:** Cada capa vive en su propio módulo con reglas de dependencia unidireccionales (ver `ARCHITECTURE.md` §3). El renderizado es de solo lectura; la interacción emite comandos; el motor es una biblioteca pura.
- **Consecuencias:** Más ficheros e interfaces explícitas a cambio de testabilidad y de poder ejecutar simulaciones sin render.

## ADR-003 — Simulación por pasos discretos, independiente de `useFrame`
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (principio) / Propuesta (paso diario)
- **Contexto:** Requisito de no acoplar la simulación científica al bucle de render.
- **Decisión:** El tiempo simulado avanza solo mediante comandos explícitos procesados por el motor. `useFrame` solo anima e interpola snapshots. Se propone paso **diario**, a confirmar en la fase del motor agronómico.
- **Consecuencias:** Resultados idénticos con independencia del FPS; posibilidad de simular años en lote para comparar rotaciones.

## ADR-004 — Motor agronómico autoritativo en el backend
- **Fecha:** 2026-11-14
- **Estado:** Propuesta
- **Contexto:** El stack asigna NumPy al backend; los modelos científicos deben ser reproducibles y testeables de forma aislada.
- **Decisión:** El motor agronómico se implementa en Python (`backend/app/engine/`) como funciones puras. El frontend mantiene un espejo del estado (Zustand) actualizado a partir de las respuestas del backend.
- **Consecuencias:** Requiere backend en ejecución para simular. Se confirmará o ajustará (p. ej. modo offline) en la fase de scaffolding/motor.

## ADR-005 — Trazabilidad de procedencia de datos
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Prohibición de presentar resultados simulados o sintéticos como datos reales.
- **Decisión:** Toda magnitud de entrada al motor lleva metadatos de procedencia (observado/reanalizado, literatura, supuesto de usuario, sintético). La UI muestra la procedencia y marca visiblemente los datos sintéticos.
- **Consecuencias:** Esquemas de datos algo más ricos; auditoría posible de cualquier resultado.

## ADR-006 — Persistencia inicial local / SQLite
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Instrucción de empezar con almacenamiento local o SQLite y migrar a PostgreSQL solo ante necesidad real.
- **Decisión:** Persistencia detrás de una interfaz de repositorio; implementación inicial local/SQLite.
- **Consecuencias:** Migrar a PostgreSQL debería requerir solo una nueva implementación del repositorio.

## ADR-007 — Política de licencias de assets
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Requisito de usar solo recursos con licencias compatibles y no inventar licencias.
- **Decisión:** Preferencia por CC0. Se admiten licencias con atribución (p. ej. CC-BY) registrando la atribución. Se evitan licencias NC/ND o de uso restringido salvo decisión explícita. Cada asset se registra en `ASSETS.md` con URL de origen y licencia verificada en la fuente antes de descargarlo.
- **Consecuencias:** Ningún asset entra al repositorio sin entrada en `ASSETS.md`.

---

# Fase 01 — Arquitectura y configuración inicial

## ADR-008 — Monorepositorio `frontend/` + `backend/` orquestado con Make
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Dos ecosistemas (npm y Python) sin código compartido en tiempo de ejecución.
- **Decisión:** Un único repositorio git con `frontend/` y `backend/` independientes y un `Makefile` raíz para instalar, levantar, verificar y probar ambos. Sin workspaces de npm ni orquestadores (Turborepo, Nx) ni `concurrently`: `make -j2` levanta los dos servidores. NumPy no se instala hasta que el motor agronómico lo use, para no añadir dependencias sin uso.
- **Consecuencias:** Cero dependencias de orquestación. Requiere `make`, presente en macOS y Linux. En Windows se usarían los comandos equivalentes del README.

## ADR-009 — TypeScript 6.0 en lugar de 7.x
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** `typescript@latest` es 7.0.2, pero `typescript-eslint@8.72.2` declara `typescript >=4.8.4 <6.1.0`, y el lint con información de tipos es parte de la calidad obligatoria.
- **Decisión:** Fijar `typescript@6.0.3`, la última versión compatible.
- **Consecuencias:** Revisar la migración a TS 7 cuando typescript-eslint la soporte.

## ADR-010 — Unidades marcadas en el sistema de tipos y escala BBCH
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Requisito de unidades explícitas en variables científicas; los errores de unidades son silenciosos en un modelo numérico.
- **Decisión:** `Quantity<U>` = `number` con marca de unidad solo en tiempo de compilación (símbolos basados en UCUM), construido con `quantity(valor, unidad)`, que además rechaza valores no finitos. Fechas de simulación como `IsoDate` (`YYYY-MM-DD`, validada). Estado fenológico con la escala BBCH (Meier, 2018). El esquema de dominio es la v0 (`schemaVersion: 0`) y se revisará con el motor.
- **Alternativas descartadas:** sufijos de unidad en los nombres (sin comprobación del compilador) y bibliotecas de unidades en tiempo de ejecución (coste y dependencia).
- **Consecuencias:** La aritmética devuelve `number` y hay que volver a marcarla explícitamente, lo que es intencionado. En la frontera HTTP habrá que validar y marcar los datos al recibirlos.

## ADR-011 — Carga diferida del motor gráfico y chunk propio de Three.js
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Three.js + R3F + Drei pesan ~950 kB minificados; la pantalla inicial no los necesita.
- **Decisión:** `SceneViewport` se importa con `React.lazy`. `three` va en un chunk propio mediante `build.rolldownOptions.output.codeSplitting.groups`. **No** se agrupa R3F/Drei: los grupos de Rolldown incluyen dependencias recursivamente por defecto, así que arrastraban React al chunk y el HTML acababa precargando 950 kB (detectado y verificado al revisar el build). `chunkSizeWarningLimit` = 800 kB, justo por encima del núcleo indivisible de Three.js (743 kB).
- **Consecuencias:** Carga inicial de 77 kB gzip de JS. El aviso de tamaño vuelve a saltar si algo más crece.

## ADR-012 — CORS solo en desarrollo y mismo origen en producción
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt exige CORS restringido al entorno de desarrollo.
- **Decisión:** `CORSMiddleware` solo se registra con `TERRALAB_ENVIRONMENT=development`, con orígenes explícitos (por defecto los puertos locales de Vite 5173 y 4173, en `localhost` y `127.0.0.1`). Se rechazan comodines y orígenes mal formados al arrancar. Sin credenciales. En producción el frontend y la API compartirán origen (proxy inverso, a definir cuando se despliegue) y no habrá CORS. `/api/docs` se desactiva en producción.
- **Consecuencias:** Un despliegue con orígenes cruzados requerirá una decisión explícita nueva.

## ADR-013 — Vitest para lógica pura y Playwright para UI y WebGL
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** WebGL no existe en jsdom; probar componentes 3D allí obligaría a simularlo todo.
- **Decisión:** Vitest en entorno `node` cubre la lógica pura (dominio, cliente HTTP, stores, formato, configuración). Playwright cubre la UI en un navegador real, con WebGL real verificado por análisis de píxeles del lienzo, la API real y una API simulada caída, la ausencia de errores de consola y el diseño móvil. No se instalan jsdom ni Testing Library.
- **Consecuencias:** Menos dependencias y pruebas de UI más fieles. Las e2e necesitan Chromium (`make install-browsers`).

## ADR-014 — Override de `minimatch` en typescript-eslint
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** `npm audit` señaló GHSA-g3hv-75wg-m249 (DoS moderado) en `minimatch@10.2.6`, que arrastra `@typescript-eslint/typescript-estree@8.72.2`. El "fix" de npm bajaba typescript-eslint a 8.36 (cambio incompatible).
- **Decisión:** `overrides` → `minimatch@11.0.8` (la misma versión que ya usa ESLint 10) solo para `typescript-estree`. Verificado: `npm audit` sin vulnerabilidades y las reglas con tipos siguen detectando errores.
- **Consecuencias:** Retirar el override cuando typescript-eslint actualice su dependencia.

## ADR-015 — `httpx2` para el TestClient de Starlette
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Starlette 1.10 emite `StarletteDeprecationWarning` al usar `httpx` en `TestClient` y recomienda `httpx2`. Verificado en PyPI (2.16.0, mantenido por la organización pydantic) y en el código de `starlette/testclient.py`, que lo importa con prioridad.
- **Decisión:** Dependencia de desarrollo `httpx2` en lugar de `httpx`.
- **Consecuencias:** Pruebas sin avisos de obsolescencia.

## ADR-016 — Configuración de render provisional
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (provisional hasta la fase de escena)
- **Decisión:** `frameloop="demand"`, `dpr=[1,2]`, `shadows="percentage"` (PCF: Three.js r187 eliminó `PCFSoftShadowMap`, que es lo que R3F usa con `shadows`, y lo avisaba en consola), tone mapping ACES (el predeterminado de R3F) con exposición 0,62 porque el cielo procedural saturaba el horizonte. El cielo usa el shader procedural de Drei (`<Sky>`) con parámetros solo visuales, sin HDRI ni recursos externos. El suelo es un plano PBR sin texturas, rotulado en pantalla como "Escena provisional".
- **Consecuencias:** No representa la calidad visual objetivo. La fase de escena sustituirá el cielo y el suelo por HDRI, terreno y texturas PBR registradas en `ASSETS.md`.

## ADR-017 — Entorno Python con venv + pip y lock de restricciones
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** `uv` y `poetry` no están instalados; pip 26 y venv sí.
- **Decisión:** `pyproject.toml` (build con hatchling) con rangos compatibles y `requirements.lock` (`pip freeze`) aplicado como restricciones (`pip install -c requirements.lock -e ".[dev]"`) para instalaciones reproducibles.
- **Consecuencias:** Para actualizar dependencias hay que regenerar el lock explícitamente. Se puede migrar a `uv` sin cambiar `pyproject.toml`.

---

# Fase 02 — Actualización de visión y pipeline de assets

## ADR-018 — Simulador de gestión agrícola del género de Global Farmer
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt de la fase 02 redefine la experiencia: mapa mundial, ubicación, granja 3D, parcelas libres, cultivos, ciclo completo, tiempo en días/meses/años, clima, rotaciones y comparación de futuros con datos NASA.
- **Decisión:** Global Farmer es solo una referencia de género y mecánicas generales. TerraLab 3D conserva su nombre, identidad, interfaz y contenido propios; no se usan assets, código, interfaz ni recursos de ese juego. `CLAUDE.md` y `ROADMAP.md` se actualizan sin perder las reglas anteriores.
- **Consecuencias:** El roadmap pasa a 13 fases (0–12) con el mapa mundial y la generación de la granja antes de las parcelas.

## ADR-019 — Biblioteca de assets fuera de git y del build, reproducible y verificada
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Los originales ocupan ~450 MB y la biblioteca procesada ~131 MB. Versionarlos sin Git LFS haría el repositorio inmanejable, y la aplicación todavía no usa ningún asset en producción.
- **Decisión:** `frontend/.asset-cache/` (originales) y `frontend/asset-library/` (procesados y `catalog.json`) quedan en `.gitignore`. Se versionan la selección (`selection.ts`), el código del pipeline y `sources.lock.json` con el SHA-256 y el tamaño de cada original. `make assets` lo regenera todo y `make assets-verify` comprueba la biblioteca. Un plugin de Vite sirve `asset-library/` en `/asset-library/` solo en desarrollo, con protección contra recorrido de directorios.
- **Consecuencias:** Un clon nuevo necesita `make assets` (≈ 400 MB de descarga) para el visualizador y sus pruebas e2e. El build de producción no cambia (77 kB gzip iniciales). La fase que use assets en el juego decidirá cuáles se publican y cómo (CDN propia, Git LFS o copia al build).

## ADR-020 — Pipeline en Node con glTF-Transform, meshoptimizer y sharp (sin Blender)
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt pide scripts de Blender si está disponible. Blender no está instalado (`which blender` y `/Applications` sin resultados). Poly Haven ya publica glTF, así que la importación no requiere Blender.
- **Decisión:** Pipeline en TypeScript ejecutado por Node 26 (eliminación de tipos nativa), dentro del paquete `frontend` para reutilizar ESLint, Prettier, `tsc` y Vitest. Dependencias de desarrollo fijadas: `@gltf-transform/core|extensions|functions` 4.5.1 (MIT), `meshoptimizer` 1.3.0 (MIT), `sharp` 0.35.5 (Apache-2.0), `gltf-validator` 2.0.0-dev.3.10 (Apache-2.0, Khronos; todas sus versiones en npm son *dev*) y `fflate` 0.8.3 (MIT, ya presente como dependencia de `@types/three`). `npm audit`: 0 vulnerabilidades. No se escribieron scripts de Blender porque no podrían ejecutarse ni verificarse.
- **Consecuencias:** El pipeline es multiplataforma y reproducible con `npm ci`. Blender queda como herramienta opcional para modelado propio (p. ej. cultivos procedimentales, ADR-025).

## ADR-021 — LOD en un único GLB, simplificación sensible a atributos y pivotes por tipo
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Los escaneos de Poly Haven tienen costuras de UV por todas partes (`boulder_01`: 67 042 vértices para 33 063 posiciones únicas). `simplify()` de glTF-Transform no pasa `Permissive` a meshoptimizer y se quedaba en 54 k triángulos aunque se pidieran 5 k. Además, centrar los modelos movía el pivote del autor (raíces y bases de roca bajo el suelo a propósito, árboles que giran sobre el tronco), y `join()` fusionaba las variantes de cada conjunto.
- **Decisión:**
  - Cada GLB contiene nodos `LOD0`, `LOD1` y `LOD2` que comparten materiales y texturas. LOD0 se limita a un presupuesto por tipo (p. ej. 150 k triángulos para árboles y 20 k para objetos) y los niveles siguientes conservan el 30 % y el 8 %.
  - La simplificación usa `simplifyWithAttributes` con el modo `Permissive` (normal con peso 0,5 y UV con peso 1). En `boulder_01` alcanza 39,7 k / 19,8 k / 5,3 k triángulos con un error del 0,2–1,9 % del radio.
  - Las variantes se conservan como nodos separados (`join({ keepMeshes: true })`).
  - Pivote `author` para la naturaleza: se conserva el origen y se permite que hasta la mitad de la altura quede enterrada. Pivote `base` para objetos manufacturados: solo se desplaza en Y para apoyarlos en el suelo.
- **Consecuencias:** Los modelos se pueden instanciar por variante. El visualizador construye `THREE.LOD` con cambios a 8 y 20 radios, valores provisionales hasta medir la escena real.

## ADR-022 — Formatos web: GLB + EXT_meshopt_compression + WebP medido (sin Draco ni KTX2 por ahora)
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (KTX2 pendiente de la fase de rendimiento)
- **Contexto:** Draco requiere un decodificador que drei descarga por defecto de una CDN de Google: sería un recurso externo en tiempo de ejecución. KTX2/Basis reduciría la memoria de GPU 4–8×, pero exige `toktx`/`basisu`, que no están instalados. WebP casi sin pérdida pesaba más que el JPEG de origen (6,0 MB frente a 5,6 MB en el normal 2K de `farm_soil`).
- **Decisión:**
  - Geometría con cuantización y `EXT_meshopt_compression`. El decodificador meshopt ya viene empaquetado con three.js, así que no se usa ninguna CDN.
  - Texturas en WebP, con ajustes elegidos midiendo tamaño y PSNR en `farm_soil` 2K:
    - Color: q85 con submuestreo inteligente.
    - Datos (normal y ORM): q92 con submuestreo inteligente. En el normal dio 2,6 MB y ≈ 36,5 dB, frente a 3,0 MB y ≈ 33,5 dB de JPEG 4:4:4 q90.
    - Altura: q90 en gris.
  - Modelos con texturas de hasta 1024 px; materiales de terreno a 2048 y 1024 px.
  - El catálogo estima la memoria de GPU de cada asset (RGBA8 con mipmaps).
- **Consecuencias:** Biblioteca de 131 MB para 41 assets. La memoria de GPU sin comprimir está documentada. La fase de rendimiento evaluará KTX2 con sus herramientas.

## ADR-023 — Validación automática de cada asset
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Un asset mal escalado, flotando o corrupto se descubriría tarde, ya en la escena. Las dimensiones que publica Poly Haven no son fiables para validar: miden su escena `.blend` completa (`island_tree_01`: 12,46 m de ancho publicados frente a 4,76 m del glTF).
- **Decisión:** Un asset solo queda `available` si supera todas sus comprobaciones. Si falla alguna, queda `error` con el motivo.
  - Modelos:
    - Khronos glTF-Validator sin errores sobre el GLB final.
    - Escala del glTF de origen conservada (±3 %).
    - Altura plausible por tipo, para detectar errores de unidades.
    - Base en el suelo según el tipo de pivote.
    - LOD0 dentro del presupuesto, y cada LOD con menos triángulos que el anterior.
    - Texturas en potencia de dos y dentro del tamaño máximo.
  - Materiales: resolución exacta, estadística del mapa normal y metalicidad ≈ 0.
  - HDRI: cabecera Radiance y proyección 2:1.
  - Las dimensiones publicadas se guardan y se muestran solo como dato informativo.
  - La integridad de los originales se comprueba con MD5 (publicado por Poly Haven) y SHA-256 (lock). La de los procesados, con el SHA-256 del catálogo.
- **Consecuencias:** El primer procesado detectó 10 problemas reales, todos corregidos en el pipeline: los pivotes, las variantes fusionadas y la simplificación bloqueada por las costuras.

## ADR-024 — Uso de API públicas, licencias y privacidad
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt autoriza las API públicas gratuitas respetando sus condiciones. Las condiciones de la API de Poly Haven piden un User-Agent propio del software (2.4). Las instrucciones de privacidad impiden enviar el nombre del proyecto o del usuario a servicios externos sin autorización.
- **Decisión:** User-Agent genérico `farm-asset-pipeline/0.1`, propio del pipeline y sin datos del usuario; se puede cambiar con `ASSET_PIPELINE_USER_AGENT`. Respuestas de la API en caché, concurrencia 3 y reintentos con espera. Los assets se autoalojan, por lo que no aplica la atribución que exige el uso de la API en vivo (2.5); aun así, el visualizador y el catálogo muestran fuente, autoría y licencia. Licencias verificadas el 2026-11-14 en <https://polyhaven.com/license> y <https://docs.ambientcg.com/license/>.
- **Consecuencias:** Si el proyecto se publica, conviene sustituir el User-Agent por uno que identifique el producto, como prevén las condiciones de Poly Haven.

## ADR-025 — Cultivos y cerca rural de madera: faltantes documentados, sin sustitutos
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:**
  - Poly Haven y ambientCG no publican papa, maíz ni haba.
  - En Sketchfab (API pública de búsqueda) hay modelos de maíz CC-BY, pero:
    - La única planta de papa realista es CC BY-NC, incompatible con ADR-007.
    - Los modelos CC0 de *Solanum tuberosum* son tubérculos.
    - No hay ningún modelo de *Vicia faba*; *Vicia sativa* es otra especie.
    - Toda descarga exige cuenta y aceptar los términos del servicio (la API responde `401`).
  - Poly Haven solo tiene una cerca de malla metálica, que sí se incorporó.
- **Decisión:** Los cuatro recursos figuran en el catálogo como `missing`, con el motivo y alternativas verificadas (URL, autor y licencia según la API de Sketchfab). El visualizador muestra un panel explicativo y ningún sustituto. Alternativa recomendada para los cultivos: modelado procedimental por estado BBCH con texturas de hoja CC0, porque un escaneo representa un único estado de crecimiento.
- **Consecuencias:** Descargar las alternativas CC-BY requiere intervención del usuario (cuenta de Sketchfab) y registrar su atribución. La decisión se tomará en la fase de cultivos.

## ADR-026 — Visualizador de assets como página de desarrollo
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt pide una página de desarrollo para inspeccionar assets sin afectar al producto.
- **Decisión:** Segunda entrada HTML de Vite (`asset-viewer.html` → `src/asset-viewer/`). No forma parte de `build.rollupOptions.input`, por lo que no llega al build de producción, y la pantalla inicial solo la enlaza en desarrollo (`import.meta.env.DEV`). Usa R3F con:
  - render bajo demanda (continuo solo al rotar o al medir FPS);
  - `Environment` de drei con los HDRI locales;
  - `THREE.LOD`;
  - modos de inspección por mapa con un `ShaderMaterial` que muestra datos sin corrección de color;
  - liberación diferida de recursos de GPU compatible con `StrictMode`;
  - estadísticas leídas de `renderer.info` tras dibujar cada fotograma.

  Selección enlazable por `#id`.
- **Consecuencias:** Herramienta de inspección y regresión visual: las pruebas e2e cargan cada asset disponible con ella.

---

# Fase 03 — Mapa mundial y selección geográfica

## ADR-027 — Mapa base: MapLibre + OpenFreeMap (vector) + Sentinel-2 cloudless 2016 (satélite)
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Se necesita un mapa mundial navegable con coste cero, sin abusar de servidores comunitarios y con la atribución visible. Políticas revisadas el 2026-11-14:
  - **Teselas de openstreetmap.org:** su política prohíbe el uso intensivo y la descarga masiva, exige un User-Agent propio y recomienda no fijar la URL en el código.
  - **OpenFreeMap:** instancia pública gratuita, sin límites de vistas, sin claves ni cookies; uso comercial permitido; atribución obligatoria («OpenFreeMap © OpenMapTiles Data from OpenStreetMap»), que MapLibre añade sola.
  - **EOX:** permite usar sus mapas en aplicaciones con atribución y un enlace a EOX::Maps. Las ediciones Sentinel-2 cloudless 2016 y 2017 son CC BY 4.0; las de 2018 a 2025, CC BY-NC-SA.
  - **NASA GIBS:** libre y con agradecimiento solicitado, pero su mosaico global útil (Landsat WELD) es de hasta el año 2000.
- **Decisión:**
  - Biblioteca: MapLibre GL JS 6.16.0 (BSD-3), la última versión con al menos dos semanas de antigüedad.
  - Mapa base: estilo vectorial «Liberty» de OpenFreeMap.
  - Satélite: Sentinel-2 cloudless 2016 de EOX, a 10 m, con la fuente limitada a zoom 15 para no pedir teselas sin más detalle; la interfaz indica su resolución y año.
  - Ambos proveedores son datos configurables (`VITE_BASEMAP_STYLE_URL` y `VITE_SATELLITE_TILES_URL`); no se usan los servidores de teselas de openstreetmap.org.
  - Sin precarga: MapLibre solo pide las teselas visibles.
  - Atribución siempre desplegada.
  - Las pruebas e2e sustituyen ambos servicios por respuestas locales.
- **Consecuencias:**
  - La imagen de satélite es de 2016 y se ve borrosa a escala de parcela.
  - Las etiquetas del mapa salen como las define el estilo de OpenFreeMap (nombres en inglés o locales).
  - Un despliegue público con mucho tráfico debería revisar si conviene autoalojar las teselas, que OpenFreeMap también publica como descarga.

## ADR-028 — Búsqueda de lugares: nomenclátor GeoNames local por defecto; Nominatim solo por decisión explícita
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** La política de uso de Nominatim (<https://operations.osmfoundation.org/policies/nominatim/>) impone condiciones concretas:
  - Como máximo 1 petición por segundo en total para la aplicación.
  - User-Agent o Referer que identifique la aplicación.
  - Atribución visible y caché de resultados.
  - Prohibición del autocompletado.
  - Posibilidad de cambiar de servicio sin actualizar el software.
  - Su uso solo está permitido si quien desarrolla la aplicación lo decide de forma deliberada e informada; el código generado por IA debe cumplir la política, y la IA debe señalarla.
  - Recomienda un proxy con caché.

  El prompt prohíbe depender de un servicio público sin revisar su política.
- **Decisión:**
  - **Frontend:** consulta solo la API propia (`GET /api/geocoding/search`, `/info`), detrás del adaptador `place-search`. Las coordenadas escritas (decimales o sexagesimales) se resuelven en el navegador. No hay autocompletado: se busca al pulsar «Buscar».
  - **Backend:** el proveedor se elige con `TERRALAB_GEOCODER`.
    - `geonames` (por defecto): nomenclátor local generado con `make geodata` a partir del volcado público `cities500` de GeoNames (CC BY 4.0; 237 125 lugares). Usa SQLite FTS5 sin acentos, con coincidencias en el nombre antes que en la región y el país. No hace peticiones externas en tiempo de ejecución.
    - `nominatim`: adaptador desactivado por defecto. Exige `TERRALAB_NOMINATIM_USER_AGENT` y URL HTTPS, aplica un intervalo de ≥ 1 s con un cerrojo global, cachea durante 24 h y muestra la atribución de OSM.
    - `disabled`: sin búsqueda por nombre.
  - **Errores HTTP:** 503 si no está disponible (con el motivo, p. ej. «ejecuta make geodata»), 502 ante un error externo y 504 por tiempo agotado.
- **Consecuencias:**
  - La búsqueda cubre localidades con más de 500 habitantes y cabeceras administrativas; no encuentra direcciones ni accidentes geográficos.
  - Activar Nominatim es una decisión que corresponde al usuario, tras leer su política.
  - `httpx2` pasa a ser dependencia de ejecución del backend.

## ADR-029 — Sistema de coordenadas local: plano tangente ENU sobre WGS84 y región definida en metros
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** La escena Three.js necesita coordenadas métricas estables (float32 en la GPU) y la superficie no debe calcularse tratando grados como metros.
- **Decisión:**
  - **Conversión:** geodésicas WGS84 → ECEF → ENU (este, norte, arriba) en un origen fijo. Escena Three.js: `x = E`, `y = U`, `z = −N` (mismos ejes que `sun.ts`). ECEF → geodésicas por iteración, con fórmula de altura estable cerca de los polos.
  - **Región:** se define por centro, ancho y largo en metros y orientación (azimut del eje largo); los vértices se obtienen con la ENU inversa. Límites: lados de 50 m a 5 km y latitud de hasta ±85° (límite de Web Mercator).
  - **Origen fijo:** el origen del marco se fija en el centro al confirmar y se guarda aparte del centro.
  - **Error verificado en las pruebas:**
    - Distancias horizontales ENU frente a geodésicas: < 1 ppm hasta 3,5 km, a −17,5° y a 70° de latitud.
    - Caída de la superficie bajo el plano: d²/2R (7,8 cm a 1 km; 1,96 m a 5 km), que corregirá el relieve en la fase de terreno.
- **Consecuencias:**
  - Regiones mayores de 5 km o cercanas a los polos quedan fuera.
  - Con float32 y un origen en el centro, la precisión en la escena es submilimétrica en todo el rango.

## ADR-030 — Persistencia local de la ubicación con interfaz de repositorio
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (provisional hasta la fase de persistencia)
- **Contexto:** El prompt pide guardar la ubicación y poder modificarla. ADR-006 prevé almacenamiento local o SQLite.
- **Decisión:** `SiteRepository` (`load`/`save`/`clear`) implementado sobre `localStorage`, en la clave `terralab.site` con `schemaVersion: 1`.
  - Al leer se valida todo: coordenadas, límites de la región, origen, nombre y fecha. Un registro no válido se descarta y se avisa en la pantalla inicial.
  - Los errores de escritura (modo privado, cuota) se muestran en el diálogo de confirmación.
  - La ubicación se carga antes del primer render.
- **Consecuencias:** La ubicación vive en un único navegador. La fase de persistencia podrá llevarla a la API/SQLite cambiando solo la implementación del repositorio.

## ADR-031 — Región demostrativa del Valle Alto de Cochabamba, verificada con fuentes independientes
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt pide un preset reproducible en el valle de Cochabamba, verificado y sin presentarlo como una propiedad real.
- **Decisión:** rectángulo de 400 × 300 m (12 ha) orientado al norte, con centro en −17,551334°, −65,861983° (a 3,06 km de Punata). Verificación:
  1. **OpenStreetMap (consulta a Overpass, datos del 2026-11-14T19:54Z):** los cuatro vértices calculados por el módulo `geo` están dentro de la vía 723914107 (`landuse=farmland`), a ≥ 281 m de su borde.
  2. **ESA WorldCover 10 m 2021 v200** (lectura parcial del COG de AWS Open Data): 99,5 % de los 1 564 píxeles son «cultivos» y 0,5 % pastizal. En 2 × 2 km, 87,9 % de cultivos y 9,0 % construido.
  3. **GeoNames:** localidades más cercanas por distancia geodésica: Punata a 3,06 km, Cliza a 8,51 km y Arani a 10,07 km.

  La interfaz y los datos del preset declaran que no corresponde a ninguna propiedad, parcela catastral ni explotación real.
- **Consecuencias:** Las pruebas fijan las coordenadas y medidas del preset. El preset no incluye datos de OSM (solo el identificador de la vía), así que no hay obligaciones de la ODbL sobre el repositorio.

## ADR-032 — GeographicLib para distancias y áreas geodésicas
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Las medidas mostradas (superficie, lados, orientación) deben ser geodésicas sobre el elipsoide, no planas en grados. Turf.js calcula áreas sobre una esfera.
- **Decisión:**
  - Se usa `geographiclib-geodesic` 2.2.0 (MIT, C. F. F. Karney), la implementación de referencia de «Algorithms for geodesics» (J. Geodesy 2013), para la geodésica inversa y el área y perímetro de polígonos.
  - Se importa como módulo CommonJS por defecto, para que funcione igual en Vite, Vitest y Node.
  - Validación: el área del octante del elipsoide coincide con la fórmula analítica con error relativo < 1e-12. El área geodésica de cada región coincide con ancho × largo con error < 1 ppm.
- **Consecuencias:** Dependencia de ejecución de unos 10 kB gzip, cargada solo con las pantallas de ubicación (ADR-033).

## ADR-033 — Carga diferida del mapa y de la geodesia; chunk propio de MapLibre
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Al integrar el mapa, el JS inicial pasó de 77,5 a 98 kB gzip: GeographicLib y las pantallas de ubicación entraban en la carga inicial a través de los barriles `geo` y `ui`. MapLibre ocupa ~1 078 kB minificado, más que el umbral de aviso de 800 kB (ADR-011).
- **Decisión:**
  - Las medidas geodésicas pasan a `geo/metrics.ts`, fuera del barril.
  - `LocationScreen` y `FarmScreen` se cargan de forma diferida, y el barril `ui` deja de exportarlos.
  - La pantalla inicial resume la superficie con ancho × largo (igual al área geodésica con error < 1 ppm).
  - MapLibre pasa a un chunk propio y cacheable, como Three.js. El umbral de aviso sube a 1 100 kB, justo por encima de MapLibre, para seguir detectando cualquier otro crecimiento.
- **Consecuencias:** Carga inicial de 85,3 kB gzip de JS (index, `ui` e `Icon`, medida en el build final de la fase). El mapa descarga 293 kB gzip la primera vez y la geodesia unos 10 kB; luego quedan en caché.

# Fase 04 — Generación geográfica del mundo agrícola 3D

## ADR-034 — Elevación: NASADEM vía el almacenamiento público de OpenTopography
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (fuente autorizada por el usuario el 2026-11-14)
- **Contexto:** El prompt pide elevación real de fuentes gratuitas y legalmente accesibles, descargando solo lo necesario. Todas las fuentes evaluadas imponen alguna condición, y CLAUDE.md exige consultar antes de aceptar condiciones de un servicio. Opciones revisadas en origen:
  | Fuente | Resolución y cobertura | Acceso | Condición |
  |---|---|---|---|
  | NASADEM (LP DAAC) | 1″ (≈ 30 m), 56° S–60° N, SRTM 2000 | Earthdata | Cuenta y credenciales |
  | NASADEM (Microsoft Planetary Computer) | Igual | COG con token SAS anónimo | Aceptar los *Supplemental Terms of Use* (tokens intransferibles, límites) |
  | **NASADEM (OpenTopography, S3 público)** | Igual | COG, lectura parcial anónima | «Al acceder aceptas citar a OpenTopography y la fuente del dataset» |
  | Copernicus GLO-30 (AWS) | 1″, global (salvo 2 países), 2011–2015, DSM | COG anónimo | Aceptar la licencia Copernicus (avisos, exención de responsabilidad, transmitir obligaciones) |
- **Decisión:** NASADEM HGT v001 desde `https://opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be/` (COG int16, DEFLATE, mosaicos de 512 px, `PixelIsPoint`, alturas ortométricas EGM96). El usuario eligió esta opción en una consulta explícita. La cita (NASA JPL, doi:10.5067/MEASURES/NASADEM/NASADEM_HGT.001, y OpenTopography) figura en la API (`/api/world/datasets`), en la escena y en `docs/ASSETS.md`. Las teselas inexistentes son océano (0 m); fuera de 56° S–60° N se responde 422.
- **Consecuencias:** Datos de la NASA, coherentes con el objetivo del proyecto. Es un modelo de superficie de radar de 2000: incluye parte de la vegetación y las construcciones y tiene un ruido vertical de ~1 m en terreno llano (medido: 1,04 m de desviación típica de los residuos a σ = 2 px en el fondo del valle). Copernicus y Planetary Computer quedan documentados como alternativas que requieren aceptar sus condiciones.

## ADR-035 — Lector propio de COG por rangos de bytes con caché en disco; `make worlddata`
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Hay que leer ventanas pequeñas de archivos de 20–40 MB sin descargarlos. GDAL/rasterio no ofrece ruedas fiables para Python 3.15 y añadiría una dependencia pesada. `tifffile` necesita `imagecodecs` para varios códecs.
- **Decisión:**
  - `app/data_sources/raster/`: lectura de cabeceras TIFF/BigTIFF (IFD, mosaicos, vistas reducidas, `ModelTiepoint`/`ModelPixelScale`, `GeoKey` de tipo de píxel, `GDAL_NODATA`) y decodificación DEFLATE con predictor 1/2 (zlib y NumPy).
  - Las variantes no admitidas (otras compresiones, predictor 3, varias bandas, otros CRS) se rechazan con un error explícito.
  - Peticiones HTTP `Range` (respuesta 206 obligatoria: nunca se descarga un archivo completo), mosaicos contiguos agrupados en una sola petición, límite de 4 peticiones simultáneas, User-Agent genérico.
  - Cada rango se guarda en `backend/data/world/cache` (escritura atómica). Las teselas inexistentes (404) se recuerdan. `TERRALAB_WORLD_OFFLINE=true` usa solo la caché.
  - `make worlddata` precarga la región demostrativa (±16 km de relieve, cobertura a tres resoluciones y la instantánea OSM) y escribe un manifiesto.
- **Consecuencias:** Validado contra una implementación independiente (geotiff.js): la misma ventana NASADEM de 541 × 520 px da suma, mínimo, máximo y extremos idénticos. Con la caché preparada, la elevación de la demo se sirve en ~9 ms y la región funciona sin red. NumPy pasa a ser dependencia del backend (prevista en CLAUDE.md).

## ADR-036 — Cobertura del suelo: ESA WorldCover 2021 para materiales y vegetación
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** Para repartir materiales y vegetación de forma creíble hace falta saber qué hay en cada punto. OpenStreetMap no tiene mapas de cultivos ni cubre de forma homogénea los usos del suelo.
- **Decisión:** ESA WorldCover 10 m 2021 v200 (CC BY 4.0, AWS Open Data; exactitud global publicada 76,7 %) con el mismo lector COG. Se pide a 10 m para el área de detalle y en vista reducida (80 m) para el contexto. Cada clase (cultivo, pastizal, matorral, árboles, construido, suelo desnudo, agua) se traduce en pesos de material y probabilidades de vegetación. Los bordes de clase se desplazan con ruido para que no aparezcan los cuadrados de 10/80 m.
- **Consecuencias:** La distribución de suelos y plantas sigue un dato real verificable, pero no distingue cultivos ni parcelas. En la región demostrativa: 83,7 % cultivo, 11,9 % construido y 3,2 % pastizal en el área de detalle de 3 km.

## ADR-037 — OpenStreetMap: instantánea para la región demostrativa y Overpass en vivo desactivado
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El manual de las instancias públicas de Overpass desaconseja usarlas como backend de una aplicación para el público general («only running your own instance sustainably serves your mission»). Su pauta de uso es de ≲ 10 000 peticiones y ≲ 1 GB al día.
- **Decisión:**
  - `make worlddata` hace **una** consulta acotada (±3 km, solo vías, cursos y masas de agua, edificaciones, usos del suelo y ferrocarril) y la guarda como instantánea en `backend/data/world/osm/` (ODbL, con la fecha `timestamp_osm_base`). No se repite si ya existe.
  - Para otras regiones, la consulta en vivo solo se activa con `TERRALAB_OVERPASS_URL` (idealmente una instancia propia) y `TERRALAB_OVERPASS_USER_AGENT`. Tiene un intervalo mínimo de 10 s, un área máxima de 0,08° y guarda cada respuesta como instantánea.
  - Sin datos, la escena lo indica («Sin datos de OpenStreetMap para esta área»).
  - Los anchos (casi nunca etiquetados en zonas rurales) y la superficie sin etiqueta `surface` se **estiman** por categoría y se marcan como estimados.
- **Consecuencias:** La región demostrativa tiene 1 141 elementos OSM; otras regiones generan relieve y cobertura reales sin caminos hasta que se configure una instancia. No se versionan datos OSM.

## ADR-038 — Pipeline de generación en un Web Worker con etapas desacopladas
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt define el flujo coordenadas → elevación → normalización → malla → materiales → elementos geográficos → vegetación → escena, con cada etapa desacoplada y sin saturar el navegador.
- **Decisión:**
  - **Consulta** (hilo principal, API): elevación, cobertura de detalle y de contexto, elementos OSM y metadatos, en paralelo.
  - **Etapas 2–6** (`src/world/`, funciones puras sin React ni Three.js) en un worker que informa de su duración real: normalización, malla, materiales, elementos geográficos y vegetación.
  - **Normalización:** relleno de vacíos, suavizado gaussiano σ = 1,2 px (atenúa el ruido del radar y la cuantización a metros enteros sin inventar detalle) y reproyección bicúbica al marco ENU de la fase 03, con la caída por curvatura incluida e `y = 0` en el suelo del origen.
  - **Extensión:** el área de detalle es un cuadrado de 3–6 km que contiene la región con 1 km de margen. El contexto es un anillo hasta ±15 km.
  - **Límite:** la región se genera si su rectángulo envolvente mide ≤ 4 km. Las mayores se rechazan con un mensaje.
  - **Respaldo procedural:** si una fuente real falla, solo se usan datos procedurales con el consentimiento explícito del usuario, y se etiquetan como demostrativos en la escena y en el panel de procedencia.
- **Consecuencias:** Tiempos con datos reales en la región demostrativa (código final, medido en Node): 1,4 s (baja), 2,0 s (media) y 2,8 s (alta); la etapa de materiales domina (60–85 %). La escena completa está lista en 4,3–5,8 s. Las mismas funciones se prueban en Vitest con datos sintéticos.

## ADR-039 — Terreno: fragmentos con LOD y faldones, y material de mezcla PBR con texturas de array
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt pide malla optimizada sin artefactos de borde, LOD, frustum culling, materiales del catálogo diferenciados y transiciones realistas.
- **Decisión:**
  - **Malla:** 8 × 8 fragmentos con 3 niveles de detalle (32/48/64 segmentos en LOD0 según la calidad). Las normales salen del campo de alturas fino, así que no hay costuras de iluminación. Hay faldones en los cuatro bordes y el nivel se elige por distancia; la GPU descarta los fragmentos fuera de la cámara. El contexto es una malla 16 veces más gruesa con un hueco exacto y un anillo exterior plano bajo la niebla.
  - **Material:** `MeshStandardMaterial` (sombras, niebla, IBL) con el sombreador inyectado:
    - 8 materiales del catálogo en dos `DataArrayTexture`: albedo+altura y normal+rugosidad+AO.
    - Pesos de mezcla derivados de cobertura, pendiente, región reservada y mosaico de campos.
    - Las 3 capas dominantes se muestrean con gradientes explícitos y se mezclan por altura.
    - Contra la repetición: variación girada a la misma escala, ruido fractal de gran escala y paso al color medio de cada capa a partir de 30–300 m.
  - **Elementos geográficos:** campos de distancia con signo (8 bits, ±0,125 m) para pavimento, tierra, cauces y agua, que trazan bordes nítidos con texels de 2–4 m. Las edificaciones se pintan como suelo compactado.
  - Se añadió `asphalt_01` (CC0, Poly Haven) al catálogo mediante el pipeline de assets para las vías que OSM marca como pavimentadas.
  - El **mosaico de campos** (franjas orientadas como las vías reales) es procedural y está etiquetado como tal.
- **Consecuencias:** 108 MB estimados de texturas de terreno en GPU en calidad media o alta (capas de 1024 px, medido en la escena de la demo); en baja las capas son de 512 px, una cuarta parte. La repetición residual a media distancia se reduce, pero no desaparece del todo con texturas de 2 m.

## ADR-040 — Publicación de los recursos del mundo en el build de producción
- **Fecha:** 2026-11-14
- **Estado:** Aceptada (desarrolla ADR-019)
- **Contexto:** ADR-019 aplazó qué assets se publican hasta la fase que los usara. El mundo 3D los necesita también fuera del servidor de desarrollo.
- **Decisión:** el plugin `assetLibraryBuildPlugin` copia a `dist/asset-library/` solo los 8 materiales del terreno a 1024 px, los modelos de vegetación y rocas y los 5 HDRI, con un `catalog.json` reducido a ellos (26 recursos, 60,7 MB). Sin biblioteca generada, el build avisa y el mundo muestra el error «ejecuta make assets».
- **Consecuencias:** El build de producción (`vite preview`) genera el mundo igual que en desarrollo (verificado). El visualizador de assets sigue siendo solo de desarrollo.

## ADR-041 — Vegetación instanciada con selección por celdas, LOD por ejemplar e impostores
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** En calidad alta la región demostrativa tiene unos 1 800 árboles. En LOD2 (~11 000 triángulos) serían más de 20 M de triángulos desde una vista aérea. Pasto y maleza no pueden repartirse por kilómetros cuadrados.
- **Decisión:**
  - **Matrices:** una `InstancedMesh` por modelo, nivel y material. La matriz del nodo del GLB (descuantización y recentrado de la variante) se combina con la de cada ejemplar, sin transformar geometrías cuantizadas.
  - **Selección:** las instancias se ordenan por celdas de 64 m. Al moverse la cámara, se descartan las celdas fuera del frustum o del alcance y cada ejemplar recibe su LOD por distancia.
  - **Impostores de árboles:** a partir de 350 m (y hasta 2,5 km), un atlas de 8 × 2 vistas horneado al cargar, sobre un rectángulo orientado a la cámara. Se probó un mapa de normales horneado, pero oscurecía las vistas desde arriba, y se sustituyó por un factor medio de autosombreado.
  - **Pasto y maleza:** se generan por celdas de 16 m solo alrededor de la cámara (22–55 m según la calidad), de forma determinista y con caché LRU.
  - **Exclusiones:** nada se coloca sobre caminos, agua, edificaciones ni dentro de la región reservada para las parcelas.
- **Consecuencias:** En vista aérea, de 357 a 793 ejemplares visibles según la calidad, casi todos impostores, con 50–65 llamadas de dibujo. Los modelos son representativos (no hay especies nativas del valle en el catálogo).

## ADR-042 — Cámara, iluminación del HDRI, niebla y selección del terreno
- **Fecha:** 2026-11-14
- **Estado:** Aceptada
- **Contexto:** El prompt pide vista aérea, órbita, zoom, desplazamiento, selección del terreno, movimiento suave y no atravesar el terreno.
- **Decisión:**
  - **Cámara:** `OrbitControls` con amortiguación, zoom al cursor, desplazamiento sobre el plano (botón derecho o WASD) y vistas predefinidas (aérea, granja, a pie) con transición *ease-in-out* de 1,6 s.
  - **Límites:** el punto de mira se mantiene dentro del área de detalle y sobre el suelo. La cámara se eleva si quedaría bajo el terreno o con una ladera entre ella y el punto de mira. El plano cercano se ajusta a la altura sobre el suelo.
  - **Selección:** clic sin arrastre → rayo contra el campo de alturas (pasos de media celda + bisección), con coordenadas, altura, pendiente, cobertura y elemento OSM más cercano.
  - **Sol:** el sol direccional se coloca en el píxel más luminoso del HDRI (en el cielo despejado: 43° de elevación y 126° de azimut). Su sombra sigue al punto de mira ajustada a la rejilla de texels.
  - **Niebla:** la niebla lineal se ajusta para ser total antes del borde del contexto. Su color es el horizonte del HDRI tras el mismo tone mapping ACES de Three.js.
  - El cielo es ambientación visual seleccionable, no el clima del lugar.
- **Consecuencias:** Durante la fase se detectó que la luz creada con `ref` nunca se orientaba, porque el componente se volvía a suspender al limpiar la caché del HDR. La luz pasó a ser un objeto propio y la liberación del HDR es diferida y con recuento de usos.

## ADR-043 — Raíz 2D reemplaza a TerraLab 3D como interfaz principal
- **Fecha:** 2026-11-15
- **Estado:** Aceptada por el usuario (Dev 1). El 15-nov-2026 se retiró el prototipo de `/raiz.html` (`src/raiz/`, `e2e/raiz.spec.ts`); sus direcciones redirigen a Raíz 2D.
- **Contexto:** El plan del equipo (`raiz-hackaton/plan-equipo.json`, tareas D3-1 a D3-6 y P4-3) define un recorrido web de cuatro pasos sobre JSON precalculado: Clima → Rotaciones → Suelo y confianza → Ficha/audio/radio. El 3D queda fuera de alcance («nuevo 3D» y mapas son lo primero que se corta). El producto no necesita una escena 3D para su propósito.
- **Decisión:**
  - `/` (`index.html`) monta `frontend/src/raiz2d/`. TerraLab 3D queda archivado en `/terralab.html`, sin borrar código; sus pruebas e2e apuntan a esa ruta.
  - Sin dependencias nuevas: React, SVG propio y CSS. Tipografías Alegreya y Alegreya Sans (OFL) servidas desde `public/raiz/fonts/`; cero peticiones externas durante la demo.
  - Toda cifra se deriva en `analysis.ts` de los JSON publicados. `analysis.test.ts` comprueba que la agregación reproduce los 81 agregados de `results.json`; con ese mismo método se calculan los subconjuntos que el paquete no trae (Niño fuerte, un año concreto).
  - Niño fuerte (ONI ≥ 1,5) es un escenario más, con su propio n; con n < 3 se muestran valores sin orden ni conclusión.
  - Prioridades: normalización mín–máx entre los casos mostrados, puntaje entero 0–100, empates por puntaje igual y exclusión explicada del caso sin el KPI con peso (omitir un dato no mejora un puntaje). Peso inicial: agua de pozo 1, déficit en secano 0, para comparar las tres secuencias desde el inicio.
  - El presupuesto de agua se declara «no evaluado»: el paquete no trae corridas con límite y no se ofrece un control que simule un cálculo inexistente.
  - La selección vive en la URL (`?paso=…&escenario=…&caso=…`); el identificador de resultado de la ficha se compone de `build_id/caso/escenario/periodo/ventana`. El boletín se rotula como general, no ligado a ese identificador, y su emisión como no confirmada.
- **Consecuencias:** `docs/RAIZ_2D.md` describe la interfaz. `docs/RAIZ_UI.md` describe el prototipo oscuro de `/raiz.html`, que sigue montando `src/raiz/`. Si se adopta Raíz 2D como única interfaz, retirar `src/raiz/`, `raiz.html`, `creditos.html` y `e2e/raiz.spec.ts`, y redirigir esas rutas a `/`.

## ADR-044 — Balance hídrico diario FAO-56 y presupuestos de agua precalculados (D1-5, D1-6)
- **Fecha:** 2026-11-15
- **Estado:** Aceptada por el usuario (Dev 1); supuestos pendientes de revisión agronómica de P6.
- **Contexto:** El motor `fao56-demand-screening-1` restaba lluvia acotada a la demanda, sin suelo. No cumplía D1-5 (balance que conserve agua, humedad entre cultivos, estrés, cobertura, exposición, frecuencia de cumplimiento) ni D1-6 (presupuestos precalculados), y bloqueaba el guion de P4-3 («presupuesto válido»).
- **Decisión:**
  - `backend/app/engine/raiz.py` → `fao56-balance-1`: balance diario de la zona radicular (FAO-56 cap. 8, ec. 81-88) con Ks y p ajustado por ETc; evaporación de suelo desnudo en dos etapas (cap. 7, REW 8 mm / TEW 18 mm, Tabla 19); escorrentía por curva número TR-55 (grupo C: cultivo 85, descanso 86, desnudo 91); drenaje sobre capacidad de campo; sin ascenso capilar.
  - Volumen de control común (0,6 m × 0,15 m/m = 90 mm): la humedad pasa entre campañas y el cierre se comprueba por ventana (error máximo 0,00 mm en 4 320 corridas). Cada ventana corre 36 meses desde el 1 de julio con 50 % de agotamiento inicial.
  - p de papa (0,35) y haba (0,45) desde `content/p6/crops.json` (FAO-56 T22); quinua usa p de cereales pequeños (0,55) como proxy. Umbrales de helada de P6; lluvia erosiva 12,7 mm/día (Wischmeier y Smith 1978) y viento 5 m/s a 2 m (Fryrear et al. 1998, RWEQ) como supuestos con cita.
  - Presupuestos: requerimiento (sin límite), cupos hipotéticos de 200 y 100 mm por campaña con riego (⅔ y ⅓ de la mediana del requerimiento central, 291 mm) y secano. La quinua es de secano en todos.
  - Sensibilidad por supuestos: corridas «suelo bajo» (0,4 m, 0,14 m/m, inicio seco) y «suelo alto» (1,0 m, 0,16 m/m, inicio húmedo); se publica el rango de las medias. La sensibilidad entre fuentes sigue `not_evaluated`.
  - Contrato: `result_id`, `water_budget_id`, `enso_initial_phase`, `kpi_units`, `sources`, `warnings`, `null_reasons`, `constraint_pass` y `enso_campaigns.json` (D1-4). `results.json` compacto y redondeado a 0,01; clima y ONI se publican sin redondear.
- **Consecuencias:** 1 440 registros (9 casos × 40 ventanas × 4 presupuestos), 4,2 MB (207 kB gzip). Pruebas: 39 del motor (conservación paramétrica, cupos, estrés, traslado de humedad, CN, umbrales) y verificación del paquete publicado. Límites declarados en `catalog.model_limits`: profundidad común que subrepresenta la quinua, descanso sin transpiración de maleza, helada del aire contra umbrales de tejido, exposición sin toneladas de erosión.
