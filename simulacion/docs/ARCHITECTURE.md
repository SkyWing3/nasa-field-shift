# Arquitectura — TerraLab 3D

> Estado: **Fase 04 — base técnica, pipeline de assets, selector geográfico y generación del mundo 3D implementados.** Este documento describe la arquitectura vigente
> y las reglas que todas las fases deben respetar. Lo marcado como *previsto* aún no existe en el
> código; cualquier cambio se registra en `DECISIONS.md`.

## 1. Stack y versiones

Versiones fijadas exactamente (`package.json` sin rangos + `package-lock.json`; backend con
`requirements.lock` como restricciones de pip). Verificadas el 2026-11-14 en los registros
npm y PyPI, incluidas las dependencias *peer*.

| Ámbito | Paquete | Versión | Nota |
|---|---|---|---|
| Frontend | react / react-dom | 19.3.1 | R3F 9.8.2 exige `>=19 <19.4` |
| | three / @types/three | 0.187.0 | |
| | @react-three/fiber | 9.8.2 | |
| | @react-three/drei | 10.7.9 | peer `@react-three/fiber ^9` |
| | zustand | 5.1.0 | |
| | maplibre-gl | 6.16.0 | BSD-3; mapa mundial (ADR-027) |
| | geographiclib-geodesic | 2.2.0 | MIT; geodésicas y áreas WGS84 (ADR-032) |
| | vite / @vitejs/plugin-react | 8.3.8 / 6.3.0 | Vite 8 usa Rolldown |
| | typescript | 6.0.3 | No 7.x: ver ADR-009 |
| | eslint / typescript-eslint | 10.15.0 / 8.72.2 | reglas `strictTypeChecked` |
| | prettier | 3.10.1 | |
| | vitest | 5.1.0 | |
| | @playwright/test | 1.65.1 | Chromium headless shell 159 |
| Pipeline de assets (solo desarrollo) | @gltf-transform/core · extensions · functions | 4.5.1 | MIT |
| | meshoptimizer | 1.3.0 | simplificación y compresión; el decodificador en el navegador viene con three.js |
| | sharp | 0.35.5 | codificación WebP (binarios precompilados, sin scripts de instalación) |
| | gltf-validator | 2.0.0-dev.3.10 | validador oficial de Khronos |
| | fflate | 0.8.3 | descompresión de los ZIP de ambientCG |
| Backend | Python | ≥3.12 (verificado 3.15.2) | |
| | fastapi / starlette | 0.162.7 / 1.10.0 | |
| | uvicorn | 0.54.0 | sin extras `[standard]` |
| | pydantic / pydantic-settings | 2.14.3 / 2.16.3 | |
| | httpx2 | 2.16.0 | cliente HTTP (adaptador opcional de Nominatim, descarga de GeoNames) y `TestClient` |
| | pytest / ruff / mypy | 9.2.0 / 0.17.5 / 2.4.1 | solo desarrollo |
| | SQLite (FTS5) | 3.54 (de Python) | nomenclátor local GeoNames (ADR-028) |
| | NumPy | 2.5.4 | lectura de COG (elevación y cobertura) desde la fase 04 (ADR-035); también lo usará el motor agronómico |
| Persistencia | local / SQLite | *previsto* | PostgreSQL solo ante necesidad real |

## 2. Las seis capas y su ubicación

| # | Capa | Responsabilidad | Ubicación |
|---|---|---|---|
| 1 | **Renderizado gráfico** | Escena, materiales, luz, sombras, carga de recursos. Solo *lee* estado. El mundo se *genera* en `world/` (lógica pura en un worker) y se *dibuja* en los módulos de renderizado. | `frontend/src/scene/`, `terrain/`, `vegetation/`, `camera/`, `weather-visual/`; generación en `frontend/src/world/` |
| 2 | **Interacciones del usuario** | Herramientas, selección, UI. Traduce gestos en *comandos*. | `frontend/src/interaction/`, `frontend/src/ui/` |
| 3 | **Estado de la simulación** | Espejo en el cliente de las instantáneas del motor + estado de la aplicación. | `frontend/src/state/` |
| 4 | **Motor agronómico** | Modelos explícitos, puros y deterministas (NumPy). Sin HTTP ni E/S. | `backend/app/engine/` (*previsto*) |
| 5 | **Datos científicos y geográficos** | Fuentes NASA y otras, caché, unidades, procedencia. Hoy: búsqueda geográfica (GeoNames, Nominatim opcional), elevación NASADEM, cobertura ESA WorldCover y elementos OSM (ADR-034 a ADR-037). | `backend/app/data_sources/` (`geocoding/`, `raster/`, `elevation/`, `landcover/`, `osm/`; clima NASA *previsto*) |
| 6 | **Persistencia** | Escenarios y partidas tras interfaces de repositorio. Hoy: ubicación de la granja en el navegador (`SiteRepository`, ADR-030). | `frontend/src/persistence/`; `backend/app/persistence/` (*previsto*) |

Transversales: `frontend/src/geo/` (geodesia y marco local, sin dependencias de React ni del
mapa), `frontend/src/assets/` (contrato del catálogo de assets y su validación),
`frontend/src/domain/` (tipos de dominio y unidades, sin dependencias),
`frontend/src/simulation-client/` (HTTP), `frontend/src/config/` (entorno) y
`frontend/src/app/` (raíz de composición: el único módulo que conecta servicios con stores).
En el backend, `app/api/` es una capa HTTP delgada y `app/schemas/` define los contratos.

### Módulos del frontend

| Módulo | Contenido actual |
|---|---|
| `domain/` | `Quantity<U>` (unidades marcadas), `IsoDate`, `DataProvenance`, escala BBCH y las interfaces `Farm`, `Plot`, `Crop`, `CropGrowthStage`, `SoilState`, `WeatherState`, `SimulationState`, `SimulationScenario` |
| `scene/` | `SceneViewport` (escena provisional del laboratorio), `WorldViewport` (lienzo del mundo 3D: capas, sondeo de escena lista, monitor de rendimiento), detección de WebGL, recursos con liberación diferida (`resources.ts`) |
| `terrain/` | `TerrainLayer` (fragmentos con LOD, contexto, anillo exterior), `terrainMaterial` (mezcla PBR de 8 capas con texturas de array), `terrainResources`, superposiciones (límite de la granja, datos OSM); `ProvisionalGround` del laboratorio |
| `vegetation/` | Carga de modelos GLB del catálogo por variante y LOD, `VegetationRenderer` (instancing con selección por celdas y LOD por ejemplar), impostores de árboles, `VegetationLayer` |
| `camera/` | `WorldCameraRig` (órbita, zoom al cursor, WASD, vistas con transición, límites) y reglas puras (`worldCamera.ts`); `CameraRig` del laboratorio |
| `weather-visual/` | `WorldSky` (HDRI como fondo e IBL, sol alineado con el del HDRI, sombras que siguen al punto de mira, niebla del color del horizonte), `hdrAnalysis` (sol, horizonte, ACES); `SkyLighting` del laboratorio |
| `interaction/` | Selección de puntos del terreno (`TerrainPicker`, `terrainQuery`), marcador; catálogo de herramientas agrícolas (todas `planned`) |
| `state/` | Stores Zustand: `app` (pantallas inicio → ubicación → granja → mundo 3D / laboratorio), `site` (región en edición y ubicación guardada), `world` (generación, etapas, calidad, cielo, selección, capas, estadísticas), `scene`, `connection`, `simulation`, `ui` |
| `geo/` | WGS84 ↔ ECEF ↔ ENU, marco local de la escena (`createLocalFrame`), región rectangular en metros, medidas geodésicas (`metrics.ts`, GeographicLib), lectura de coordenadas, formato y región demostrativa verificada |
| `map/` | Adaptadores de mapa base (OpenFreeMap, Sentinel-2 cloudless 2016), polígono GeoJSON de la región y `MapViewport` (MapLibre, carga diferida): clic, dibujo, marcador arrastrable, encuadres, errores y reintento de teselas |
| `place-search/` | Interfaz `PlaceSearchProvider`, adaptador de la API y resolución local de coordenadas |
| `persistence/` | `SiteRepository` sobre `localStorage` con validación al leer |
| `world/` | Pipeline de generación (funciones puras, ejecutadas en un worker): extensión, rejillas geográficas, normalización del DEM, campo de alturas ENU y raycasting, malla con LOD, cobertura, elementos OSM locales, mosaico de campos, mapas de mezcla y campos de distancia, vegetación determinista, calidades, datos procedurales de respaldo, texturas de array y orquestación (`generate.ts`) |
| `simulation-client/` | `createSimulationClient` con tiempo límite, errores tipados (`ApiError`) y validación del contrato |
| `ui/` | Tokens de diseño, primitivas (Button, Icon, EmptyState, ErrorState, LoadingIndicator, ErrorBoundary, ApiStatusBadge), `TopBar`, `SidePanel`, `WorkspaceLayout`, `StartScreen`, `FarmScreen`, `location/` (panel de ubicación, buscador, campos, resumen, diálogo de confirmación, plano local), formato de magnitudes y fechas |
| `assets/` | Contrato de `catalog.json` (`catalogSchema.ts`, sin importaciones para que también lo use Node) y `parseAssetCatalog` (validación en tiempo de ejecución con rutas seguras) |
| `asset-viewer/` | **Herramienta de desarrollo** (entrada `asset-viewer.html`, fuera del build de producción): lista, lienzo R3F con LOD, modos de inspección, iluminación HDRI y sol, rendimiento y FPS. Estado propio en `viewerStore` (no comparte stores con la aplicación) |

### Fuera de `src/`

| Ruta | Contenido |
|---|---|
| `frontend/asset-pipeline/` | Pipeline de assets en TypeScript ejecutado por Node: selección, adaptadores de Poly Haven y ambientCG, descarga verificada, procesado de modelos, materiales y HDRI, validación, catálogo y documentación |
| `frontend/vite-plugins/assetLibrary.ts` | Sirve `asset-library/` en `/asset-library/` en desarrollo y, en el build, publica solo los recursos del mundo 3D (ADR-040) |
| `frontend/asset-library/`, `frontend/.asset-cache/` | Biblioteca procesada y originales descargados (no versionados, ADR-019) |

## 3. Reglas de dependencia

```
 interaction / ui ──comandos──▶ state ◀── app (composición) ──▶ simulation-client ──HTTP──▶ API
                                  │                                                           │
                                  ▼                                                   engine · data_sources
              scene · terrain · camera · weather-visual (solo lectura)                · persistence
                                  ▲
                                domain (sin dependencias; lo usan todos)
```

1. **El renderizado nunca escribe en el estado de simulación** ni llama al backend. Solo
   actualiza su propio ciclo de vida (`sceneStore`).
2. **La interacción no conoce el motor**: emitirá comandos tipados al estado.
3. **`simulation-client` no conoce React ni los stores**: devuelve datos validados o lanza
   `ApiError`. Solo `app/` los conecta.
4. **El motor agronómico no conoce HTTP, React ni el reloj de render.**
5. **Los datos científicos llegan al motor validados y con procedencia** (§5).
6. **La persistencia se accede solo a través de interfaces.**

## 4. Tiempo: simulación desacoplada del render

- La simulación avanzará en **pasos discretos** (`SimulationTimeStep = 'P1D'`, ADR-003) mediante
  comandos explícitos, nunca dentro de `useFrame`.
- El lienzo usa `frameloop="demand"`: solo dibuja cuando algo cambia (p. ej. la cámara). Ningún
  estado de simulación depende del bucle de render.
- Consecuencia: los mismos resultados con cualquier FPS o sin render (pruebas, lotes).

## 5. Rigor científico, unidades y trazabilidad

- **Unidades explícitas en el sistema de tipos**: `Quantity<'mm/d'>` no es asignable a
  `Quantity<'degC'>` ni un `number` suelto a una magnitud (verificado con `expectTypeOf` y
  `tsc`). Sin coste en ejecución ni en el JSON. Símbolos basados en UCUM.
- **Procedencia** (`DataProvenance`): `observed`, `reanalysis`, `model-output`, `literature`,
  `user-assumption`, `synthetic`. La barra superior muestra la fuente de la meteorología y
  resalta los datos sintéticos.
- **Fenología** con la escala BBCH (Meier, 2018, DOI 10.5073/20180906-074619, verificado).
- **Sin datos inventados**: sin escenario, la UI muestra estados vacíos explícitos ("Sin
  simulación activa", "—"); no hay valores de demostración.
- Reproducibilidad: `SimulationScenario.randomSeed` y `SimulationState.engineVersion`.

## 6. API

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","service":"terralab-api","version":"0.1.0","environment":"development"}` |
| GET | `/api/docs`, `/api/openapi.json` | Documentación interactiva (desactivada en `production`) |
| GET | `/api/geocoding/info` | Proveedor de búsqueda, atribución y disponibilidad |
| GET | `/api/geocoding/search?q=&limit=` | Lugares (`id`, `name`, `region`, `countryCode`, `latitude`, `longitude`, `kind`, `population`); 422 si la consulta no es válida, 503 sin nomenclátor o desactivado, 502/504 ante errores del servicio externo |
| GET | `/api/world/datasets` | Procedencia de los datasets (cita, licencia, resolución, datum, notas), clases de cobertura y si Overpass en vivo está activo |
| GET | `/api/world/elevation?south&west&north&east&maxSize` | Rejilla NASADEM (`float32le` en base64, NaN = vacío), georreferencia, estadísticas y teselas leídas/ausentes; 422 fuera de cobertura o área > 0,6°, 503 sin conexión y sin caché, 502/504 errores de origen |
| GET | `/api/world/landcover?…&maxSize` | Rejilla ESA WorldCover (`uint8`) en la vista reducida más fina que cabe en `maxSize` |
| GET | `/api/world/features?south&west&north&east` | Elementos OSM de la instantánea (o de Overpass si está configurado) con fecha de los datos; 503 sin datos para el área |

En el servidor de desarrollo de Vite (no en la API) existe además `GET /asset-library/<ruta>`
para el visualizador, limitado a `.json`, `.glb`, `.webp` y `.hdr` dentro de la biblioteca. En el
build de producción, `dist/asset-library/` contiene solo los recursos del mundo 3D (ADR-040).
Las respuestas de la API mayores de 2 KB se comprimen con gzip (la elevación de la demo pasa de
1,5 MB a 243 KB).

- Configuración por variables `TERRALAB_*` (pydantic-settings), con `create_app(settings)` para
  pruebas aisladas.
- **CORS solo en `development`** y restringido a orígenes explícitos (por defecto los puertos
  locales de Vite 5173 y 4173). Se rechazan comodines, barras finales y esquemas no HTTP. Sin
  credenciales. En producción el frontend y la API se servirán desde el mismo origen (ADR-012).
- El contrato de `HealthResponse` está duplicado en Pydantic y TypeScript (con validación en
  tiempo de ejecución en el cliente). *Previsto*: generar los tipos TS desde OpenAPI cuando
  crezca la API.

## 7. Interfaz y estados de la aplicación

```
StartScreen ──"Elegir la ubicación"──▶ LocationScreen (panel + MapViewport diferido)
     │  ▲                                    │ "Confirmar ubicación" → diálogo → guardar
     │  │                                    ▼
     │  └──────────── "Inicio" ────────── FarmScreen (plano local, medidas, marco ENU)
     │                                       │ "Modificar en el mapa" ↺   │ "Generar mundo 3D"
     │                                       │                            ▼
     │                                       │         WorldScreen (progreso por etapa → escena)
     │                                       │ "Laboratorio (escena provisional)"
     └──"Abrir el laboratorio"──▶ WorkspaceScreen (escena provisional) ◀──┘
```

- **Ubicación**: búsqueda solo al enviar (sin autocompletado), coordenadas escritas resueltas en
  local, clic en el mapa para el centro, «Dibujar» para trazar un rectángulo, marcador
  arrastrable, campos de ancho/largo/orientación con validación, región demostrativa. Las
  medidas (superficie, lados, orientación, vértices) son geodésicas. Con la API o el mapa base
  caídos, coordenadas y región demostrativa siguen funcionando; las teselas fallidas se pueden
  reintentar.

- **Mundo 3D**: progreso real de las 7 etapas con su duración; error con reintento y, si falta una
  fuente real, opción explícita de continuar con datos procedurales etiquetados; vistas aérea,
  granja y a pie; capas «Límite de la granja» y «Datos OSM»; selector de cielo (ambientación) y de
  calidad; panel de procedencia (dato real / procedural / recurso CC0), etapas y rendimiento;
  ficha del punto seleccionado; atribuciones siempre visibles.

- **Pantalla inicial**: estado del sistema (WebGL, API, motor y datos NASA marcados como
  pendientes). Sin WebGL, la entrada se bloquea con explicación.
- **Escena**: `idle → initializing → ready`, o `error` (`webgl-unsupported`, `context-lost`,
  `render-error`) con reinicio. Un `ErrorBoundary` cubre también un fallo al descargar el
  módulo 3D.
- **API**: se comprueba al iniciar y cada 30 s. Las comprobaciones concurrentes comparten una
  única petición, con un tiempo límite de 5 s. Los estados posibles son conectada, sin conexión
  (con reintento) y comprobando.
- **Carga**: indicador del motor gráfico (chunk diferido) y del progreso de recursos 3D
  (`DefaultLoadingManager`).
- **Adaptable**: por debajo de 860 px el panel pasa debajo de la escena; las métricas se ocultan
  progresivamente sin desbordamiento horizontal (verificado a 390 px).

## 8. Rendimiento gráfico

- **Carga diferida**: la pantalla inicial descarga 86,7 kB gzip de JS. Se descargan solo al
  entrar en cada pantalla (ADR-011, ADR-033):
  - Three.js (210 kB gzip, chunk `three` propio y cacheable) y R3F/Drei (61 kB gzip), al entrar
    al laboratorio o al mundo 3D.
  - El mundo 3D: pantalla (13,5 kB), visor (21,7 kB) y el worker de generación (30 kB sin
    comprimir).
  - MapLibre (293 kB gzip, chunk `maplibre` propio, más su worker), al abrir el mapa.
  - Geodesia y pantallas de ubicación (~20 kB gzip), al abrirlas.

  Verificado en el build de producción.
- **Mundo 3D** (ADR-038 a ADR-042), medido en Chromium con GPU Apple M4 (Metal), 1440 × 900:
  - Calidad baja, media y alta: 60 fps (límite de vsync), con percentil 95 de 16,8 ms en órbitas
    a ras de suelo, sobre la granja y aérea.
  - Escena lista en 4,3–5,8 s; el pipeline en el worker tarda 1,4/2,0/2,8 s (baja/media/alta).
  - En vista aérea: 50–65 llamadas de dibujo y 0,06–0,26 M triángulos.
  - Técnicas: render bajo demanda, frustum culling por fragmento y por celda, LOD del terreno y
    de cada ejemplar, impostores, `InstancedMesh`, texturas de array con mipmaps, `dpr` y
    sombras por calidad, liberación de geometrías, materiales, texturas, render targets y del
    HDR (diferida y con recuento).
- *Previsto* (fase de rendimiento): KTX2/Basis, sombras en cascada, presupuesto medido en GPU
  integradas y móviles.

## 9. Sistema de coordenadas geográficas y local

- **Entrada**: coordenadas geodésicas WGS84 (grados). **Escena**: plano tangente ENU en el
  origen fijo de la granja (centro confirmado, guardado aparte), en metros: `x = este`,
  `y = arriba`, `z = −norte` (ADR-029). Conversión exacta vía ECEF (`geo/wgs84.ts`,
  `geo/localFrame.ts`).
- **Región**: centro + ancho + largo + orientación en metros; vértices por ENU inversa. Lados de
  50 m a 5 km, latitud hasta ±85°.
- **Medidas**: geodésicas sobre el elipsoide con GeographicLib (área de polígono, lados,
  azimut). Nunca se tratan grados como metros.
- **Limitaciones verificadas**: error horizontal del plano tangente < 1 ppm hasta 3,5 km; la
  superficie cae d²/2R por debajo del plano (7,8 cm a 1 km). Desde la fase 04 el terreno se
  construye en este marco **incluyendo** esa caída (y = coordenada «arriba» ENU del suelo, con
  y = 0 en el origen), así que alturas y distancias son coherentes en todo el contexto de ±15 km.
  No apto para regiones mayores de 5 km ni cercanas a los polos.

## 10. Pipeline de assets

```
selection.ts ─▶ API Poly Haven / ambientCG ─▶ descarga (MD5 + SHA-256 en sources.lock.json)
                                                   │
             .asset-cache/ (originales) ◀──────────┘
                    │
                    ▼  process
   modelos: limpieza → LOD0..2 en un GLB → WebP → meshopt → glTF-Validator → comprobaciones
   materiales: albedo · normal · ORM · altura (WebP 2048/1024) → comprobaciones
   HDRI: .hdr 1K/2K → cabecera Radiance
                    │
                    ▼
   asset-library/ + catalog.json ──▶ docs/ASSETS.md (tabla generada)
                    │
                    ▼  plugin de Vite (solo desarrollo)
   /asset-library/… ──▶ visualizador (GLTFLoader + MeshoptDecoder, TextureLoader, RGBELoader de drei)
```

- Reproducible: misma selección + mismo lock ⇒ mismos originales. Las salidas pueden variar
  en bytes si cambian las versiones de las herramientas, que están fijadas.
- Unidades: metros, eje Y hacia arriba (glTF). La escala se valida contra el glTF de origen.
- Los LOD se publican como nodos `LOD0…LODn`; quien consuma el GLB decide las distancias de
  cambio (el visualizador usa 8 y 20 radios, provisionales).

## 11. Generación del mundo 3D

```
región guardada ─▶ extent.ts (detalle 3–6 km · contexto ±15 km · límite 4 km)
       │
       ▼  hilo principal (API, en paralelo)
  /api/world/elevation · landcover ×2 · features · datasets ─▶ ¿falla una fuente real? → error o
       │                                                       respaldo procedural con consentimiento
       ▼  worker (src/world/, funciones puras)
  normalización  → relleno de vacíos, σ = 1,2 px, bicúbica → campo de alturas ENU (+ contexto)
  malla          → 8 × 8 fragmentos × 3 LOD con faldones · anillo de contexto
  materiales     → cobertura + pendiente + región reservada + mosaico de campos → pesos (8 capas)
                   texturas PBR del catálogo → 2 texturas de array
  elementos      → OSM local → campos de distancia (pavimento, tierra, cauce, agua) + edificaciones
  vegetación     → árboles, arbustos, rocas y restos por celdas (deterministas, con exclusiones)
       │
       ▼  hilo principal (GPU)
  escena         → TerrainLayer · VegetationLayer (instancing, LOD, impostores; pasto y maleza
                   cerca de la cámara) · WorldSky · superposiciones · cámara · selección
```

- **Procedencia** visible en la escena: relieve (NASADEM), cobertura (ESA WorldCover) y elementos
  (OSM) son datos reales. Campos, posiciones de plantas y especies representativas son
  procedurales. Materiales, modelos y cielo son recursos CC0.
- **Preparado para las parcelas** (fase 05): `heightAt`, `normalAt`, `slopeDegAt`,
  `raycastHeightfield` y `describeTerrainPoint` dan altura, pendiente, cobertura y elementos
  cercanos de cualquier punto. La región reservada queda libre de vegetación y con suelo agrícola
  uniforme.
- **Determinismo**: la semilla deriva del centro de la región; la misma región genera el mismo
  mundo en cualquier navegador.

## 12. Calidad y pruebas

| Nivel | Herramienta | Alcance |
|---|---|---|
| Tipos | `tsc -b` estricto (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`…), `mypy --strict` | Todo el código, incluidas las pruebas |
| Lint/formato | ESLint `strictTypeChecked` + react-hooks + react-refresh, Prettier; Ruff | Todo |
| Unitarias | Vitest (entorno node), pytest | Lógica pura: dominio, cliente HTTP, stores, formato, configuración, CORS, pipeline de assets, plugin de Vite, catálogo, LOD, modos de visualización, liberación de recursos; geodesia (ECEF/ENU, áreas frente a fórmula analítica, región, lectura y formato de coordenadas, preset demostrativo), persistencia, búsqueda, mapa base; backend: nomenclátor (FTS, acentos, inyección), Nominatim (≤ 1 pet./s, caché, errores, User-Agent) y endpoints de búsqueda. Fase 04: lector COG con GeoTIFF sintéticos (TIFF/BigTIFF, órdenes de bytes, DEFLATE, predictores, vistas reducidas, mosaicos que comparten borde, teselas ausentes), rangos HTTP con caché y modo sin conexión, OSM (clasificación, instantáneas, Overpass limitado), endpoints del mundo; frontend: extensión, muestreo, normalización, campo de alturas y raycasting, malla y faldones, materiales, campos de distancia, vegetación determinista y exclusiones, pipeline completo, análisis del HDRI, reglas de cámara, consulta de puntos, texturas por resolución |
| Navegador | Playwright (Chromium) | Flujos de UI, WebGL real (análisis de píxeles), errores de consola, API real y simulada, móvil. Visualizador: carga de **todos** los assets disponibles en Three.js (requiere `make assets`). Selector geográfico con proveedores sustituidos por respuestas locales: navegación, clic, dibujo, campos, búsqueda, persistencia tras recargar, errores de red, reintento de teselas, satélite, móvil. Mundo 3D con datos geográficos sintéticos (API simulada): etapas, procedencia, imagen no uniforme, vistas, selección del terreno, capa OSM, respaldo procedural etiquetado y región demasiado grande |
| Assets | glTF-Validator de Khronos y comprobaciones del pipeline | Cada asset en cada `make assets`; `make assets-verify` para la integridad |
