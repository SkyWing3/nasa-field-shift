# TerraLab 3D

La entrada principal actual es Raíz 2D; TerraLab 3D se conserva en `/terralab.html`. Los créditos están en `/?vista=creditos`; las direcciones anteriores `/raiz.html` y `/creditos.html` redirigen ahí. Ver [entrega, supuestos y evidencia](docs/ENTREGA_P6_V3.md). Para regenerar los nueve casos con los insumos locales: `make raiz-data`.

Plataforma web de simulación agrícola en 3D para el apoyo a decisiones: preparar parcelas,
cultivar, regar, cosechar, avanzar el tiempo y comparar estrategias de rotación con modelos
agronómicos explícitos y datos científicos de la NASA.

> **Estado: Fase 04 — mundo agrícola 3D generado a partir de la ubicación.** Flujo Inicio → Mapa →
> Selección → Confirmación → Preparación de la granja → **Generar mundo 3D**:
> - Relieve real NASADEM (NASA JPL, vía OpenTopography), cobertura del suelo ESA WorldCover y
>   caminos, agua y edificaciones de OpenStreetMap.
> - Terreno con niveles de detalle y materiales PBR del catálogo, y vegetación instanciada con
>   impostores.
> - Cielo HDRI con sombras, cámara explorable y selección de puntos del terreno.
>
> La región demostrativa del Valle Alto de Cochabamba funciona sin red tras `make worlddata`. Los
> cultivos, el motor agronómico y los datos climáticos de la NASA llegarán en fases posteriores
> (ver [docs/ROADMAP.md](docs/ROADMAP.md)).

## Requisitos

| Herramienta | Versión mínima | Versión verificada |
|---|---|---|
| Node.js | 24 | 26.8.1 |
| npm | 10 | 12.0.2 |
| Python | 3.12 | 3.15.2 |
| GNU Make | cualquiera | la incluida en macOS |

Un navegador con WebGL 2 (Chrome, Edge, Firefox o Safari recientes). Para la biblioteca de assets:
conexión a internet y ~600 MB de disco (450 MB de originales y 131 MB procesados).

## Instalación

```bash
make install            # frontend (npm ci) + backend (backend/.venv con versiones fijadas)
make install-browsers   # Chromium para las pruebas de Playwright (opcional, ~100 MB)
make assets             # biblioteca de assets CC0: descarga verificada (~400 MB) y procesado
make geodata            # nomenclátor GeoNames para la búsqueda de lugares (~14 MB, una vez)
make worlddata          # relieve, cobertura y OSM de la región demostrativa (~7 MB, una vez)
```

La biblioteca de assets no se versiona: `make assets` la regenera a partir de
`frontend/asset-pipeline/selection.ts` y comprueba cada original con las huellas SHA-256 de
`frontend/asset-pipeline/sources.lock.json`. Detalles y licencias en [docs/ASSETS.md](docs/ASSETS.md).

`make worlddata` lee solo las partes necesarias de los COG de NASADEM y ESA WorldCover y hace una
única consulta acotada a Overpass para la región demostrativa. Lo guarda todo en
`backend/data/world/` (no versionado). Después, esa región se genera sin red. Para otras regiones, el
backend lee el relieve y la cobertura bajo demanda y los guarda en la misma caché. Los elementos de
OSM solo están disponibles si se configura una instancia de Overpass propia (ver más abajo).

El nomenclátor tampoco se versiona: `make geodata` descarga tres volcados públicos de GeoNames
(CC BY 4.0) y construye `backend/data/geonames/gazetteer.sqlite3` (~237 000 lugares con más de
500 habitantes). Sin él, la búsqueda por nombre aparece como no disponible; la búsqueda por
coordenadas, el mapa y el resto del flujo siguen funcionando.

Variables de entorno (opcional; los valores por defecto sirven para desarrollo local):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

| Variable | Dónde | Por defecto | Uso |
|---|---|---|---|
| `VITE_API_BASE_URL` | frontend | vacío (mismo origen) | `/api` usa el dominio de la página; Vite lo reenvía a `127.0.0.1:8000`. Una URL absoluta permite una API en otro origen |
| `TERRALAB_ENVIRONMENT` | backend | `development` | `development`, `test` o `production` |
| `TERRALAB_CORS_ORIGINS` | backend | puertos locales de Vite 5173 y 4173 | Orígenes CORS, separados por comas. Solo se aplican en `development` |
| `VITE_BASEMAP_STYLE_URL` | frontend | estilo «Liberty» de OpenFreeMap | Estilo vectorial MapLibre del mapa base (solo `https://`) |
| `VITE_SATELLITE_TILES_URL` | frontend | Sentinel-2 cloudless 2016 de EOX | Plantilla XYZ `{z}/{x}/{y}` de la capa satelital (solo `https://`) |
| `TERRALAB_GEOCODER` | backend | `geonames` | Búsqueda de lugares: `geonames` (local), `nominatim` o `disabled` |
| `TERRALAB_GAZETTEER_PATH` | backend | `backend/data/geonames/gazetteer.sqlite3` | Base SQLite que genera `make geodata` |
| `TERRALAB_NOMINATIM_URL` | backend | `https://nominatim.openstreetmap.org` | Instancia de Nominatim (solo `https://`) |
| `TERRALAB_NOMINATIM_USER_AGENT` | backend | vacío | Obligatoria con `nominatim`: identificación propia y contacto de la instalación |
| `TERRALAB_WORLD_DATA_DIR` | backend | `backend/data/world` | Caché de rangos COG e instantáneas OSM |
| `TERRALAB_WORLD_OFFLINE` | backend | `false` | `true`: el mundo 3D usa solo la caché local, sin peticiones externas |
| `TERRALAB_ELEVATION_URL` / `TERRALAB_LANDCOVER_URL` | backend | OpenTopography (NASADEM) / AWS (WorldCover) | Base de las teselas COG (solo `https://`) |
| `TERRALAB_OVERPASS_URL` | backend | vacío (desactivado) | Instancia de Overpass para elementos OSM de regiones sin instantánea; idealmente propia |
| `TERRALAB_OVERPASS_USER_AGENT` | backend | vacío | Obligatoria si se configura Overpass |

### Búsqueda con Nominatim (opcional, desactivada por defecto)

La instancia pública de Nominatim pertenece a la OpenStreetMap Foundation y se rige por su
[política de uso](https://operations.osmfoundation.org/policies/nominatim/). Antes de activarla con
`TERRALAB_GEOCODER=nominatim`, léela y asegúrate de cumplirla: como máximo 1 petición por segundo
en total, un User-Agent que identifique tu instalación, sin autocompletado, caché de resultados y
atribución visible. El backend aplica el límite de 1 petición por segundo, una caché de 24 h y la
búsqueda solo al enviar el formulario, pero la responsabilidad de cumplir la política recae en quien
despliega la instalación. Para un uso intensivo se recomienda una instancia propia.

## Desarrollo

```bash
make dev
```

Levanta en paralelo (Ctrl+C detiene ambos):

- Frontend: <http://localhost:5173> (Inicio → «Elegir la ubicación de la granja» abre el mapa)
- Visualizador de assets (solo desarrollo, requiere `make assets`): <http://localhost:5173/asset-viewer.html>
- API: <http://127.0.0.1:8000/api/health> · documentación interactiva en <http://127.0.0.1:8000/api/docs>

También pueden levantarse por separado con `make dev-frontend` y `make dev-backend`.

Para abrir la aplicación mediante Cloudflare Tunnel, dirige el dominio
`nasa-simulacion.los5furiosos.cloud` a `http://localhost:5173` y mantén ambos servidores
en ejecución. Deja `VITE_API_BASE_URL` vacío: el navegador consulta `/api` en ese mismo
dominio y el proxy de Vite lo reenvía a FastAPI. No hace falta otro túnel ni añadir ese
dominio a CORS. `https://nasa-simulacion.los5furiosos.cloud/api/health` debe devolver JSON.
Al cambiar variables de entorno, reinicia Vite. Para publicar el build de producción,
configura también el servidor de despliegue para enrutar `/api` al backend.

## Comandos

| Comando | Qué hace |
|---|---|
| `make check` | Verificación completa: lint, formato, tipos, pruebas unitarias y build |
| `make lint` | ESLint + Prettier (frontend), Ruff (backend) |
| `make typecheck` | `tsc -b` (frontend) y `mypy --strict` (backend) |
| `make test` | Vitest (frontend) y pytest (backend) |
| `make test-e2e` | Playwright en Chromium; levanta API y frontend si no están en marcha (las del visualizador requieren `make assets`) |
| `make assets` | Descarga y procesa la biblioteca de assets (`assets-fetch`, `assets-process` por separado) |
| `make assets-verify` | Comprueba tamaño y SHA-256 de cada archivo procesado contra el catálogo |
| `make geodata` | Descarga los volcados de GeoNames y construye el nomenclátor local (`--refresh` en el script para volver a descargar) |
| `make worlddata` | Prepara los datos del mundo 3D de la región demostrativa (`--refresh-osm` en el script para repetir la consulta OSM) |
| `make build` | Build de producción del frontend en `frontend/dist` |
| `make format` | Aplica Prettier y Ruff |
| `make help` | Lista todos los comandos |

Sin `make`, los equivalentes son los scripts de `frontend/package.json` (`npm run dev`,
`npm run build`, `npm test`, `npm run test:e2e`…) y, en `backend/`,
`.venv/bin/uvicorn app.main:app --reload`, `.venv/bin/pytest`, `.venv/bin/ruff check .` y
`.venv/bin/mypy`.

## Estructura

```
├── CLAUDE.md            Instrucciones maestras del proyecto
├── Makefile             Tareas de desarrollo
├── docs/                Arquitectura, roadmap, decisiones, progreso y assets
├── frontend/            React 19 + TypeScript + Vite + Three.js + R3F + Drei + Zustand
│   ├── asset-pipeline/          Pipeline de assets (selección, descarga, procesado, validación)
│   ├── asset-viewer.html        Entrada del visualizador de assets (solo desarrollo)
│   ├── vite-plugins/            Plugin que sirve asset-library/ en desarrollo
│   ├── src/
│   │   ├── app/                 Raíz de composición (servicios, pantallas)
│   │   ├── assets/              Contrato y validación del catálogo de assets
│   │   ├── asset-viewer/        Visualizador de assets (herramienta de desarrollo)
│   │   ├── domain/              Tipos de dominio con unidades explícitas
│   │   ├── geo/                 Geodesia pura: WGS84, ECEF, marco ENU, regiones, medidas, presets
│   │   ├── map/                 Mapa MapLibre, mapas base y GeoJSON de la región
│   │   ├── place-search/        Búsqueda de lugares y coordenadas (adaptador de proveedor)
│   │   ├── persistence/         Ubicación guardada (localStorage, validada)
│   │   ├── world/               Generación del mundo 3D (pipeline puro en un worker)
│   │   ├── scene/               Escena 3D: lienzo, ciclo de vida, WebGL
│   │   ├── terrain/             Terreno: fragmentos con LOD, material de mezcla, capas
│   │   ├── vegetation/          Vegetación instanciada e impostores
│   │   ├── interaction/         Selección del terreno y herramientas
│   │   ├── camera/              Cámara del mundo y del laboratorio
│   │   ├── weather-visual/      Cielo HDRI, sol y niebla (clima visual)
│   │   ├── state/               Estado global (Zustand)
│   │   ├── simulation-client/   Cliente HTTP de la API
│   │   ├── ui/                  Componentes de interfaz
│   │   └── config/              Configuración por entorno
│   └── e2e/                     Pruebas de Playwright
└── backend/             FastAPI
    ├── app/
    │   ├── api/                 Routers HTTP
    │   ├── core/                Configuración
    │   ├── schemas/             Contratos Pydantic
    │   ├── engine/              Motor agronómico (fases posteriores)
    │   ├── data_sources/        geocoding/, raster/ (lector COG), elevation/ (NASADEM),
    │   │                        landcover/ (WorldCover), osm/ (instantáneas, Overpass opcional)
    │   └── persistence/         Persistencia (fases posteriores)
    ├── data/geonames/           Nomenclátor generado por `make geodata` (no versionado)
    ├── data/world/              Caché del mundo 3D generada por `make worlddata` (no versionado)
    └── tests/
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Registro de decisiones](docs/DECISIONS.md)
- [Progreso](docs/PROGRESS.md)
- [Assets y licencias](docs/ASSETS.md)
