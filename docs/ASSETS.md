# Registro de assets — TerraLab 3D

Todo recurso externo (modelos 3D, texturas, HDRI, sonidos, fuentes, datasets) debe estar registrado aquí **antes** de incorporarse al proyecto. Política de licencias: ADR-007; uso de API y privacidad: ADR-024 (`DECISIONS.md`). Presupuesto para assets, software y servicios: **USD 0**.

## Reglas
1. La licencia se verifica en la página de origen en el momento de la descarga; no se asume.
2. Se registra la URL exacta del recurso, no solo la del sitio.
3. Los recursos con atribución obligatoria incluyen el texto de atribución tal como lo exige el autor.
4. Si un recurso necesario no está disponible con licencia compatible, se anota como faltante y **no** se sustituye silenciosamente por una primitiva.
5. No se compran recursos, no se activan servicios de pago ni pruebas gratuitas que deriven en suscripción, y no se presume gratuito un recurso de Fab o Sketchfab sin verificar el producto y su licencia individual.
6. Los assets se descargan solo con enlaces directos que publica la propia fuente (sus API); no se construyen URL a mano ni se eluden restricciones de acceso.

## Fuentes y licencias verificadas (2026-11-14)

| Fuente | Licencia de los assets | Verificación | Condiciones de la API |
|---|---|---|---|
| Poly Haven | CC0 1.0: uso libre, también comercial, sin atribución obligatoria | <https://polyhaven.com/license> | [ToS de la API](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md): uso gratuito, también comercial; exige un User-Agent o Referer propio del software (2.4). La atribución (2.5) solo aplica si la API en vivo muestra contenido dentro de la app; **no** a los assets descargados y autoalojados. Aun así, el visualizador muestra la fuente de cada asset. |
| ambientCG | CC0 1.0 (incluye archivos y renders de vista previa) | <https://docs.ambientcg.com/license/> | API v2 pública; su autor advierte que no está pensada para uso "enterprise". La API no publica el autor individual ni las dimensiones físicas de cada material. |
| Sketchfab | Licencia por modelo (se consultó con su API pública de búsqueda) | Página de cada modelo | La descarga exige cuenta y aceptar sus términos (la API responde `401` sin credenciales). No se descargó nada. |

## Pipeline de adquisición y optimización

`frontend/asset-pipeline/` (Node 26 ejecutando TypeScript directamente) — comandos `make assets`, `make assets-fetch`, `make assets-process`, `make assets-verify`.

1. **Selección declarativa** (`selection.ts`): cada asset con su fuente, categoría, presupuesto de triángulos, niveles de detalle y resolución. Los faltantes se declaran con motivo y alternativas.
2. **Descarga verificada** (`fetch`): las URL, tamaños y MD5 salen de las API de Poly Haven (`/info`, `/files`) y ambientCG (`/api/v2/full_json`). Cada archivo se comprueba contra el tamaño y MD5 publicados y su SHA-256 queda en `asset-pipeline/sources.lock.json` (versionado). Si un archivo cambia en origen, la descarga falla. Concurrencia 3 y respuestas de la API en caché para no sobrecargar los servidores.
3. **Procesado** (`process`):
   - *Modelos*: limpieza con glTF-Transform sin mezclar variantes, LOD0 limitado por presupuesto y LOD1/LOD2 dentro del mismo GLB (texturas compartidas), simplificación sensible a atributos de meshoptimizer, texturas WebP ≤ 1024 px, compresión `EXT_meshopt_compression`.
   - *Materiales de terreno*: albedo, normal (OpenGL), ORM empaquetado (R oclusión, G rugosidad, B metalicidad) y altura en WebP a 2048 y 1024 px.
   - *HDRI*: Radiance `.hdr` a 1K y 2K, validados y copiados sin recodificar.
4. **Validación** (falla el asset si no la supera): Khronos glTF-Validator sin errores; escala del glTF de origen conservada (±3 %); altura plausible en metros para su tipo; base en el suelo; LOD0 dentro del presupuesto; cada LOD reduce triángulos; texturas potencia de dos. Materiales: resolución exacta, mapa normal plausible y metalicidad ≈ 0. HDRI: cabecera Radiance y proyección 2:1.
5. **Catálogo**: `frontend/asset-library/catalog.json` (contrato tipado en `src/assets/catalogSchema.ts`) y la tabla generada de este documento. `make assets-verify` recalcula el SHA-256 de cada archivo procesado.

**Ubicación**: los originales (`frontend/.asset-cache/`, ~450 MB) y la biblioteca procesada (`frontend/asset-library/`, ~131 MB) **no se versionan** (ADR-019); se regeneran con `make assets` y se verifican con el lock.

**Visualizador**: <http://localhost:5173/asset-viewer.html> con `make dev` (solo en desarrollo).

## Recursos propios del proyecto

| ID | Recurso | Tipo | Ruta | Notas |
|---|---|---|---|---|
| OWN-001 | Marca TerraLab (surcos estilizados) | SVG | `frontend/public/favicon.svg`, `frontend/src/ui/components/BrandMark.tsx` | Creada para el proyecto |
| OWN-002 | Iconos de interfaz (herramientas, calendario, alerta…) | SVG en línea | `frontend/src/ui/components/Icon.tsx` | Trazos dibujados para el proyecto; sin librería de iconos |
| OWN-003 | Cielo procedural | Shader | `@react-three/drei` `<Sky>` (modelo de Preetham, MIT vía three-stdlib) | Código de dependencia npm, no un asset descargado |
| OWN-004 | Esferas de referencia de iluminación (gris 18 % y cromo) | Geometría y material en código | `frontend/src/asset-viewer/scene/HdriPreview.tsx` | Herramienta estándar de look-dev para evaluar HDRI en el visualizador; no representa ningún asset del juego |

**Tipografía:** no se empaqueta ninguna fuente web. La pila de fuentes empieza por `Inter` (se usa solo si está instalada localmente) y recurre a las fuentes del sistema (`system-ui`, San Francisco, Segoe UI, Roboto).

## Limitaciones conocidas de los assets incorporados

- **Variantes en conjuntos**: varios modelos de Poly Haven traen varias variantes en un mismo archivo (17 matas en `grass_medium_01`, 4 arbustos en `shrub_02`…). El pipeline las conserva como nodos separados (`ModelInfo.variants`) para poder instanciarlas por separado.
- **Dimensiones publicadas**: Poly Haven mide su escena `.blend` completa, que puede incluir objetos que el glTF no exporta (por ejemplo `island_tree_01`: 12,46 m de ancho publicados frente a 4,76 m del glTF, con alto y fondo idénticos). La escala se valida contra el glTF de origen; las dimensiones publicadas se muestran como dato informativo.
- **Tangentes**: los 414 avisos del validador de Khronos son `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`: las mallas con mapa normal no traen tangentes y Three.js las genera en el sombreador. Es aceptable; añadir tangentes MikkTSpace aumentaría el peso.
- **LOD2 de vegetación**: la simplificación agresiva (8 % del LOD0) aclara el follaje del árbol; es adecuado a 20 radios de distancia, pero para vegetación lejana masiva convendrá un impostor o billboard (fase de vegetación).
- **Memoria de GPU**: las texturas WebP se descomprimen en GPU (RGBA8). El catálogo estima la memoria de cada asset; KTX2/Basis la reduciría entre 4 y 8 veces (pendiente, ADR-022).
- **Relieve de los materiales**: las fuentes no publican la altura física del mapa de desplazamiento; el visualizador usa una escala visual de 2 cm rotulada como no medida.
- **ambientCG**: sin autor individual ni tamaño físico publicados; el visualizador supone 2 m por repetición y lo indica.

## Recursos faltantes sin asset en el catálogo

| Recurso necesario | Fase | Situación | Alternativa gratuita |
|---|---|---|---|
| Terreno con relieve (mapa de alturas real) | 04 | ✅ Resuelto con NASADEM (ver «Datos geográficos del mundo 3D») | — |
| Mapa mundial para seleccionar ubicación | 03 | ✅ Resuelto con OpenFreeMap y EOX (ver «Datos y servicios geográficos») | — |
| Modelos 3D de viviendas rurales (adobe, teja, calamina) | 04 | **Faltante.** Poly Haven y ambientCG no publican edificaciones rurales andinas; los modelos de Sketchfab con CC BY requieren cuenta. Las huellas de edificaciones de OSM se marcan en el suelo como tierra apisonada y en la capa «Datos OSM», **sin** sustituirlas por cajas | Modelado procedimental (Blender, GPL) a partir de la huella de OSM con texturas CC0 de muros y tejados de Poly Haven/ambientCG (p. ej. `plastered_wall`, `roof_tiles`), en una fase posterior |
| Especies nativas del valle (molle, eucalipto, chillka) | 04 | **Faltante.** Se usan árboles y arbustos genéricos del catálogo como representación, sin afirmar especie | Modelos CC0 de especies similares si aparecen en Poly Haven; modelado procedimental con atlas de hojas CC0 de ambientCG |

Los cultivos (papa, maíz, haba) y la cerca rural de madera figuran como faltantes en el catálogo generado, con sus alternativas.

## Datos y servicios geográficos (fase 03)

Servicios y datasets externos usados por el selector geográfico. Políticas leídas en origen el 2026-11-14 (ADR-027, ADR-028, ADR-031).

| Recurso | Uso | Licencia / condiciones | Atribución en la app | Cómo se usa |
|---|---|---|---|---|
| [OpenFreeMap](https://openfreemap.org/) · estilo «Liberty» | Mapa base vectorial | Instancia pública gratuita, sin claves ni límites de vistas; uso comercial permitido. Datos © OpenStreetMap (ODbL), esquema OpenMapTiles | «OpenFreeMap © OpenMapTiles Data from OpenStreetMap» (automática en MapLibre, siempre desplegada) | Teselas visibles bajo demanda, sin precarga |
| [EOX Sentinel-2 cloudless 2016](https://s2maps.eu) | Satélite | CC BY 4.0 (las ediciones de 2018 en adelante son CC BY-NC-SA y no se usan). EOX permite su uso en aplicaciones con atribución y enlace a EOX::Maps | «Sentinel-2 cloudless 2016 por EOX IT Services GmbH (contiene datos modificados de Copernicus Sentinel 2016, CC BY 4.0) · EOX::Maps» | Fuente limitada a zoom 15 (10 m/píxel) |
| [GeoNames](https://www.geonames.org/) `cities500`, `admin1CodesASCII`, `countryInfo` | Búsqueda de lugares (nomenclátor local) | CC BY 4.0; volcados publicados para su descarga | «Búsqueda: GeoNames (CC BY 4.0)» junto a los resultados | `make geodata`: 3 archivos (≈ 14 MB) descargados una vez, con SHA-256 en `backend/data/geonames/manifest.json` (no versionado) |
| [Nominatim](https://nominatim.org/) (OSMF) | Búsqueda opcional, **desactivada** | [Política de uso](https://operations.osmfoundation.org/policies/nominatim/): ≤ 1 petición/s en total, User-Agent propio, sin autocompletado, caché, atribución; solo por decisión deliberada de quien desarrolla | «© OpenStreetMap contributors (ODbL) · Nominatim» | Solo si se configura `TERRALAB_GEOCODER=nominatim` con `TERRALAB_NOMINATIM_USER_AGENT` |
| [ESA WorldCover 10 m 2021 v200](https://esa-worldcover.org/) | Verificación puntual de la región demostrativa | CC BY 4.0 («© ESA WorldCover project / Contains modified Copernicus Sentinel data processed by ESA WorldCover consortium») | En los datos de verificación del preset | Lectura parcial del COG `S18W066` en AWS Open Data, una vez; no se redistribuye |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) vía Overpass API | Verificación puntual de la región demostrativa | ODbL; una consulta acotada al Valle Alto | Enlace a la vía 723914107 en los datos del preset | No se guardan datos de OSM en el repositorio, solo el identificador de la vía |

## Datos geográficos del mundo 3D (fase 04)

Políticas y licencias leídas en origen el 2026-11-14 (ADR-034 a ADR-037). Ningún dato se versiona:
`make worlddata` los prepara en `backend/data/world/` (caché de rangos COG de 7,4 MB e instantánea
OSM de la región demostrativa).

| Recurso | Uso | Licencia / condiciones | Atribución en la app | Cómo se usa |
|---|---|---|---|---|
| [NASADEM HGT v001](https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001) (NASA JPL) vía el [almacenamiento público de OpenTopography](https://portal.opentopography.org/raster?opentopoID=OTSDEM.032021.4326.2) | Relieve real (1″ ≈ 30 m, SRTM 2000, EGM96) | Datos de la NASA sin restricciones de uso. Condición de OpenTopography, **aceptada por el usuario el 2026-11-14**: citar a OpenTopography y la fuente del dataset | «Relieve: NASADEM (NASA JPL) vía OpenTopography» en la escena; cita completa en el panel de procedencia y en `/api/world/datasets` | Lectura parcial por rangos HTTP de las teselas COG necesarias (región demostrativa: `s18w066` y `s18w067`) |
| [ESA WorldCover 10 m 2021 v200](https://esa-worldcover.org/) (AWS Open Data) | Cobertura del suelo: materiales y vegetación | CC BY 4.0 | «Cobertura: © ESA WorldCover 2021» y la atribución completa en el panel | Lectura parcial del COG `S18W066` a 10 m (detalle) y 80 m (contexto) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) vía [Overpass API](https://overpass-api.de/) | Caminos, cauces, agua, edificaciones y huertos | ODbL 1.0. Las instancias públicas piden no usarse como backend de aplicaciones: una sola consulta acotada (±3 km) para la región demostrativa; la consulta en vivo está desactivada salvo `TERRALAB_OVERPASS_URL` | «Caminos y agua: © OpenStreetMap contributors (ODbL)» y la fecha de los datos en el panel | Instantánea local (1 141 elementos, datos del 2026-11-14) |
| Copernicus DEM GLO-30 / Planetary Computer | **No usados** | Requieren aceptar la licencia Copernicus o los términos suplementarios de Microsoft Planetary Computer | — | Alternativas documentadas en ADR-034 |

**Publicación en el build de producción (ADR-040):** `dist/asset-library/` incluye solo los recursos
del mundo 3D: los 8 materiales del terreno a 1024 px (con `asphalt_01`, añadido en esta fase para
las vías pavimentadas), los 13 modelos de vegetación y rocas y los 5 HDRI. Son 26 recursos y
60,7 MB, todos CC0.

## Catálogo generado

<!-- asset-catalog:start -->
> Generado automáticamente por `asset-pipeline` 0.1.0 el 2026-11-14. No editar a mano: ejecuta `make assets`.

**Resumen:** 42 disponibles · 4 faltantes · 0 con errores · 136.9 MB procesados.

| ID | Nombre | Categoría | Autor(es) | Fuente | Licencia | Formato | Tamaño | Estado | Ubicación local |
|---|---|---|---|---|---|---|---|---|---|
| `farm_soil` | Tierra agrícola | Terreno | Amal Kumar | [Poly Haven · farm_soil](https://polyhaven.com/a/farm_soil) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 6.36 MB | ✅ Disponible | `asset-library/materials/farm_soil/` |
| `farm_furrows` | Tierra labrada en surcos | Terreno | Amal Kumar | [Poly Haven · farm_furrows](https://polyhaven.com/a/farm_furrows) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 4.86 MB | ✅ Disponible | `asset-library/materials/farm_furrows/` |
| `muddy_tracks` | Barro con huellas | Terreno | Amal Kumar | [Poly Haven · muddy_tracks](https://polyhaven.com/a/muddy_tracks) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 5.99 MB | ✅ Disponible | `asset-library/materials/muddy_tracks/` |
| `brown_mud_03` | Suelo húmedo | Terreno | Rob Tuytel | [Poly Haven · brown_mud_03](https://polyhaven.com/a/brown_mud_03) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 5.42 MB | ✅ Disponible | `asset-library/materials/brown_mud_03/` |
| `acg_ground036` | Suelo húmedo oscuro | Terreno | No publicado por la fuente | [ambientCG · Ground036](https://ambientcg.com/a/Ground036) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 8.79 MB | ✅ Disponible | `asset-library/materials/acg_ground036/` |
| `dry_ground_rocks` | Suelo seco pedregoso | Terreno | Rob Tuytel | [Poly Haven · dry_ground_rocks](https://polyhaven.com/a/dry_ground_rocks) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 7.48 MB | ✅ Disponible | `asset-library/materials/dry_ground_rocks/` |
| `mud_cracked_dry_03` | Suelo seco agrietado | Terreno | Dario Barresi (Processing), Dimitrios Savva (Photography) | [Poly Haven · mud_cracked_dry_03](https://polyhaven.com/a/mud_cracked_dry_03) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 5.78 MB | ✅ Disponible | `asset-library/materials/mud_cracked_dry_03/` |
| `rocky_trail` | Terreno pedregoso | Terreno | Amal Kumar | [Poly Haven · rocky_trail](https://polyhaven.com/a/rocky_trail) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 7.06 MB | ✅ Disponible | `asset-library/materials/rocky_trail/` |
| `dry_mud_field_001` | Camino rural de tierra | Terreno | Rob Tuytel (Photography), Rico Cilliers (Processing) | [Poly Haven · dry_mud_field_001](https://polyhaven.com/a/dry_mud_field_001) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 6.79 MB | ✅ Disponible | `asset-library/materials/dry_mud_field_001/` |
| `grass_path_2` | Sendero rural con pasto | Terreno | Rob Tuytel | [Poly Haven · grass_path_2](https://polyhaven.com/a/grass_path_2) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 4.75 MB | ✅ Disponible | `asset-library/materials/grass_path_2/` |
| `asphalt_01` | Asfalto gastado | Terreno | Dario Barresi (Processing ), Charlotte Baglioni (Photography) | [Poly Haven · asphalt_01](https://polyhaven.com/a/asphalt_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 6.09 MB | ✅ Disponible | `asset-library/materials/asphalt_01/` |
| `sparse_grass` | Pasto ralo | Terreno | Amal Kumar | [Poly Haven · sparse_grass](https://polyhaven.com/a/sparse_grass) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WEBP | 7.34 MB | ✅ Disponible | `asset-library/materials/sparse_grass/` |
| `grass_medium_01` | Mata de pasto mediano | Vegetación | Rob Tuytel (Photography), Rico Cilliers (Modeling) | [Poly Haven · grass_medium_01](https://polyhaven.com/a/grass_medium_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 1.27 MB | ✅ Disponible | `asset-library/models/grass_medium_01/` |
| `grass_bermuda_01` | Pasto bermuda | Vegetación | Rico Cilliers | [Poly Haven · grass_bermuda_01](https://polyhaven.com/a/grass_bermuda_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 536.1 KB | ✅ Disponible | `asset-library/models/grass_bermuda_01/` |
| `shrub_02` | Arbusto pequeño | Vegetación | Rico Cilliers | [Poly Haven · shrub_02](https://polyhaven.com/a/shrub_02) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 737.5 KB | ✅ Disponible | `asset-library/models/shrub_02/` |
| `shrub_04` | Arbusto de hoja ancha | Vegetación | Rico Cilliers | [Poly Haven · shrub_04](https://polyhaven.com/a/shrub_04) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 686.6 KB | ✅ Disponible | `asset-library/models/shrub_04/` |
| `tree_small_02` | Árbol de hoja ancha | Vegetación | Rico Cilliers | [Poly Haven · tree_small_02](https://polyhaven.com/a/tree_small_02) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 5.51 MB | ✅ Disponible | `asset-library/models/tree_small_02/` |
| `island_tree_01` | Árbol de copa irregular | Vegetación | Rob Tuytel (scanning, processing), Rico Cilliers (cleanup, processing) | [Poly Haven · island_tree_01](https://polyhaven.com/a/island_tree_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 6.60 MB | ✅ Disponible | `asset-library/models/island_tree_01/` |
| `weed_plant_02` | Maleza herbácea | Vegetación | Rob Tuytel (Photography), Rico Cilliers (Modeling) | [Poly Haven · weed_plant_02](https://polyhaven.com/a/weed_plant_02) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 690.0 KB | ✅ Disponible | `asset-library/models/weed_plant_02/` |
| `nettle_plant` | Ortiga | Vegetación | Rob Tuytel (Photography), Rico Cilliers (modeling) | [Poly Haven · nettle_plant](https://polyhaven.com/a/nettle_plant) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 956.2 KB | ✅ Disponible | `asset-library/models/nettle_plant/` |
| `dandelion_01` | Diente de león | Vegetación | Rob Tuytel (Photography), Rico Cilliers (Modeling) | [Poly Haven · dandelion_01](https://polyhaven.com/a/dandelion_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 941.4 KB | ✅ Disponible | `asset-library/models/dandelion_01/` |
| `modular_chainlink_fence` | Cerca de malla metálica | Entorno | James Ray Cock, Amal Kumar (Fence Wire Material) | [Poly Haven · modular_chainlink_fence](https://polyhaven.com/a/modular_chainlink_fence) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 2.16 MB | ✅ Disponible | `asset-library/models/modular_chainlink_fence/` |
| `garden_sprinkler_01` | Aspersor | Entorno | Amal Kumar | [Poly Haven · garden_sprinkler_01](https://polyhaven.com/a/garden_sprinkler_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 996.0 KB | ✅ Disponible | `asset-library/models/garden_sprinkler_01/` |
| `garden_hose_wall_mounted_01` | Manguera enrollada | Entorno | Kuutti Siitonen | [Poly Haven · garden_hose_wall_mounted_01](https://polyhaven.com/a/garden_hose_wall_mounted_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 851.3 KB | ✅ Disponible | `asset-library/models/garden_hose_wall_mounted_01/` |
| `watering_can_metal_01` | Regadera metálica | Entorno | Charles Nderitu | [Poly Haven · watering_can_metal_01](https://polyhaven.com/a/watering_can_metal_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 895.4 KB | ✅ Disponible | `asset-library/models/watering_can_metal_01/` |
| `modular_pipes_plastic_01` | Tuberías y válvulas de PVC | Entorno | Amal Kumar | [Poly Haven · modular_pipes_plastic_01](https://polyhaven.com/a/modular_pipes_plastic_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 1.21 MB | ✅ Disponible | `asset-library/models/modular_pipes_plastic_01/` |
| `wooden_bucket_01` | Balde de madera | Entorno | James Ray Cock | [Poly Haven · wooden_bucket_01](https://polyhaven.com/a/wooden_bucket_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 674.7 KB | ✅ Disponible | `asset-library/models/wooden_bucket_01/` |
| `rusted_spade_01` | Pala oxidada | Entorno | Blemonade | [Poly Haven · rusted_spade_01](https://polyhaven.com/a/rusted_spade_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 781.0 KB | ✅ Disponible | `asset-library/models/rusted_spade_01/` |
| `trowel_01` | Desplantador | Entorno | Satyaki Mandal | [Poly Haven · trowel_01](https://polyhaven.com/a/trowel_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 594.9 KB | ✅ Disponible | `asset-library/models/trowel_01/` |
| `wooden_crate_01` | Cajón de madera | Entorno | James Ray Cock | [Poly Haven · wooden_crate_01](https://polyhaven.com/a/wooden_crate_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 661.7 KB | ✅ Disponible | `asset-library/models/wooden_crate_01/` |
| `wicker_basket_01` | Canasto de mimbre | Entorno | Kuutti Siitonen | [Poly Haven · wicker_basket_01](https://polyhaven.com/a/wicker_basket_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 924.3 KB | ✅ Disponible | `asset-library/models/wicker_basket_01/` |
| `compost_bags` | Bolsas de compost | Entorno | James Ray Cock | [Poly Haven · compost_bags](https://polyhaven.com/a/compost_bags) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 819.2 KB | ✅ Disponible | `asset-library/models/compost_bags/` |
| `seeding_tray_01` | Bandeja de almácigos | Entorno | Satyaki Mandal | [Poly Haven · seeding_tray_01](https://polyhaven.com/a/seeding_tray_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 607.5 KB | ✅ Disponible | `asset-library/models/seeding_tray_01/` |
| `rock_moss_set_01` | Rocas con musgo | Entorno | Kless Gyzen | [Poly Haven · rock_moss_set_01](https://polyhaven.com/a/rock_moss_set_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 957.0 KB | ✅ Disponible | `asset-library/models/rock_moss_set_01/` |
| `boulder_01` | Roca grande con líquenes | Entorno | Rico Cilliers | [Poly Haven · boulder_01](https://polyhaven.com/a/boulder_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 1.75 MB | ✅ Disponible | `asset-library/models/boulder_01/` |
| `tree_stump_01` | Tocón | Entorno | Rob Tuytel | [Poly Haven · tree_stump_01](https://polyhaven.com/a/tree_stump_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 1.41 MB | ✅ Disponible | `asset-library/models/tree_stump_01/` |
| `dry_branches_medium_01` | Ramas secas | Entorno | Rico Cilliers | [Poly Haven · dry_branches_medium_01](https://polyhaven.com/a/dry_branches_medium_01) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | GLB | 1.21 MB | ✅ Disponible | `asset-library/models/dry_branches_medium_01/` |
| `farm_field_puresky` | Campo al mediodía, parcialmente nublado | Iluminación | Dimitrios Savva (Photography), Jarod Guest (Processing & Sky Edits) | [Poly Haven · farm_field_puresky](https://polyhaven.com/a/farm_field_puresky) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | HDR | 6.08 MB | ✅ Disponible | `asset-library/hdri/farm_field_puresky/` |
| `kloofendal_43d_clear_puresky` | Mediodía despejado | Iluminación | Greg Zaal | [Poly Haven · kloofendal_43d_clear_puresky](https://polyhaven.com/a/kloofendal_43d_clear_puresky) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | HDR | 5.54 MB | ✅ Disponible | `asset-library/hdri/kloofendal_43d_clear_puresky/` |
| `overcast_soil_puresky` | Cielo cubierto | Iluminación | Jarod Guest (Sky Edits), Sergej Majboroda (Original) | [Poly Haven · overcast_soil_puresky](https://polyhaven.com/a/overcast_soil_puresky) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | HDR | 5.50 MB | ✅ Disponible | `asset-library/hdri/overcast_soil_puresky/` |
| `kloofendal_misty_morning_puresky` | Mañana con neblina | Iluminación | Greg Zaal | [Poly Haven · kloofendal_misty_morning_puresky](https://polyhaven.com/a/kloofendal_misty_morning_puresky) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | HDR | 3.49 MB | ✅ Disponible | `asset-library/hdri/kloofendal_misty_morning_puresky/` |
| `belfast_sunset_puresky` | Atardecer | Iluminación | Greg Zaal (Processing), Dimitrios Savva (Photography), Jarod Guest (Sky edits) | [Poly Haven · belfast_sunset_puresky](https://polyhaven.com/a/belfast_sunset_puresky) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | HDR | 5.49 MB | ✅ Disponible | `asset-library/hdri/belfast_sunset_puresky/` |

### Recursos faltantes y alternativas gratuitas

| ID | Recurso | Motivo | Alternativas |
|---|---|---|---|
| `crop_potato` | Planta de papa (Solanum tuberosum) | Poly Haven y ambientCG no publican cultivos. En Sketchfab el único modelo realista de la planta encontrado ("Potato Plants Collection") es CC BY-NC, incompatible con ADR-007, y los modelos CC0 de Solanum tuberosum son escaneos del tubérculo, no de la planta. | [CC0 Potato, Solanum tuberosum (escaneo de tubérculos)](https://sketchfab.com/3d-models/cc0-potato-solanum-tuberosum-56eec86c9102494f8ae568ea9c3cc338) — CC0 1.0; requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Modelado procedimental por estado fenológico (BBCH) con texturas de hoja CC0](https://ambientcg.com/list?category=LeafSet) — Resultado propio; texturas CC0; requiere: Fase de modelado de cultivos y referencias morfológicas documentadas |
| `crop_maize` | Planta de maíz (Zea mays) | Poly Haven y ambientCG no publican cultivos. Existen modelos CC-BY en Sketchfab, pero su descarga exige una cuenta y aceptar los términos del servicio, lo que requiere intervención del usuario. | [corn_plant (boyceojinta)](https://sketchfab.com/3d-models/corn-plant-773c4a1bd7fc44049b59c177aa162566) — CC BY 4.0 (atribución obligatoria); requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Maize Corn Plant (gilles.schaeck)](https://sketchfab.com/3d-models/maize-corn-plant-5fd3b104d8104519b061469c365d4974) — CC BY 4.0 (atribución obligatoria); requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Corn Field (highres) — rastrojo tras la cosecha](https://sketchfab.com/3d-models/corn-field-highres-e0c2c42ad62d4a459f714642d7094ef5) — CC BY 4.0 (atribución obligatoria); requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Modelado procedimental por estado fenológico (BBCH) con texturas de hoja CC0](https://ambientcg.com/list?category=LeafSet) — Resultado propio; texturas CC0; requiere: Fase de modelado de cultivos y referencias morfológicas documentadas |
| `crop_fava` | Planta de haba (Vicia faba) | No se encontró ningún modelo de Vicia faba con licencia compatible en Poly Haven, ambientCG ni en la búsqueda pública de Sketchfab ("Vicia faba", "faba bean", "broad bean plant", "fava bean plant"). Los resultados de Vicia sativa (veza) son otra especie y no se usan como sustituto. | [Modelado procedimental por estado fenológico (BBCH) con texturas de hoja CC0](https://ambientcg.com/list?category=LeafSet) — Resultado propio; texturas CC0; requiere: Fase de modelado de cultivos y referencias morfológicas documentadas |
| `fence_wooden_rural` | Cerca rural de madera | Poly Haven solo ofrece una cerca de malla metálica (incluida). Las cercas de madera realistas encontradas son CC-BY en Sketchfab y su descarga requiere cuenta. | [Skigard fence (NoodlePoodle)](https://sketchfab.com/3d-models/skigard-fence-01ee59ebfbd343169d2d9bebc63818fe) — CC BY 4.0 (atribución obligatoria); requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Old Wooden Fence (123umar123)](https://sketchfab.com/3d-models/old-wooden-fence-9a4ea98230824e4bb94f03d18759248d) — CC BY 4.0 (atribución obligatoria); requiere: Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales<br>[Cerca generada a partir de texturas de madera CC0](https://polyhaven.com/textures/wood) — Resultado propio; texturas CC0; requiere: Fase de entorno |
<!-- asset-catalog:end -->
