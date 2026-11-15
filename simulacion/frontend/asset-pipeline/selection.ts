/**
 * Selección declarativa de assets: qué se descarga, de dónde y cómo se procesa.
 *
 * Cada recurso se eligió tras consultar las API públicas de Poly Haven y ambientCG y revisar sus
 * miniaturas (2026-11-14). Los recursos sin alternativa gratuita y compatible se declaran como
 * `missing` con las alternativas encontradas; nunca se sustituyen por primitivas.
 */
import type {
  AssetCategory,
  AssetGroup,
  AssetKind,
  MissingInfo,
} from '../src/assets/catalogSchema.ts';

export interface PolyHavenRef {
  readonly provider: 'polyhaven';
  readonly id: string;
}

export interface AmbientCgRef {
  readonly provider: 'ambientcg';
  readonly id: string;
}

interface SelectionBase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AssetCategory;
  readonly group: AssetGroup;
}

export interface ModelSelection extends SelectionBase {
  readonly acquisition: 'download';
  readonly kind: 'model';
  readonly source: PolyHavenRef;
  /** Resolución de texturas del glTF de origen. */
  readonly sourceResolution: '1k' | '2k';
  /** Máximo de triángulos del LOD0; si el origen lo supera se simplifica. */
  readonly lod0MaxTriangles: number;
  /** Fracción de triángulos del LOD0 que conserva cada nivel adicional. */
  readonly lodRatios: readonly number[];
  readonly maxTextureSize: number;
  /** Altura plausible en metros: detecta errores de unidades (cm, pulgadas), no es un dato científico. */
  readonly heightRangeM: readonly [number, number];
  /**
   * `author`: se conserva el origen del autor (escaneos de naturaleza: Y = 0 es el suelo y parte
   * del objeto queda enterrada a propósito). `base`: se apoya el punto más bajo en Y = 0 sin mover
   * X ni Z (objetos con el origen en su centro o en su anclaje).
   */
  readonly pivot: 'author' | 'base';
}

export interface MaterialSelection extends SelectionBase {
  readonly acquisition: 'download';
  readonly kind: 'material';
  readonly source: PolyHavenRef | AmbientCgRef;
  readonly resolutions: readonly number[];
}

export interface HdriSelection extends SelectionBase {
  readonly acquisition: 'download';
  readonly kind: 'hdri';
  readonly source: PolyHavenRef;
  readonly resolutions: readonly ('1k' | '2k')[];
}

export interface MissingSelection extends SelectionBase {
  readonly acquisition: 'missing';
  readonly kind: AssetKind;
  readonly missing: MissingInfo;
}

export type DownloadSelection = ModelSelection | MaterialSelection | HdriSelection;
export type AssetSelection = DownloadSelection | MissingSelection;

const ph = (id: string): PolyHavenRef => ({ provider: 'polyhaven', id });
const acg = (id: string): AmbientCgRef => ({ provider: 'ambientcg', id });

const DEFAULT_LOD_RATIOS = [0.3, 0.08] as const;

/** Objetos manufacturados: su origen no está en el suelo y se apoyan en Y = 0. */
const BASE_PIVOT_GROUPS: ReadonlySet<AssetGroup> = new Set(['farm-object', 'irrigation']);

/** Rangos de altura amplios por tipo de objeto, solo para detectar errores de escala. */
const HEIGHT_RANGE_M: Partial<Record<AssetGroup, readonly [number, number]>> = {
  grass: [0.02, 1.5],
  shrub: [0.1, 5],
  tree: [1.5, 40],
  weed: [0.02, 2],
  fence: [0.3, 4],
  irrigation: [0.02, 3],
  'farm-object': [0.02, 3],
  rock: [0.05, 15],
  'ground-debris': [0.02, 3],
};

function model(
  base: SelectionBase & { readonly source: PolyHavenRef },
  lod0MaxTriangles: number,
  options: { lodRatios?: readonly number[]; maxTextureSize?: number } = {},
): ModelSelection {
  return {
    ...base,
    acquisition: 'download',
    kind: 'model',
    sourceResolution: '1k',
    lod0MaxTriangles,
    lodRatios: options.lodRatios ?? DEFAULT_LOD_RATIOS,
    maxTextureSize: options.maxTextureSize ?? 1024,
    heightRangeM: HEIGHT_RANGE_M[base.group] ?? [0.01, 50],
    pivot: BASE_PIVOT_GROUPS.has(base.group) ? 'base' : 'author',
  };
}

function material(
  base: SelectionBase & { readonly source: PolyHavenRef | AmbientCgRef },
): MaterialSelection {
  return { ...base, acquisition: 'download', kind: 'material', resolutions: [2048, 1024] };
}

function hdri(base: SelectionBase & { readonly source: PolyHavenRef }): HdriSelection {
  return { ...base, acquisition: 'download', kind: 'hdri', resolutions: ['1k', '2k'] };
}

const SKETCHFAB_ACCOUNT =
  'Cuenta gratuita de Sketchfab (aceptar sus términos): la API de descarga responde 401 sin credenciales';
const SKETCHFAB_LICENSE_NOTE =
  'Licencia según la API pública de Sketchfab (consultada 2026-11-14); verificar de nuevo en la página al descargar.';
const PROCEDURAL_CROP_ALTERNATIVE = {
  title: 'Modelado procedimental por estado fenológico (BBCH) con texturas de hoja CC0',
  provider: 'Blender (GPL, gratuito) + atlas de hojas de ambientCG (CC0)',
  url: 'https://ambientcg.com/list?category=LeafSet',
  license: 'Resultado propio; texturas CC0',
  requires: 'Fase de modelado de cultivos y referencias morfológicas documentadas',
  notes:
    'Un modelo escaneado representa un único estado de crecimiento; el simulador necesita la planta en cada estadio BBCH, por lo que la generación procedimental es probablemente necesaria de todos modos.',
} as const;

export const ASSET_SELECTION: readonly AssetSelection[] = [
  // ── Terreno ────────────────────────────────────────────────────────────────────────────────
  material({
    id: 'farm_soil',
    name: 'Tierra agrícola',
    description: 'Suelo de cultivo arado, húmedo y con terrones. Escaneo fotogramétrico.',
    category: 'terrain',
    group: 'agricultural-soil',
    source: ph('farm_soil'),
  }),
  material({
    id: 'farm_furrows',
    name: 'Tierra labrada en surcos',
    description: 'Suelo arado con surcos marcados, ramitas y terrones compactados.',
    category: 'terrain',
    group: 'tilled-soil',
    source: ph('farm_furrows'),
  }),
  material({
    id: 'muddy_tracks',
    name: 'Barro con huellas',
    description: 'Superficie de barro húmedo con marcas de neumáticos.',
    category: 'terrain',
    group: 'mud',
    source: ph('muddy_tracks'),
  }),
  material({
    id: 'brown_mud_03',
    name: 'Suelo húmedo',
    description: 'Tierra con zonas húmedas, terrones y huellas.',
    category: 'terrain',
    group: 'wet-soil',
    source: ph('brown_mud_03'),
  }),
  material({
    id: 'acg_ground036',
    name: 'Suelo húmedo oscuro',
    description: 'Tierra oscura y húmeda (fotogrametría de campo de alturas).',
    category: 'terrain',
    group: 'wet-soil',
    source: acg('Ground036'),
  }),
  material({
    id: 'dry_ground_rocks',
    name: 'Suelo seco pedregoso',
    description: 'Suelo reseco y agrietado con piedras sueltas.',
    category: 'terrain',
    group: 'dry-soil',
    source: ph('dry_ground_rocks'),
  }),
  material({
    id: 'mud_cracked_dry_03',
    name: 'Suelo seco agrietado',
    description: 'Barro seco con grietas de retracción, útil para visualizar sequía.',
    category: 'terrain',
    group: 'dry-soil',
    source: ph('mud_cracked_dry_03'),
  }),
  material({
    id: 'rocky_trail',
    name: 'Terreno pedregoso',
    description: 'Suelo con abundantes piedras y grava.',
    category: 'terrain',
    group: 'stony-ground',
    source: ph('rocky_trail'),
  }),
  material({
    id: 'dry_mud_field_001',
    name: 'Camino rural de tierra',
    description: 'Camino de tierra seca e irregular de entorno agrícola.',
    category: 'terrain',
    group: 'rural-path',
    source: ph('dry_mud_field_001'),
  }),
  material({
    id: 'grass_path_2',
    name: 'Sendero rural con pasto',
    description: 'Sendero de tierra y piedras con pasto en los bordes.',
    category: 'terrain',
    group: 'rural-path',
    source: ph('grass_path_2'),
  }),
  material({
    id: 'asphalt_01',
    name: 'Asfalto gastado',
    description:
      'Asfalto rugoso y desgastado de carretera. Añadido en la fase 04 para los caminos que OSM marca como pavimentados.',
    category: 'terrain',
    group: 'paved-road',
    source: ph('asphalt_01'),
  }),
  material({
    id: 'sparse_grass',
    name: 'Pasto ralo',
    description: 'Suelo cubierto de pasto disperso con raíces visibles.',
    category: 'terrain',
    group: 'grass-ground',
    source: ph('sparse_grass'),
  }),

  // Biomas (fase 04): suelos propios de altiplano, selva, llanos, zonas secas, bosques templados
  // y nevados, elegidos tras revisar las miniaturas de Poly Haven (2026-11-14).
  material({
    id: 'withered_grass',
    name: 'Pasto seco',
    description: 'Pasto seco y ralo sobre suelo pardo; representa el pajonal del altiplano (ichu).',
    category: 'terrain',
    group: 'grass-ground',
    source: ph('withered_grass'),
  }),
  material({
    id: 'gravelly_sand',
    name: 'Arena con grava',
    description: 'Suelo arenoso con grava fina de zonas áridas y altas.',
    category: 'terrain',
    group: 'sand',
    source: ph('gravelly_sand'),
  }),
  material({
    id: 'rock_ground_02',
    name: 'Suelo rocoso',
    description: 'Suelo de roca fracturada y piedras de laderas altas.',
    category: 'terrain',
    group: 'stony-ground',
    source: ph('rock_ground_02'),
  }),
  material({
    id: 'red_laterite_soil_stones',
    name: 'Suelo laterítico rojo',
    description: 'Suelo rojo con piedras, típico de zonas tropicales.',
    category: 'terrain',
    group: 'agricultural-soil',
    source: ph('red_laterite_soil_stones'),
  }),
  material({
    id: 'red_dirt_mud_01',
    name: 'Barro rojo',
    description: 'Barro rojizo húmedo de caminos y orillas tropicales.',
    category: 'terrain',
    group: 'wet-soil',
    source: ph('red_dirt_mud_01'),
  }),
  material({
    id: 'mossy_rock',
    name: 'Roca con musgo',
    description: 'Roca cubierta de musgo de bosques húmedos.',
    category: 'terrain',
    group: 'stony-ground',
    source: ph('mossy_rock'),
  }),
  material({
    id: 'forest_leaves_02',
    name: 'Hojarasca de bosque',
    description: 'Suelo de bosque cubierto de hojas secas.',
    category: 'terrain',
    group: 'forest-floor',
    source: ph('forest_leaves_02'),
  }),
  material({
    id: 'forest_leaves_04',
    name: 'Suelo de bosque de coníferas',
    description: 'Suelo de bosque con acículas y hojas.',
    category: 'terrain',
    group: 'forest-floor',
    source: ph('forest_leaves_04'),
  }),
  material({
    id: 'cracked_red_ground',
    name: 'Suelo rojo agrietado',
    description: 'Suelo rojizo seco y agrietado de llanuras y zonas secas.',
    category: 'terrain',
    group: 'dry-soil',
    source: ph('cracked_red_ground'),
  }),
  material({
    id: 'grass_ground',
    name: 'Pastizal',
    description: 'Pasto denso con tierra visible de praderas y llanuras.',
    category: 'terrain',
    group: 'grass-ground',
    source: ph('grass_ground'),
  }),
  material({
    id: 'snow_02',
    name: 'Nieve',
    description: 'Nieve compacta de cumbres y glaciares.',
    category: 'terrain',
    group: 'snow',
    source: ph('snow_02'),
  }),

  // ── Vegetación ─────────────────────────────────────────────────────────────────────────────
  model(
    {
      id: 'grass_medium_01',
      name: 'Mata de pasto mediano',
      description: 'Mata de pasto denso para dispersión instanciada.',
      category: 'vegetation',
      group: 'grass',
      source: ph('grass_medium_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'grass_bermuda_01',
      name: 'Pasto bermuda',
      description: 'Mata de pasto bermuda de hoja fina.',
      category: 'vegetation',
      group: 'grass',
      source: ph('grass_bermuda_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'shrub_02',
      name: 'Arbusto pequeño',
      description: 'Arbustos de tallo leñoso y hojas pequeñas.',
      category: 'vegetation',
      group: 'shrub',
      source: ph('shrub_02'),
    },
    30_000,
  ),
  model(
    {
      id: 'shrub_04',
      name: 'Arbusto de hoja ancha',
      description: 'Arbustos jóvenes de hoja ancha.',
      category: 'vegetation',
      group: 'shrub',
      source: ph('shrub_04'),
    },
    30_000,
  ),
  model(
    {
      id: 'tree_small_02',
      name: 'Árbol de hoja ancha',
      description: 'Árbol caducifolio pequeño de tronco curvo y copa densa.',
      category: 'vegetation',
      group: 'tree',
      source: ph('tree_small_02'),
    },
    150_000,
  ),
  model(
    {
      id: 'island_tree_01',
      name: 'Árbol de copa irregular',
      description: 'Árbol de tronco retorcido y copa abierta.',
      category: 'vegetation',
      group: 'tree',
      source: ph('island_tree_01'),
    },
    150_000,
  ),
  model(
    {
      id: 'weed_plant_02',
      name: 'Maleza herbácea',
      description: 'Planta herbácea espontánea de hoja ancha.',
      category: 'vegetation',
      group: 'weed',
      source: ph('weed_plant_02'),
    },
    20_000,
  ),
  model(
    {
      id: 'nettle_plant',
      name: 'Ortiga',
      description: 'Plantas de ortiga en distintos tamaños.',
      category: 'vegetation',
      group: 'weed',
      source: ph('nettle_plant'),
    },
    30_000,
  ),
  model(
    {
      id: 'dandelion_01',
      name: 'Diente de león',
      description: 'Rosetas de diente de león con flores.',
      category: 'vegetation',
      group: 'weed',
      source: ph('dandelion_01'),
    },
    30_000,
  ),

  // Biomas (fase 04): vegetación propia de selva, llanos, valles, zonas secas y altas, y bosques
  // de coníferas. Son especies representativas: el catálogo CC0 no tiene especies nativas exactas.
  ...(
    [
      ['jacaranda_tree', 'Jacarandá', 'Árbol de copa amplia (Jacaranda), común en valles y llanuras de Sudamérica.', 'tree', 150_000],
      ['island_tree_02', 'Árbol tropical de copa alta', 'Árbol de hoja ancha de tronco alto.', 'tree', 150_000],
      ['island_tree_03', 'Árbol tropical de copa extendida', 'Árbol de hoja ancha de copa extendida.', 'tree', 150_000],
      ['pachira_aquatica_01', 'Pachira', 'Pachira aquatica, árbol de zonas húmedas de Centro y Sudamérica.', 'tree', 80_000],
      ['pine_tree_01', 'Pino', 'Conífera de bosques templados y plantaciones.', 'tree', 150_000],
      ['fern_02', 'Helecho', 'Helecho de sotobosque húmedo.', 'shrub', 40_000],
      ['calathea_orbifolia_01', 'Calathea', 'Calathea orbifolia, planta de sotobosque tropical nativa de Bolivia.', 'shrub', 40_000],
      ['anthurium_botany_01', 'Anturio', 'Planta de sotobosque tropical de hoja grande.', 'shrub', 40_000],
      ['shrub_01', 'Arbusto con flores', 'Arbusto de hoja pequeña con flores.', 'shrub', 30_000],
      ['shrub_03', 'Arbusto de pradera', 'Arbusto bajo de praderas.', 'shrub', 30_000],
      ['wild_rooibos_bush', 'Arbusto seco', 'Arbusto leñoso de zonas secas; representa la tola del altiplano.', 'shrub', 30_000],
      ['searsia_lucida', 'Arbusto de matorral seco', 'Arbusto denso de matorral seco.', 'shrub', 30_000],
      ['searsia_burchellii', 'Arbusto grande de zona seca', 'Arbusto grande de matorral seco.', 'shrub', 40_000],
      ['didelta_spinosa', 'Arbusto espinoso', 'Arbusto bajo de hojas carnosas de zonas áridas.', 'shrub', 30_000],
      ['grass_medium_02', 'Pasto alto', 'Mata de pasto alto de praderas y llanuras.', 'grass', 20_000],
      ['namaqualand_boulder_03', 'Bloque de roca árida', 'Roca de zona árida.', 'rock', 40_000],
      ['namaqualand_stones_01', 'Piedras de zona árida', 'Conjunto de piedras de suelos áridos.', 'rock', 40_000],
      ['dead_tree_trunk_02', 'Tronco caído', 'Tronco seco caído en el suelo del bosque.', 'ground-debris', 30_000],
    ] as const
  ).map(([id, name, description, group, triangles]) =>
    model(
      {
        id,
        name,
        description,
        category: group === 'rock' || group === 'ground-debris' ? 'environment' : 'vegetation',
        group,
        source: ph(id),
      },
      triangles,
    ),
  ),

  // ── Cultivos (sin recursos compatibles disponibles) ────────────────────────────────────────
  {
    id: 'crop_potato',
    name: 'Planta de papa (Solanum tuberosum)',
    description: 'Planta completa de papa para los estados fenológicos del cultivo.',
    acquisition: 'missing',
    kind: 'model',
    category: 'crop',
    group: 'potato',
    missing: {
      reason:
        'Poly Haven y ambientCG no publican cultivos. En Sketchfab el único modelo realista de la planta encontrado ("Potato Plants Collection") es CC BY-NC, incompatible con ADR-007, y los modelos CC0 de Solanum tuberosum son escaneos del tubérculo, no de la planta.',
      alternatives: [
        {
          title: 'CC0 Potato, Solanum tuberosum (escaneo de tubérculos)',
          provider: 'Sketchfab · ffish.asia / floraZia.com',
          url: 'https://sketchfab.com/3d-models/cc0-potato-solanum-tuberosum-56eec86c9102494f8ae568ea9c3cc338',
          license: 'CC0 1.0',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Sirve para representar la cosecha, no la planta. 2,9 M de caras: requiere simplificación. ${SKETCHFAB_LICENSE_NOTE}`,
        },
        PROCEDURAL_CROP_ALTERNATIVE,
      ],
    },
  },
  {
    id: 'crop_maize',
    name: 'Planta de maíz (Zea mays)',
    description: 'Planta completa de maíz para los estados fenológicos del cultivo.',
    acquisition: 'missing',
    kind: 'model',
    category: 'crop',
    group: 'maize',
    missing: {
      reason:
        'Poly Haven y ambientCG no publican cultivos. Existen modelos CC-BY en Sketchfab, pero su descarga exige una cuenta y aceptar los términos del servicio, lo que requiere intervención del usuario.',
      alternatives: [
        {
          title: 'corn_plant (boyceojinta)',
          provider: 'Sketchfab',
          url: 'https://sketchfab.com/3d-models/corn-plant-773c4a1bd7fc44049b59c177aa162566',
          license: 'CC BY 4.0 (atribución obligatoria)',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Planta joven de aspecto realista, 314 k caras. ${SKETCHFAB_LICENSE_NOTE}`,
        },
        {
          title: 'Maize Corn Plant (gilles.schaeck)',
          provider: 'Sketchfab',
          url: 'https://sketchfab.com/3d-models/maize-corn-plant-5fd3b104d8104519b061469c365d4974',
          license: 'CC BY 4.0 (atribución obligatoria)',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Planta adulta de baja poligonización (3,1 k caras). ${SKETCHFAB_LICENSE_NOTE}`,
        },
        {
          title: 'Corn Field (highres) — rastrojo tras la cosecha',
          provider: 'Sketchfab · nedo',
          url: 'https://sketchfab.com/3d-models/corn-field-highres-e0c2c42ad62d4a459f714642d7094ef5',
          license: 'CC BY 4.0 (atribución obligatoria)',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Escaneo de un campo cosechado (997 k caras); útil para el estado posterior a la cosecha. ${SKETCHFAB_LICENSE_NOTE}`,
        },
        PROCEDURAL_CROP_ALTERNATIVE,
      ],
    },
  },
  {
    id: 'crop_fava',
    name: 'Planta de haba (Vicia faba)',
    description: 'Planta completa de haba para los estados fenológicos del cultivo.',
    acquisition: 'missing',
    kind: 'model',
    category: 'crop',
    group: 'fava-bean',
    missing: {
      reason:
        'No se encontró ningún modelo de Vicia faba con licencia compatible en Poly Haven, ambientCG ni en la búsqueda pública de Sketchfab ("Vicia faba", "faba bean", "broad bean plant", "fava bean plant"). Los resultados de Vicia sativa (veza) son otra especie y no se usan como sustituto.',
      alternatives: [PROCEDURAL_CROP_ALTERNATIVE],
    },
  },

  // ── Entorno ────────────────────────────────────────────────────────────────────────────────
  model(
    {
      id: 'modular_chainlink_fence',
      name: 'Cerca de malla metálica',
      description: 'Cerca modular de malla de alambre con postes metálicos.',
      category: 'environment',
      group: 'fence',
      source: ph('modular_chainlink_fence'),
    },
    60_000,
  ),
  {
    id: 'fence_wooden_rural',
    name: 'Cerca rural de madera',
    description: 'Cerca de postes de madera con travesaños o alambre.',
    acquisition: 'missing',
    kind: 'model',
    category: 'environment',
    group: 'fence',
    missing: {
      reason:
        'Poly Haven solo ofrece una cerca de malla metálica (incluida). Las cercas de madera realistas encontradas son CC-BY en Sketchfab y su descarga requiere cuenta.',
      alternatives: [
        {
          title: 'Skigard fence (NoodlePoodle)',
          provider: 'Sketchfab',
          url: 'https://sketchfab.com/3d-models/skigard-fence-01ee59ebfbd343169d2d9bebc63818fe',
          license: 'CC BY 4.0 (atribución obligatoria)',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Cerca tradicional de troncos inclinados, 16 k caras. ${SKETCHFAB_LICENSE_NOTE}`,
        },
        {
          title: 'Old Wooden Fence (123umar123)',
          provider: 'Sketchfab',
          url: 'https://sketchfab.com/3d-models/old-wooden-fence-9a4ea98230824e4bb94f03d18759248d',
          license: 'CC BY 4.0 (atribución obligatoria)',
          requires: SKETCHFAB_ACCOUNT,
          notes: `Piezas de cerca envejecida, 2,7 k caras. ${SKETCHFAB_LICENSE_NOTE}`,
        },
        {
          title: 'Cerca generada a partir de texturas de madera CC0',
          provider: 'Poly Haven (texturas CC0) + geometría propia',
          url: 'https://polyhaven.com/textures/wood',
          license: 'Resultado propio; texturas CC0',
          requires: 'Fase de entorno',
          notes:
            'Una cerca de postes es geometría simple; con texturas PBR escaneadas puede ser realista sin depender de terceros.',
        },
      ],
    },
  },
  model(
    {
      id: 'garden_sprinkler_01',
      name: 'Aspersor',
      description: 'Aspersor de riego oscilante sobre ruedas.',
      category: 'environment',
      group: 'irrigation',
      source: ph('garden_sprinkler_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'garden_hose_wall_mounted_01',
      name: 'Manguera enrollada',
      description: 'Manguera de riego enrollada en un soporte de pared.',
      category: 'environment',
      group: 'irrigation',
      source: ph('garden_hose_wall_mounted_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'watering_can_metal_01',
      name: 'Regadera metálica',
      description: 'Regadera de chapa galvanizada.',
      category: 'environment',
      group: 'irrigation',
      source: ph('watering_can_metal_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'modular_pipes_plastic_01',
      name: 'Tuberías y válvulas de PVC',
      description: 'Tramos, codos y válvulas de tubería plástica para riego.',
      category: 'environment',
      group: 'irrigation',
      source: ph('modular_pipes_plastic_01'),
    },
    50_000,
  ),
  model(
    {
      id: 'wooden_bucket_01',
      name: 'Balde de madera',
      description: 'Balde de duelas de madera con aros metálicos.',
      category: 'environment',
      group: 'farm-object',
      source: ph('wooden_bucket_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'rusted_spade_01',
      name: 'Pala oxidada',
      description: 'Pala de punta con mango de madera.',
      category: 'environment',
      group: 'farm-object',
      source: ph('rusted_spade_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'trowel_01',
      name: 'Desplantador',
      description: 'Pala de mano para trasplante.',
      category: 'environment',
      group: 'farm-object',
      source: ph('trowel_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'wooden_crate_01',
      name: 'Cajón de madera',
      description: 'Cajón de madera con tapa.',
      category: 'environment',
      group: 'farm-object',
      source: ph('wooden_crate_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'wicker_basket_01',
      name: 'Canasto de mimbre',
      description: 'Canasto tejido para la cosecha.',
      category: 'environment',
      group: 'farm-object',
      source: ph('wicker_basket_01'),
    },
    30_000,
  ),
  model(
    {
      id: 'compost_bags',
      name: 'Bolsas de compost',
      description: 'Sacos de compost y sustrato apilados.',
      category: 'environment',
      group: 'farm-object',
      source: ph('compost_bags'),
    },
    20_000,
  ),
  model(
    {
      id: 'seeding_tray_01',
      name: 'Bandeja de almácigos',
      description: 'Bandeja plástica de alvéolos para semilleros.',
      category: 'environment',
      group: 'farm-object',
      source: ph('seeding_tray_01'),
    },
    20_000,
  ),
  model(
    {
      id: 'rock_moss_set_01',
      name: 'Rocas con musgo',
      description: 'Conjunto de rocas medianas cubiertas de musgo.',
      category: 'environment',
      group: 'rock',
      source: ph('rock_moss_set_01'),
    },
    40_000,
  ),
  model(
    {
      id: 'boulder_01',
      name: 'Roca grande con líquenes',
      description: 'Bloque de roca meteorizada.',
      category: 'environment',
      group: 'rock',
      source: ph('boulder_01'),
    },
    40_000,
  ),
  model(
    {
      id: 'tree_stump_01',
      name: 'Tocón',
      description: 'Tocón de árbol cortado con musgo.',
      category: 'environment',
      group: 'ground-debris',
      source: ph('tree_stump_01'),
    },
    30_000,
  ),
  model(
    {
      id: 'dry_branches_medium_01',
      name: 'Ramas secas',
      description: 'Ramas caídas para dispersar sobre el terreno.',
      category: 'environment',
      group: 'ground-debris',
      source: ph('dry_branches_medium_01'),
    },
    20_000,
  ),

  // Edificaciones (fase 04): muros y techos para extruir las huellas de OSM.
  material({
    id: 'brick_wall_001',
    name: 'Muro de ladrillo',
    description: 'Muro de ladrillo visto.',
    category: 'environment',
    group: 'building-wall',
    source: ph('brick_wall_001'),
  }),
  material({
    id: 'beige_wall_001',
    name: 'Muro revocado',
    description: 'Muro con revoque claro.',
    category: 'environment',
    group: 'building-wall',
    source: ph('beige_wall_001'),
  }),
  material({
    id: 'corrugated_iron',
    name: 'Calamina',
    description: 'Chapa ondulada de techos.',
    category: 'environment',
    group: 'building-roof',
    source: ph('corrugated_iron'),
  }),
  material({
    id: 'clay_roof_tiles_02',
    name: 'Teja de arcilla',
    description: 'Tejado de teja de arcilla.',
    category: 'environment',
    group: 'building-roof',
    source: ph('clay_roof_tiles_02'),
  }),
  material({
    id: 'rough_concrete',
    name: 'Hormigón rugoso',
    description: 'Losa de hormigón para azoteas y techos planos.',
    category: 'environment',
    group: 'building-roof',
    source: ph('rough_concrete'),
  }),

  // ── Iluminación ────────────────────────────────────────────────────────────────────────────
  hdri({
    id: 'farm_field_puresky',
    name: 'Campo al mediodía, parcialmente nublado',
    description: 'Cielo sin suelo capturado sobre un campo agrícola; luz difusa de mediodía.',
    category: 'lighting',
    group: 'sky',
    source: ph('farm_field_puresky'),
  }),
  hdri({
    id: 'kloofendal_43d_clear_puresky',
    name: 'Mediodía despejado',
    description: 'Cielo despejado con el sol a unos 43° de elevación según su nombre de origen.',
    category: 'lighting',
    group: 'sky',
    source: ph('kloofendal_43d_clear_puresky'),
  }),
  hdri({
    id: 'overcast_soil_puresky',
    name: 'Cielo cubierto',
    description: 'Nubosidad total con luz suave y sin sombras marcadas.',
    category: 'lighting',
    group: 'sky',
    source: ph('overcast_soil_puresky'),
  }),
  hdri({
    id: 'kloofendal_misty_morning_puresky',
    name: 'Mañana con neblina',
    description: 'Mañana nublada y brumosa.',
    category: 'lighting',
    group: 'sky',
    source: ph('kloofendal_misty_morning_puresky'),
  }),
  hdri({
    id: 'belfast_sunset_puresky',
    name: 'Atardecer',
    description: 'Puesta de sol con nubes dispersas.',
    category: 'lighting',
    group: 'sky',
    source: ph('belfast_sunset_puresky'),
  }),
];
