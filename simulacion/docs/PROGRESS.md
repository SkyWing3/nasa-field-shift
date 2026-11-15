# Progreso — TerraLab 3D

Registro cronológico de fases completadas. Cada entrada incluye cambios, verificación realizada y pendientes.

---

## Fase 0 — Fundación · 2026-11-14

**Cambios**
- `CLAUDE.md` con las instrucciones maestras del proyecto.
- Documentación base: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/ASSETS.md`.
- ADR-001 a ADR-007 registradas.

**Verificación**
- No hay código que compilar, lintar ni probar en esta fase.
- Entorno detectado: Node v26.8.1, npm 12.0.2, Python 3.15.2, git disponible. (`uv` y `pnpm` no instalados; se decidirá el gestor de paquetes en la fase de scaffolding.)

**Pendientes**
- El directorio aún no es un repositorio git.
- Las decisiones marcadas como *Propuesta* (ADR-003 paso diario, ADR-004 motor en backend) se confirmarán en sus fases.

---

## Fase 01 — Arquitectura y configuración inicial · 2026-11-14

**Cambios**
- Monorepositorio git (`main`) con `frontend/`, `backend/`, `Makefile`, `README.md` de instalación, `.gitignore` y `.editorconfig`.
- **Frontend** (React 19.3.1, TS 6.0.3 estricto, Vite 8.3.8, Three 0.187, R3F 9.8.2, Drei 10.7.9, Zustand 5.1.0; versiones exactas):
  - Módulos `domain`, `scene`, `terrain`, `vegetation`, `interaction`, `camera`, `weather-visual`, `state`, `simulation-client`, `ui`, `config` y `app`.
  - Interfaces `Farm`, `Plot`, `Crop`, `CropGrowthStage`, `SoilState`, `WeatherState`, `SimulationState` y `SimulationScenario`, con unidades marcadas (`Quantity<U>`), procedencia de datos y escala BBCH.
  - Pantalla inicial con el estado del sistema; espacio de trabajo con barra superior (fecha simulada y condiciones), panel lateral de herramientas (todas "Próximamente") y escena 3D provisional cargada de forma diferida.
  - Indicadores de carga, estados vacíos, estados de error (WebGL ausente, contexto perdido, error de render, fallo de descarga del módulo 3D, API caída con reintento) y diseño adaptable.
  - ESLint (`strictTypeChecked`), Prettier, Vitest y Playwright configurados.
- **Backend** (FastAPI 0.162.7, Python ≥3.12):
  - `create_app(settings)`, configuración `TERRALAB_*` y `GET /api/health`.
  - CORS solo en desarrollo, con orígenes explícitos validados.
  - Paquetes `engine`, `data_sources` y `persistence` vacíos a propósito.
  - Ruff, mypy estricto y pytest.
- Variables de entorno de ejemplo: `frontend/.env.example`, `backend/.env.example`.
- ADR-008 a ADR-017.

**Verificación realizada (resultados reales)**

| Comprobación | Resultado |
|---|---|
| `tsc -b` (app, tests, configuración y e2e) | 0 errores |
| ESLint (`--max-warnings=0`) y Prettier | Sin incidencias. Comprobé con un archivo de prueba que las reglas con tipos detectan errores |
| Vitest | 7 archivos, 44 pruebas pasan |
| pytest | 17 pruebas pasan, sin avisos |
| Ruff (lint + formato) y mypy `--strict` | Sin incidencias |
| `npm run build` | Correcto, sin avisos. Inicial: 77 kB gzip de JS; `three` 188 kB gzip y escena 64 kB gzip diferidos |
| `npm audit` | 0 vulnerabilidades (tras ADR-014) |
| `make install` (`npm ci` + pip con lock) | Correcto |
| `make dev` | Frontend responde 200 en :5173; `curl /api/health` → `{"status":"ok",...}` |
| CORS con curl | `Origin: http://localhost:5173` recibe `access-control-allow-origin`; un origen ajeno no |
| Playwright (Chromium 159) | 5 pruebas pasan. WebGL 2 real verificado por análisis de píxeles; API real y simulada caída (503) con reintento; estados vacíos; sin errores de consola; 390 px sin desbordamiento |
| Interacción de cámara | Arrastre verificado midiendo el horizonte: hacia abajo eleva la cámara (fila 291 → 0); hacia arriba el límite `maxPolarAngle` lo frena (fila 291 → 300) |
| Build de producción (`vite preview`) | La pantalla inicial solo descarga `index.js` y su CSS; los chunks 3D se descargan al entrar al laboratorio; la escena llega a `ready` |
| Capturas revisadas | Pantalla inicial, API sin conexión, espacio de trabajo a 1280 y 1440 px, móvil a 390 px |

**Errores encontrados y corregidos durante la fase**
- Condición de carrera en la comprobación de salud con `StrictMode`: la petición abortada al desmontar bloqueaba la siguiente y la API quedaba en "Comprobando…" para siempre. Ahora las peticiones concurrentes se deduplican y no se cancelan al desmontar.
- Aviso de Three.js r187 `PCFSoftShadowMap has been removed`, causado por `<Canvas shadows>`. Se usa `shadows="percentage"`.
- Agrupar R3F en un chunk propio arrastraba React y precargaba 950 kB en la página inicial. Ahora solo se agrupa `three`.
- `StarletteDeprecationWarning` por `httpx`. Se usa `httpx2`.
- Vulnerabilidad moderada en `minimatch` transitiva. Se aplica un override.
- Diseño: aviso de la barra superior recortado a 1280 px, botón "Inicio" fuera de pantalla en móvil y métrica de fecha cortada a 390 px.

**Problemas pendientes y limitaciones conocidas**
- **Aviso de consola `THREE.Clock: This module has been deprecated`.** Lo emite R3F 9.8.2 internamente (`new THREE.Clock()`), que es la última versión publicada; no se corrige desde el proyecto. Revisarlo al actualizar R3F.
- **La escena es provisional y no fotorrealista** (plano de color uniforme y cielo procedural), rotulada así en pantalla. Recursos pendientes en `ASSETS.md`.
- `npm` 12 bloquea el script de instalación de `fsevents` (dependencia opcional de Vite en macOS). Vite arranca y sirve correctamente. No he medido si la detección de cambios en archivos (HMR) se degrada sin él.
- Las e2e solo se ejecutan en Chromium. No he verificado Firefox ni Safari.
- No hay integración continua configurada.
- NumPy aún no está instalado (ADR-008); llegará con el motor.
- Los contratos API están duplicados a mano en Pydantic y TypeScript (`HealthResponse`). Conviene generarlos desde OpenAPI cuando crezca la API.
- ADR-003 (paso diario) y ADR-004 (motor en el backend) siguen como *Propuesta* hasta la fase del motor.

---

## Fase 02 — Actualización de visión y pipeline de assets · 2026-11-14

**Cambios**
- **Visión**: `CLAUDE.md` amplía la experiencia de juego, que pasa a ser un simulador de gestión agrícola del género de Global Farmer, solo como referencia. También añade la restricción de costos (USD 0) y la política de assets. No se eliminó ninguna regla anterior. `ROADMAP.md` pasa a 13 fases (0–12) y asigna cada una de las diez capacidades del jugador a su fase.
- **Pipeline de assets** (`frontend/asset-pipeline/`, Node 26 + TypeScript):
  - Selección declarativa.
  - Adaptadores de las API públicas de Poly Haven y ambientCG.
  - Descarga verificada con MD5 de la fuente y SHA-256 en `sources.lock.json`.
  - Procesado de modelos: LOD en un GLB, simplificación sensible a atributos, WebP y meshopt.
  - Procesado de materiales PBR de terreno (2048/1024) y de HDRI (1K/2K).
  - Validación automática, catálogo `catalog.json` y tabla generada en `docs/ASSETS.md`.
  - Comandos `make assets`, `assets-fetch`, `assets-process` y `assets-verify`.
- **Catálogo**: 41 assets CC0 disponibles y 4 faltantes documentados.
  - *Terreno*: 11 materiales (tierra agrícola, tierra labrada, barro, suelo húmedo ×2, suelo seco ×2, pedregoso, caminos rurales ×2, pasto).
  - *Vegetación*: 9 modelos (pasto ×2, arbustos ×2, árboles ×2, maleza ×3).
  - *Entorno*: 16 modelos (cerca de malla, 4 de riego, 7 objetos agrícolas, 2 rocas, tocón y ramas).
  - *Iluminación*: 5 HDRI de cielo (mediodía en campo, despejado, cubierto, neblina, atardecer).
  - *Faltantes*: planta de papa, maíz, haba y cerca rural de madera, con motivo y alternativas.
- **Visualizador de assets** (`asset-viewer.html`, solo desarrollo):
  - Lista con búsqueda y filtros por categoría.
  - Rotación, zoom, desplazamiento, encuadre y rotación automática.
  - LOD automático o fijo.
  - Inspección de materiales: PBR, albedo, normal, rugosidad, metalicidad, oclusión y malla.
  - Iluminación: selección de HDRI 1K/2K, intensidad, rotación, exposición, fondo y sol con sombras.
  - Rendimiento: tamaño, tiempo de carga, triángulos por LOD, estadísticas del último fotograma, memoria de texturas estimada y medición de FPS.
  - Panel explicativo para los faltantes; enlaces `#id`.
- **Frontend**:
  - Módulo `src/assets/` (contrato del catálogo y validación) y plugin de Vite `vite-plugins/assetLibrary.ts`.
  - Enlace al visualizador en la pantalla inicial, solo en desarrollo, y etiqueta de fase actualizada.
  - Helper e2e compartido (`e2e/support.ts`).
- **Dependencias de desarrollo** (versiones exactas, ADR-020): `@gltf-transform/*` 4.5.1, `meshoptimizer` 1.3.0, `sharp` 0.35.5, `gltf-validator` 2.0.0-dev.3.10 y `fflate` 0.8.3.
- ADR-018 a ADR-026.

**Verificación realizada (resultados reales)**

| Comprobación | Resultado |
|---|---|
| Licencias y condiciones | Leídas en origen el 2026-11-14: licencia CC0 de Poly Haven y ToS de su API; licencia CC0 de ambientCG. Licencias de Sketchfab por modelo consultadas en su API pública. Su endpoint de descarga devuelve `401 Authentication credentials were not provided` |
| Descarga (`make assets-fetch`) | 192 archivos (390,9 MB) de 41 assets, 0 fallos. Tamaño y MD5 verificados contra Poly Haven; SHA-256 registrado. Segunda ejecución: 0 descargas, 192 verificados en caché |
| Procesado (`make assets-process`) | 41/41 disponibles, 0 con errores, 123 archivos y 130,8 MB, en ~42 s. Reprocesar produce los 123 archivos idénticos (mismo SHA-256) |
| Integridad (`make assets-verify`) | 123 archivos, 0 problemas |
| Khronos glTF-Validator | 25 GLB con 0 errores. Hay 414 avisos, todos `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` (tangentes que genera Three.js) |
| Escala | Los 25 modelos conservan el tamaño del glTF de origen (diferencia máxima 1,1 %, en `tree_small_02` tras simplificar). Las alturas son plausibles para su tipo y las bases están en el suelo |
| Carga en Three.js | Prueba e2e: los 41 assets disponibles cargan en Chromium. Los triángulos dibujados son ≥ los del LOD0 y el LOD0 queda activo al encuadrar. El lienzo no es uniforme y no hay errores de consola |
| `tsc -b` (app, node, pipeline) · ESLint · Prettier | 0 errores · sin incidencias · sin incidencias |
| Vitest | 14 archivos, 96 pruebas pasan (44 de la fase 01 y 52 nuevas) |
| pytest · Ruff · mypy | 17 pasan · sin incidencias · sin incidencias (backend sin cambios) |
| Playwright | 10 pruebas pasan: 5 de la fase 01 y 5 del visualizador (catálogo; carga de cada asset; faltantes; LOD, modos, iluminación y FPS; catálogo ausente o no válido) |
| `npm run build` | Sin avisos. 77,5 kB gzip iniciales (igual que en la fase 01); el visualizador y la biblioteca no están en `dist/` |
| `npm ci` limpio · `npm audit` | Instala sin errores (`sharp` funciona con binarios precompilados) · 0 vulnerabilidades |
| Plugin de Vite | `curl`: catálogo y GLB con su tipo MIME correcto; recorrido de directorios (codificado y literal) y archivos inexistentes → 404 |
| Capturas revisadas | Árbol, suelo agrícola, roca (PBR, normal, malla, LOD2), atardecer con sol y sombras, pasto, recurso faltante, catálogo |

**Errores encontrados y corregidos durante la fase**
- **El primer procesado marcó 10 modelos con errores.** Ninguno era un problema de los assets en sí:
  - El pivote se recentraba y desplazaba raíces y bases de roca. Ahora se conserva el origen del autor en la naturaleza y se apoya en el suelo a los objetos manufacturados.
  - `join()` fusionaba las variantes de cada conjunto. Ahora se conservan por separado.
  - La simplificación se bloqueaba por las costuras de UV. Se sustituyó por `simplifyWithAttributes` con `Permissive`.
  - La escala se comparaba con las dimensiones publicadas, que miden la escena `.blend` completa. Ahora se compara con el glTF de origen y las publicadas son informativas.
- **WebP casi sin pérdida pesaba más que el JPEG de origen.** Se midieron 8 codificadores y se eligió WebP q92 con submuestreo inteligente para datos y q85 para color (ADR-022).
- **Visualizador:**
  - Una colisión de clases CSS (`.missing`) agrandaba los puntos de estado.
  - El muestreo de estadísticas cada 250 ms perdía el último fotograma en modo bajo demanda.
  - Los cambios de `#id` no actualizaban la selección.
  - Las mutaciones de objetos devueltos por hooks las marcaba el compilador de React. Se resolvió con `get()` y texturas clonadas propias.
- **Aviso de Vite por importar sin extensión en `vite.config.ts`.** Se usa `.ts` explícito.

**Problemas pendientes y limitaciones conocidas**
- **Cultivos (papa, maíz, haba) y cerca rural de madera sin asset.** No hay versiones gratuitas compatibles descargables sin intervención. Las alternativas CC-BY de Sketchfab necesitan que el usuario cree una cuenta y acepte sus términos. Para los cultivos se recomienda el modelado procedimental por estado BBCH (ADR-025).
- **Blender no está instalado.** No se crearon scripts de Blender porque no podían verificarse; el pipeline usa glTF-Transform (ADR-020).
- **Sin KTX2/Basis.** Las texturas WebP ocupan memoria de GPU sin comprimir; el catálogo la estima, por ejemplo 16 MB para `boulder_01` (ADR-022).
- **FPS.** La medición del visualizador dio 21–22 FPS con la roca en Chromium *headless* de Playwright. Ese entorno no es representativo de un navegador con ventana y GPU, donde no se ha medido.
- **El LOD2 del árbol aclara mucho el follaje.** Para vegetación lejana masiva hará falta un impostor (fase de vegetación). Las distancias de cambio de LOD (8 y 20 radios) son provisionales.
- **El relieve de los materiales usa una escala visual de 2 cm sin medida real.** ambientCG no publica autor ni tamaño físico.
- **Faltan terreno con relieve real y mapa mundial.** Se evaluarán en sus fases (ASSETS.md).
- **Un clon nuevo necesita `make assets`** (≈ 400 MB) para el visualizador y sus pruebas e2e. El User-Agent genérico debería sustituirse por uno que identifique el producto si se publica (ADR-024).
- **Pendientes de la fase 01:**
  - aviso `THREE.Clock` de R3F;
  - `fsevents` bloqueado por npm 12;
  - e2e solo en Chromium;
  - sin integración continua;
  - nada versionado todavía.

## Fase 03 — Mapa mundial y selección geográfica · 2026-11-14

**Cambios**
- **Flujo de la aplicación**: Inicio → Mapa → Selección → Confirmación → Preparación de la granja.
  - La pantalla inicial ofrece «Elegir la ubicación de la granja» y, si hay una guardada, «Continuar con…» y «Cambiar ubicación».
  - La escena provisional sigue accesible como acción secundaria.
- **Mapa mundial** (`src/map/`, MapLibre GL JS 6.16.0):
  - Mapas base intercambiables (ADR-027): vectorial «Liberty» de OpenFreeMap y satélite Sentinel-2 cloudless 2016 de EOX, limitado a zoom 15.
  - Atribución siempre desplegada, escala, zoom y desplazamiento; la rotación está desactivada para que el norte quede arriba.
  - Clic para fijar el centro, marcador arrastrable y modo de dibujo de la región por diagonal.
  - Estados de carga y error con reintento. Aviso de teselas fallidas con «Reintentar» (`refreshTiles`), sin recargar la página.
- **Búsqueda de lugares** (ADR-028):
  - El backend hace de proxy (`/api/geocoding/info` y `/api/geocoding/search`) con proveedores intercambiables.
  - Por defecto, un nomenclátor GeoNames local (`make geodata`, SQLite FTS5, sin acentos, prioriza nombre y luego población).
  - Nominatim es opcional y está desactivado: exige User-Agent propio, aplica ≤ 1 petición/s global y caché de 24 h.
  - El frontend busca solo al enviar el formulario (sin autocompletado) y reconoce coordenadas decimales y DMS sin red.
- **Región de trabajo** (`src/geo/region.ts`, `metrics.ts`):
  - Rectángulo con centro, ancho y largo (50 m–5 km) y orientación del lado largo; latitud máxima ±85°.
  - Medidas geodésicas con GeographicLib (ADR-032): superficie, perímetro, lados, orientación y coordenadas de los cuatro vértices.
  - Campos numéricos editables, validación con mensajes y esquema SVG de la región en el panel.
- **Sistema de coordenadas** (ADR-029, ARCHITECTURE §9):
  - WGS84 → ECEF → plano tangente local ENU con origen en el centro de la región.
  - Convención de la escena: x = este, y = arriba, z = −norte.
  - Funciones puras y verificables en `src/geo/`, con la caída por curvatura documentada.
- **Región demostrativa** «Valle Alto de Cochabamba» (ADR-031):
  - 400 × 300 m a unos 3,1 km al oeste-suroeste de Punata (Bolivia).
  - Verificada con OpenStreetMap, ESA WorldCover 2021 y GeoNames.
  - Advierte en la interfaz que no corresponde a ninguna propiedad real.
- **Persistencia** (ADR-030): `localStorage` (`terralab.site`, esquema v1) con validación al cargar. Un registro dañado se descarta con aviso; se puede volver al mapa para modificar la ubicación guardada.
- **Pantalla de preparación de la granja**: resumen de la ubicación, origen del marco local y aviso de la región demostrativa. No genera todavía la granja 3D (fase 04).
- **Carga diferida** (ADR-033): MapLibre, la geodesia y las pantallas de ubicación solo se descargan al usarse.
- **Dependencias**:
  - Frontend, versiones exactas: `maplibre-gl` 6.16.0 (BSD-3) y `geographiclib-geodesic` 2.2.0 (MIT).
  - Backend: `httpx2` pasa a dependencia de ejecución.
- **Comandos y configuración**: objetivo `make geodata`; variables `VITE_BASEMAP_STYLE_URL`, `VITE_SATELLITE_TILES_URL`, `TERRALAB_GEOCODER`, `TERRALAB_GAZETTEER_PATH` y `TERRALAB_NOMINATIM_*`.
- **Documentación**: ADR-027 a ADR-033, ARCHITECTURE §9, sección de datos geográficos en ASSETS.md y README.

**Verificación realizada (resultados reales)**

| Comprobación | Resultado |
|---|---|
| Políticas de los servicios | Leídas en origen el 2026-11-14: OpenFreeMap, EOX (licencia de la edición 2016 frente a las posteriores), GeoNames y la política de uso de Nominatim |
| Nomenclátor (`make geodata`) | 3 archivos descargados una vez, con SHA-256 en el manifiesto; 237 125 lugares. Búsquedas reales correctas para Punata, Cliza, São Paulo y Bogotá |
| Región demostrativa | Dentro de un área agrícola de OSM (vía 723914107). 99,5 % de píxeles «cultivos» en ESA WorldCover. Punata a 3,06 km, Cliza a 8,51 km y Arani a 10,07 km (GeoNames) |
| Precisión geodésica | Área de un octante del elipsoide frente a la fórmula analítica: error relativo < 1e-12. Distancias ENU frente a geodésicas: < 1 ppm hasta 3 536 m y hasta 70° de latitud |
| `tsc -b` · ESLint · Prettier | 0 errores · sin incidencias · sin incidencias |
| Vitest | 18 archivos, 135 pruebas pasan (39 nuevas) |
| pytest · Ruff · mypy | 43 pasan (26 nuevas: nomenclátor, Nominatim con reloj simulado, API y configuración) · sin incidencias · sin incidencias en 25 archivos |
| Playwright | 20 pruebas pasan. Las 10 nuevas cubren navegación, región demostrativa (con píxeles del lienzo), clic, campos y dibujo, búsqueda por nombre y coordenadas, confirmación, guardado, recarga y edición, errores de red de la búsqueda, API o mapa base caídos con reintento, satélite con atribución, reintento de teselas y móvil. Los proveedores externos están simulados |
| Proveedores reales | Recorrido con Playwright contra OpenFreeMap, EOX y la API local: sin errores de consola, solo avisos de filtros del estilo del proveedor y de `ReadPixels` de la GPU. Unas 190 peticiones a OpenFreeMap y 4 a EOX por recorrido, sin precarga |
| Chrome real (Claude in Chrome) | Pantalla inicial, mapa, búsqueda real de «Punata», región demostrativa, satélite, encuadre al editar una ubicación guardada y preparación de la granja funcionan. Se detectaron fallos transitorios de teselas de OpenFreeMap; se resolvió con el aviso y el reintento |
| `npm run build` | Sin avisos. 85,3 kB gzip iniciales (77,5 en la fase 02); MapLibre ocupa 293 kB gzip en su propio chunk |
| `npm audit` · `pip check` | 0 vulnerabilidades · sin dependencias rotas |

**Errores encontrados y corregidos durante la fase**
- **Importación de GeographicLib**: el paquete es UMD y la importación con nombre fallaba en Node ESM. Se usa la exportación por defecto.
- **Orden de resultados**: Cliza aparecía por encima de Cochabamba (Perú) por coincidir en la región. Ahora la consulta busca primero en el nombre y después en el área.
- **Formato de longitudes**: 4,9 mm se mostraba como «0,0 m» y 1,4 km como «1,400 km». Se añadieron mm y cm, y los km usan 2 decimales.
- **Afirmación sin verificar**: «error < 0,1 mm» se sustituyó por la cota medida de < 1 ppm y se añadieron pruebas.
- **e2e**:
  - La animación de encuadre superaba la espera; se ajustaron la duración y el sondeo.
  - Al estilo de prueba le faltaba una capa que usara la fuente con atribución.
  - El muestreo de píxeles usaba `clientWidth` de un lienzo desacoplado.
- **Tamaño del bundle**: la carga inicial llegó a 98 kB gzip. Se separaron las medidas geodésicas, se cargan de forma diferida las pantallas y se limpió el barril de `geo`.
- **Interfaz**:
  - La pantalla de preparación tenía huecos en su rejilla; ahora usa dos columnas.
  - La imagen satelital se ve borrosa a escala de parcela; se añadió una nota visible con su resolución.
- **Prueba en Chrome real**: los fallos transitorios de teselas dejaban zonas vacías. Se añadieron el aviso con «Reintentar» y su prueba e2e.

**Problemas pendientes y limitaciones conocidas**
- **Nominatim desactivado.** Activarlo es decisión de quien despliega la instalación, que debe cumplir la [política de uso de la OSMF](https://operations.osmfoundation.org/policies/nominatim/). Para un uso intensivo hace falta una instancia propia.
- **El nomenclátor solo incluye lugares de más de 500 habitantes** (`cities500`). No encuentra parajes, comunidades pequeñas ni direcciones; para esos casos se pueden introducir coordenadas.
- **Un clon nuevo necesita `make geodata`** (≈ 14 MB). Sin él, la búsqueda por nombre aparece como no disponible.
- **Imagen satelital de 2016 a 10 m/píxel.** Es borrosa a escala de parcela. Las ediciones posteriores de EOX son CC BY-NC-SA y no se usan.
- **El mapa base depende de servicios comunitarios** (OpenFreeMap y EOX), sin acuerdo de servicio. Las etiquetas y su idioma siguen el estilo del proveedor.
- **La ubicación se guarda solo en el navegador.** No se sincroniza entre dispositivos; la persistencia de partidas está prevista en la fase 11.
- **Avisos de consola al salir del mapa.** MapLibre registra «Failed to fetch» por glifos cuya descarga aborta al desmontar el mapa; las peticiones directas responden 200.
- **El User-Agent de `make geodata` es genérico.** Debería identificar el producto si se publica (igual que en ADR-024).
- **La región es solo rectangular.** Las parcelas de formas libres corresponden a la fase 05.
- **Pendientes de fases anteriores**:
  - cultivos y cerca rural sin asset;
  - Blender no instalado;
  - sin KTX2;
  - aviso `THREE.Clock` de R3F;
  - `fsevents` bloqueado por npm 12;
  - e2e solo en Chromium;
  - sin integración continua;
  - nada versionado todavía.

## Fase 04 — Generación geográfica del mundo agrícola 3D · 2026-11-14

**Cambios**
- **Fuente de elevación** (ADR-034):
  - Se evaluaron NASADEM en LP DAAC, Planetary Computer y OpenTopography, y Copernicus GLO-30.
  - Todas imponen alguna condición. Se consultó al usuario, que autorizó **NASADEM vía el almacenamiento público de OpenTopography**, con la condición de citar a OpenTopography y a NASA JPL.
- **Backend: datos geográficos** (`app/data_sources/`):
  - `raster/`: lector propio de COG por rangos de bytes con caché en disco y modo sin conexión (ADR-035).
  - `elevation/` (NASADEM), `landcover/` (ESA WorldCover, ADR-036) y `osm/` (instantáneas y Overpass opcional, ADR-037).
  - `world_build` y `make worlddata`: preparan la región demostrativa con una sola consulta a Overpass.
  - Endpoints `/api/world/datasets`, `/elevation`, `/landcover` y `/features`, con respuestas comprimidas con gzip.
  - NumPy pasa a dependencia del backend.
- **Pipeline de generación** (`src/world/`, ADR-038):
  - Etapas desacopladas y puras, ejecutadas en un Web Worker con su duración real: normalización, malla, materiales, elementos geográficos y vegetación. La consulta de datos va antes en el hilo principal y la escena explorable después.
  - Extensión: 3–6 km de detalle y relieve real hasta ±15 km. El rectángulo envolvente de la región debe medir como máximo 4 km.
  - Si una fuente real falla, se usan datos procedurales de respaldo **solo con el consentimiento del usuario** y etiquetados como demostrativos.
- **Terreno** (ADR-039):
  - 8 × 8 fragmentos con 3 LOD y faldones, y anillo de contexto.
  - Material PBR de mezcla de 8 materiales del catálogo con texturas de array: 3 capas dominantes, mezcla por altura, antirrepetición y bordes nítidos de caminos y cauces mediante campos de distancia.
  - Se añadió `asphalt_01` (CC0) al catálogo para las vías pavimentadas.
- **Vegetación** (ADR-041):
  - Árboles, arbustos, rocas y restos con los modelos del catálogo, instanciados con selección por celdas, LOD por ejemplar e impostores para árboles a más de 350 m.
  - Pasto y maleza generados por celdas alrededor de la cámara.
  - Nunca sobre caminos, agua, edificaciones ni la región reservada para las parcelas.
- **Cámara, cielo y selección** (ADR-042):
  - Vistas aérea, de la granja y a pie con transición suave; órbita, zoom al cursor y desplazamiento con ratón o WASD.
  - Protección contra atravesar el terreno.
  - Sol alineado con el HDRI, sombras que siguen al punto de mira, niebla del color del horizonte y selector de cielo (ambientación visual).
  - Clic en el terreno: coordenadas, altura, pendiente, cobertura y elemento OSM cercano.
- **Interfaz** (`WorldScreen`):
  - Progreso de las 7 etapas y panel de procedencia (dato real / procedural / recurso CC0), con etapas y rendimiento medido.
  - Capas «Límite de la granja» y «Datos OSM», selector de calidad (baja, media, alta) y atribuciones siempre visibles.
  - Errores con reintento y opción procedural explícita.
  - La pantalla de preparación de la granja incluye «Generar mundo 3D».
- **Build de producción** (ADR-040): publica solo los recursos del mundo (26 recursos, 60,7 MB).
- **Documentación**: ADR-034 a ADR-042, ARCHITECTURE §11, ASSETS (datos geográficos de la fase 04, recursos faltantes) y README.

**Verificación realizada (resultados reales)**

| Comprobación | Resultado |
|---|---|
| Licencias y condiciones | Leídas en origen el 2026-11-14: guía de datos de NASA Earthdata, página de NASADEM de LP DAAC, almacenamiento y política de citas de OpenTopography, licencia Copernicus DEM (PDF), registro AWS de Copernicus y WorldCover, términos de Planetary Computer, manual de Overpass |
| Lector COG frente a geotiff.js | Misma ventana NASADEM de 541 × 520 px: suma 784 707 632, mínimo 2 686 m, máximo 3 739 m y primeros y últimos valores idénticos |
| Datos reales de la región demostrativa | Elevación en ±8 km de 2 686 a 3 739 m (valle a ~2 700 m, sierra al norte); con el contexto de ±15 km, hasta ≈ 4 160 m. 0 % de vacíos. WorldCover en 3 km: 83,7 % cultivo, 11,9 % construido, 3,2 % pastizal. OSM: 1 141 elementos (250 en el área de detalle), datos del 2026-11-14 |
| Ruido del DEM | Residuos de 0,62 m (σ = 1 px) y 1,04 m (σ = 2 px) de desviación típica en el fondo del valle; justifican el suavizado σ = 1,2 px |
| Modo sin conexión | API con `TERRALAB_WORLD_OFFLINE=true` y caché de `make worlddata` (7,4 MB): las 4 peticiones del mundo responden 200 sin red |
| Pipeline (Node, datos reales) | Baja 1,4 s · media 2,0 s · alta 2,8 s. En calidad alta: 557 k triángulos en LOD0, 1 834 árboles, 3 204 arbustos, 127 rocas, 423 restos |
| Escena en el navegador (Chromium, GPU Apple M4 vía Metal, 1440 × 900) | Lista en 4,3–5,8 s. **60 fps (límite de vsync), percentil 95 de 16,8 ms** en las tres calidades con órbitas a ras de suelo, sobre la granja y aérea. Vista aérea: 50–65 llamadas de dibujo, 0,06–0,26 M triángulos y 357–793 ejemplares visibles |
| Revisión visual | Capturas desde el suelo (1,7 m), cerca de los árboles (sombras y LOD0), a 330 y 380 m (cambio de LOD2 a impostor sin salto visible), sobre la granja, aérea alta y horizonte con la sierra real |
| Build de producción | `vite preview`: el mundo se genera en 4,3 s sin errores. JS inicial de 86,7 kB gzip; el mundo se descarga aparte |
| `make check` | Ruff, Prettier, tsc, mypy, Vitest y build sin incidencias |
| Vitest · pytest | 172 pruebas en 24 archivos (37 nuevas) · 106 pruebas (63 nuevas) |
| Playwright | **24 pasan**. 4 nuevas del mundo con datos geográficos sintéticos (API simulada): etapas y procedencia, vistas, selección y capa OSM, respaldo procedural etiquetado y región demasiado grande |
| `npm audit` · `pip check` | 0 vulnerabilidades · sin dependencias rotas |

**Errores encontrados y corregidos durante la fase**
- **Sombras invisibles e iluminación plana.** La luz direccional seguía en su posición por defecto (0, 1, 0). Limpiar la caché del HDR desde un efecto volvía a suspender el componente, la referencia de la luz se soltaba y nunca se orientaba. Se resolvió con una luz propia (`<primitive>`) y una liberación diferida y con recuento del HDR.
- **Impostores negros.**
  - Al hornear el atlas, el borrado automático limpiaba el render target en cada fotograma.
  - La tijera de un render target se activa en el propio destino, no en el renderer.
  - Después, el mapa de normales horneado oscurecía las vistas desde arriba y se sustituyó por un autosombreado medio. El atlas se verificó exportándolo como imagen.
- **Calidad baja sin texturas.** El catálogo no tiene versiones de 512 px; ahora se usa la menor resolución disponible no inferior a la pedida y se reduce en el worker.
- **Montañas blancas en el horizonte.** El contexto de ±8 km obligaba a una niebla densa. Se amplió a ±15 km con una malla 16 veces más gruesa y la niebla empieza más lejos.
- **Aspecto de tablero de ajedrez.**
  - Se rediseñó el mosaico de campos en franjas estrechas e irregulares.
  - Se añadieron lindes graduales y un filtro 3 × 3 de los pesos.
  - Las transiciones de cobertura del contexto se desplazan con ruido.
  - Contra la repetición: variación girada y paso al color medio de cada capa a distancia.
- **Canales con agua blancos.** Una rugosidad de 0,06 reflejaba el horizonte; se subió a 0,32.
- **Faltaba el asfalto.** OSM marca vías pavimentadas cerca de la granja y el catálogo no tenía material: se añadió `asphalt_01` con el pipeline.
- **Lint del compilador de React.** Mutaciones de objetos de hooks (cámara, escena, luz) y `setState` en efectos: se resolvieron con `get()`, objetos propios creados en `useMemo` y estado desde callbacks asíncronos.

**Problemas pendientes y limitaciones conocidas**
- **Sin modelos de edificaciones ni especies nativas.** Las huellas de OSM se marcan en el suelo; se usan árboles genéricos del catálogo (ASSETS.md, faltantes).
- **El mosaico de campos es procedural.** WorldCover no distingue parcelas ni cultivos. Queda etiquetado en el panel de procedencia.
- **Impostores aproximados** (sin normales). La vegetación lejana vista desde arriba es tenue.
- **Repetición residual de texturas** de 2 m a 100–200 m (surcos y barbechos).
- **Rendimiento medido solo en una GPU potente (Apple M4).** Falta medir GPU integradas y móviles; el navegador de pruebas (WebGL por software) tarda ~1,5 min por escena.
- **Overpass en vivo desactivado.** Para otras regiones no hay caminos ni agua hasta configurar una instancia propia; el relieve y la cobertura sí se obtienen bajo demanda.
- **El DEM es de radar del año 2000** (incluye parte de la vegetación y las construcciones). El cielo es ambientación, no el clima ni la hora del lugar.
- **Accesos de diagnóstico solo en desarrollo** (`__terralabCamera`, `__terralabSky`, `__terralabTrees`, `__terralabImpostors`): se eliminan del build de producción.
- **Pendientes de fases anteriores:**
  - aviso `THREE.Clock` de R3F;
  - sin KTX2;
  - e2e solo en Chromium;
  - sin integración continua;
  - nada versionado.
