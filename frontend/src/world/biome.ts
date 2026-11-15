/**
 * Bioma estimado de la región: decide qué suelos (materiales del terreno) y qué vegetación
 * (modelos del catálogo) representan la zona.
 *
 * Es una **clasificación heurística** a partir de datos reales: altitud del terreno (NASADEM),
 * latitud y proporciones de cobertura del suelo (ESA WorldCover) del contexto de ±15 km. Sigue
 * las grandes regiones fisiográficas (selva amazónica, llanos, valles interandinos, altiplano y
 * puna, chaco y zonas áridas, bosques templados y boreales), no un mapa oficial de ecorregiones.
 * La interfaz muestra el bioma elegido y los valores que lo justifican.
 */
import type { BuildingStyle } from './buildings.ts';
import type { GeoBBox } from './extent.ts';
import type { GeoGrid } from './grid.ts';
import { LAND_COVER } from './landcover.ts';

export type BiomeId =
  | 'tropical-forest'
  | 'savanna'
  | 'valley'
  | 'highland'
  | 'arid'
  | 'temperate'
  | 'boreal';

/** Roles de las capas del terreno (el orden de las texturas de array). */
export const TERRAIN_ROLES = [
  'soil',
  'tilled',
  'path',
  'dryGround',
  'naturalGround',
  'rock',
  'wet',
  'asphalt',
  'forestFloor',
  'snow',
] as const;
export type TerrainRole = (typeof TERRAIN_ROLES)[number];

export interface CoverShares {
  readonly tree: number;
  readonly shrub: number;
  readonly grass: number;
  readonly crop: number;
  readonly built: number;
  readonly bare: number;
  readonly water: number;
  readonly snow: number;
  readonly wetland: number;
}

export interface BiomeEvidence {
  readonly latitudeDeg: number;
  readonly elevationM: number;
  readonly shares: CoverShares;
}

export interface VegetationRule {
  /** Identificadores de modelos del catálogo (todas sus variantes) por especie. */
  readonly tree: readonly string[];
  readonly shrub: readonly string[];
  readonly rock: readonly string[];
  readonly debris: readonly string[];
  readonly grass: readonly string[];
  readonly weed: readonly string[];
  /** Altura objetivo de los árboles (m): los modelos se escalan a ella. */
  readonly treeHeightM: readonly [number, number];
  /** Árboles en zonas de cobertura arbórea: separación media (m) y probabilidad. */
  readonly forestSpacingM: number;
  readonly forestProbability: number;
  /** Probabilidad de árboles aislados en pastizal y matorral. */
  readonly openTreeProbability: number;
  /** Tinte del pasto y la maleza (multiplica el color base): pajonal seco frente a pasto verde. */
  readonly grassTint: readonly [number, number, number];
}

export interface BiomeProfile {
  readonly id: BiomeId;
  readonly label: string;
  readonly description: string;
  /** Material del catálogo de cada rol del terreno (mismo orden que `TERRAIN_ROLES`). */
  readonly layers: Readonly<Record<TerrainRole, string>>;
  readonly vegetation: VegetationRule;
  /** Proporciones (heurísticas) de materiales y tejados de las edificaciones. */
  readonly buildings: BuildingStyle;
}

const COMMON_LAYERS = {
  tilled: 'farm_furrows',
  asphalt: 'asphalt_01',
  snow: 'snow_02',
} as const;

export const BIOMES: Readonly<Record<BiomeId, BiomeProfile>> = {
  'tropical-forest': {
    id: 'tropical-forest',
    label: 'Selva tropical',
    description: 'Bosque húmedo de tierras bajas o de yungas: dosel cerrado, sotobosque y suelos rojos.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'red_laterite_soil_stones',
      path: 'red_dirt_mud_01',
      dryGround: 'cracked_red_ground',
      naturalGround: 'grass_ground',
      rock: 'mossy_rock',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_02',
    },
    buildings: { brickShare: 0.35, pitchedShare: 0.7, metalRoofShare: 0.65 },
    vegetation: {
      tree: ['island_tree_02', 'island_tree_03', 'island_tree_01', 'pachira_aquatica_01'],
      shrub: ['fern_02', 'calathea_orbifolia_01', 'anthurium_botany_01', 'shrub_04'],
      rock: ['rock_moss_set_01'],
      debris: ['dead_tree_trunk_02', 'tree_stump_01'],
      grass: ['grass_medium_02', 'grass_medium_01'],
      weed: ['fern_02', 'nettle_plant'],
      treeHeightM: [16, 30],
      forestSpacingM: 13,
      forestProbability: 0.9,
      openTreeProbability: 0.04,
      grassTint: [0.9, 1.05, 0.85],
    },
  },
  savanna: {
    id: 'savanna',
    label: 'Llanos y sabanas',
    description: 'Llanuras de pastizal con árboles aislados, islas de bosque y suelos rojizos.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'red_laterite_soil_stones',
      path: 'red_dirt_mud_01',
      dryGround: 'cracked_red_ground',
      naturalGround: 'grass_ground',
      rock: 'rocky_trail',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_02',
    },
    buildings: { brickShare: 0.35, pitchedShare: 0.7, metalRoofShare: 0.55 },
    vegetation: {
      tree: ['island_tree_03', 'jacaranda_tree', 'tree_small_02', 'pachira_aquatica_01'],
      shrub: ['shrub_01', 'shrub_03', 'shrub_04'],
      rock: ['boulder_01'],
      debris: ['tree_stump_01', 'dry_branches_medium_01'],
      grass: ['grass_medium_02', 'grass_medium_01'],
      weed: ['dandelion_01', 'weed_plant_02'],
      treeHeightM: [8, 16],
      forestSpacingM: 12,
      forestProbability: 0.8,
      openTreeProbability: 0.025,
      grassTint: [1.05, 1.02, 0.8],
    },
  },
  valley: {
    id: 'valley',
    label: 'Valle interandino',
    description: 'Valles templados de montaña con cultivos, árboles dispersos y matorral en las laderas.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'farm_soil',
      path: 'dry_mud_field_001',
      dryGround: 'dry_ground_rocks',
      naturalGround: 'sparse_grass',
      rock: 'rocky_trail',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_02',
    },
    buildings: { brickShare: 0.6, pitchedShare: 0.55, metalRoofShare: 0.35 },
    vegetation: {
      tree: ['tree_small_02', 'jacaranda_tree', 'island_tree_01'],
      shrub: ['shrub_02', 'shrub_04', 'searsia_lucida'],
      rock: ['boulder_01', 'rock_moss_set_01'],
      debris: ['tree_stump_01', 'dry_branches_medium_01'],
      grass: ['grass_bermuda_01', 'grass_medium_01'],
      weed: ['weed_plant_02', 'nettle_plant', 'dandelion_01'],
      treeHeightM: [6, 12],
      forestSpacingM: 9,
      forestProbability: 0.6,
      openTreeProbability: 0.008,
      grassTint: [1.05, 1, 0.85],
    },
  },
  highland: {
    id: 'highland',
    label: 'Altiplano y puna',
    description:
      'Altiplanicie y montaña sobre ~3 300 m: pajonal de ichu, tolares, suelos pedregosos y nieve en las cumbres; árboles solo plantados junto a poblados.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'farm_soil',
      path: 'dry_mud_field_001',
      dryGround: 'gravelly_sand',
      naturalGround: 'withered_grass',
      rock: 'rock_ground_02',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_04',
    },
    buildings: { brickShare: 0.65, pitchedShare: 0.7, metalRoofShare: 0.8 },
    vegetation: {
      tree: ['pine_tree_01', 'tree_small_02'],
      shrub: ['wild_rooibos_bush', 'searsia_lucida', 'didelta_spinosa'],
      rock: ['namaqualand_boulder_03', 'namaqualand_stones_01', 'boulder_01'],
      debris: ['dry_branches_medium_01'],
      grass: ['grass_bermuda_01', 'grass_medium_02'],
      weed: ['weed_plant_02'],
      treeHeightM: [7, 14],
      forestSpacingM: 8,
      forestProbability: 0.6,
      openTreeProbability: 0,
      grassTint: [1.25, 1.05, 0.55],
    },
  },
  arid: {
    id: 'arid',
    label: 'Zona árida y chaco',
    description: 'Matorral seco y espinoso, suelos desnudos agrietados y rocas.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'farm_soil',
      path: 'dry_mud_field_001',
      dryGround: 'cracked_red_ground',
      naturalGround: 'gravelly_sand',
      rock: 'rock_ground_02',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_02',
    },
    buildings: { brickShare: 0.45, pitchedShare: 0.45, metalRoofShare: 0.6 },
    vegetation: {
      tree: ['tree_small_02', 'jacaranda_tree'],
      shrub: ['searsia_burchellii', 'searsia_lucida', 'wild_rooibos_bush', 'didelta_spinosa'],
      rock: ['namaqualand_boulder_03', 'namaqualand_stones_01'],
      debris: ['dry_branches_medium_01'],
      grass: ['grass_bermuda_01'],
      weed: ['weed_plant_02'],
      treeHeightM: [5, 10],
      forestSpacingM: 10,
      forestProbability: 0.6,
      openTreeProbability: 0.005,
      grassTint: [1.2, 1.05, 0.65],
    },
  },
  temperate: {
    id: 'temperate',
    label: 'Bosque templado',
    description: 'Clima templado de latitudes medias: praderas, bosques de hoja ancha y coníferas.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'farm_soil',
      path: 'dry_mud_field_001',
      dryGround: 'dry_ground_rocks',
      naturalGround: 'grass_ground',
      rock: 'rocky_trail',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_02',
    },
    buildings: { brickShare: 0.4, pitchedShare: 0.8, metalRoofShare: 0.2 },
    vegetation: {
      tree: ['island_tree_01', 'tree_small_02', 'pine_tree_01', 'jacaranda_tree'],
      shrub: ['shrub_02', 'shrub_04', 'fern_02'],
      rock: ['boulder_01', 'rock_moss_set_01'],
      debris: ['tree_stump_01', 'dead_tree_trunk_02'],
      grass: ['grass_medium_01', 'grass_medium_02'],
      weed: ['dandelion_01', 'nettle_plant'],
      treeHeightM: [10, 20],
      forestSpacingM: 10,
      forestProbability: 0.8,
      openTreeProbability: 0.01,
      grassTint: [0.95, 1.05, 0.85],
    },
  },
  boreal: {
    id: 'boreal',
    label: 'Bosque boreal',
    description: 'Latitudes altas: bosque de coníferas, suelos con acículas y nieve.',
    layers: {
      ...COMMON_LAYERS,
      soil: 'farm_soil',
      path: 'dry_mud_field_001',
      dryGround: 'dry_ground_rocks',
      naturalGround: 'grass_ground',
      rock: 'rock_ground_02',
      wet: 'brown_mud_03',
      forestFloor: 'forest_leaves_04',
    },
    buildings: { brickShare: 0.2, pitchedShare: 0.9, metalRoofShare: 0.4 },
    vegetation: {
      tree: ['pine_tree_01'],
      shrub: ['fern_02', 'shrub_02'],
      rock: ['rock_moss_set_01', 'boulder_01'],
      debris: ['dead_tree_trunk_02', 'tree_stump_01'],
      grass: ['grass_medium_01'],
      weed: ['nettle_plant'],
      treeHeightM: [14, 26],
      forestSpacingM: 8,
      forestProbability: 0.85,
      openTreeProbability: 0.01,
      grassTint: [0.95, 1.02, 0.9],
    },
  },
};

export interface BiomeClassification {
  readonly profile: BiomeProfile;
  /** Explicación legible de la decisión, con los datos usados. */
  readonly reason: string;
}

/** Mediana de la elevación (m) de una rejilla geográfica dentro de un rectángulo. */
export function medianElevation(grid: GeoGrid<Float32Array>, bbox: GeoBBox): number {
  const values: number[] = [];
  const c0 = Math.max(0, Math.floor((bbox.west - grid.west) / grid.pixelWidth));
  const c1 = Math.min(grid.width - 1, Math.ceil((bbox.east - grid.west) / grid.pixelWidth));
  const r0 = Math.max(0, Math.floor((grid.north - bbox.north) / grid.pixelHeight));
  const r1 = Math.min(grid.height - 1, Math.ceil((grid.north - bbox.south) / grid.pixelHeight));
  const step = Math.max(1, Math.floor(Math.max(c1 - c0, r1 - r0) / 128));
  for (let r = r0; r <= r1; r += step) {
    for (let c = c0; c <= c1; c += step) {
      const v = grid.data[r * grid.width + c];
      if (v !== undefined && Number.isFinite(v)) values.push(v);
    }
  }
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

/** Proporción de cada clase de cobertura en una rejilla de códigos WorldCover. */
export function coverShares(data: Uint8Array): CoverShares {
  const counts = new Map<number, number>();
  let valid = 0;
  for (const value of data) {
    if (value === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    valid++;
  }
  const share = (code: number): number => (valid === 0 ? 0 : (counts.get(code) ?? 0) / valid);
  return {
    tree: share(LAND_COVER.tree) + share(LAND_COVER.mangrove),
    shrub: share(LAND_COVER.shrub),
    grass: share(LAND_COVER.grass),
    crop: share(LAND_COVER.crop),
    built: share(LAND_COVER.built),
    bare: share(LAND_COVER.bare) + share(LAND_COVER.moss),
    water: share(LAND_COVER.water),
    snow: share(LAND_COVER.snow),
    wetland: share(LAND_COVER.wetland),
  };
}

function percent(value: number): string {
  return `${Math.round(value * 100).toString()} %`;
}

export function classifyBiome(evidence: BiomeEvidence): BiomeClassification {
  const { latitudeDeg, elevationM, shares } = evidence;
  const lat = Math.abs(latitudeDeg);
  // Proporciones sobre la tierra firme (sin agua), para que un lago no diluya la cobertura.
  const land = Math.max(1e-6, 1 - shares.water);
  const tree = shares.tree / land;
  const dry = (shares.bare + shares.shrub) / land;
  const facts = `altitud ${Math.round(elevationM).toString()} m, latitud ${Math.abs(latitudeDeg).toFixed(1)}° ${latitudeDeg < 0 ? 'S' : 'N'}, árboles ${percent(tree)}, matorral y suelo desnudo ${percent(dry)}`;
  const pick = (id: BiomeId, why: string): BiomeClassification => ({
    profile: BIOMES[id],
    reason: `${why} (${facts}).`,
  });
  if (lat >= 55) return pick('boreal', 'Latitud alta');
  if (lat < 35 && elevationM >= 3300) return pick('highland', 'Montaña por encima de 3 300 m en latitudes tropicales y subtropicales');
  if (lat >= 40) return pick('temperate', 'Latitud media');
  if (tree >= 0.45) return pick('tropical-forest', 'Cobertura arbórea dominante');
  if (lat < 35 && elevationM >= 1800) return pick('valley', 'Valle de montaña entre 1 800 y 3 300 m');
  if (dry >= 0.5) return pick('arid', 'Predominan el matorral y el suelo desnudo');
  if (lat < 30) return pick('savanna', 'Tierras bajas tropicales con pastizal o cultivos y poca cobertura arbórea');
  return pick('temperate', 'Tierras bajas subtropicales');
}

/** Todos los recursos del catálogo que puede necesitar cualquier bioma (build de producción). */
export function allBiomeAssetIds(): { materials: string[]; models: string[] } {
  const materials = new Set<string>();
  const models = new Set<string>();
  for (const profile of Object.values(BIOMES)) {
    for (const id of Object.values(profile.layers)) materials.add(id);
    const v = profile.vegetation;
    for (const list of [v.tree, v.shrub, v.rock, v.debris, v.grass, v.weed]) for (const id of list) models.add(id);
  }
  return { materials: [...materials], models: [...models] };
}
