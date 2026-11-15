/**
 * Especies de la vegetación ambiental y elementos dispersos, con los modelos del catálogo
 * (todos CC0 de Poly Haven) que las representan.
 *
 * El bioma de la región (`biome.ts`) elige los modelos de cada tipo (p. ej. árboles tropicales
 * altos en la selva, arbustos espinosos en el altiplano) y la altura de los árboles. Los
 * modelos son representativos del tipo de planta: el catálogo no tiene especies nativas
 * (queñua, molle, palmeras, ichu…), así que no se afirma ninguna especie concreta.
 */
import type { AssetCatalog } from '../assets';
import type { VegetationRule } from './biome.ts';

export type SpeciesId = 'tree' | 'shrub' | 'rock' | 'debris' | 'grass' | 'weed';

export interface SpeciesModel {
  readonly assetId: string;
  /** Nombre del nodo de la variante en el LOD0 del GLB (el LODn añade `_LODn`). */
  readonly variant: string;
  readonly weight: number;
  /** Escala base del modelo (lleva cada árbol a la altura objetivo del bioma). */
  readonly baseScale: number;
}

export interface SpeciesConfig {
  readonly id: SpeciesId;
  readonly label: string;
  readonly models: readonly SpeciesModel[];
  /** `far`: se reparte por todo el área de detalle. `near`: solo alrededor de la cámara. */
  readonly layer: 'far' | 'near';
  /** Distancias (m) a partir de las que se usa el LOD1, el LOD2 y se deja de dibujar. */
  readonly lodDistancesM: readonly [lod1: number, lod2: number, cull: number];
  readonly scaleRange: readonly [number, number];
  readonly castShadow: boolean;
  /** Hundimiento en el suelo (m) para que la base no flote en pendientes. */
  readonly sinkM: number;
}

const m = (assetId: string, variant: string, weight = 1): SpeciesModel => ({
  assetId,
  variant,
  weight,
  baseScale: 1,
});

export type SpeciesSet = Readonly<Record<SpeciesId, SpeciesConfig>>;

/** Especies por defecto (valle templado); plantilla de distancias de LOD, sombras y escalas. */
export const SPECIES: SpeciesSet = {
  tree: {
    id: 'tree',
    label: 'Árboles',
    models: [m('island_tree_01', 'island_tree_01'), m('tree_small_02', 'tree_small_02')],
    layer: 'far',
    lodDistancesM: [70, 220, 1600],
    scaleRange: [0.8, 1.15],
    castShadow: true,
    sinkM: 0.15,
  },
  shrub: {
    id: 'shrub',
    label: 'Arbustos',
    models: [
      m('shrub_02', 'shrub_02_a'),
      m('shrub_02', 'shrub_02_b'),
      m('shrub_02', 'shrub_02_c'),
      m('shrub_02', 'shrub_02_d'),
      m('shrub_04', 'shrub_04', 1.5),
    ],
    layer: 'far',
    lodDistancesM: [30, 90, 420],
    scaleRange: [0.7, 1.25],
    castShadow: true,
    sinkM: 0.08,
  },
  rock: {
    id: 'rock',
    label: 'Rocas',
    models: [
      m('boulder_01', 'boulder_01', 3),
      m('rock_moss_set_01', 'rock_moss_set_01_rock01'),
      m('rock_moss_set_01', 'rock_moss_set_01_rock03'),
      m('rock_moss_set_01', 'rock_moss_set_01_rock05'),
    ],
    layer: 'far',
    lodDistancesM: [40, 120, 450],
    scaleRange: [0.35, 1.1],
    castShadow: true,
    sinkM: 0.12,
  },
  debris: {
    id: 'debris',
    label: 'Tocones y ramas secas',
    models: [
      m('tree_stump_01', 'tree_stump_01'),
      m('dry_branches_medium_01', 'dry_branches_medium_01_a'),
      m('dry_branches_medium_01', 'dry_branches_medium_01_b'),
      m('dry_branches_medium_01', 'dry_branches_medium_01_c'),
    ],
    layer: 'far',
    lodDistancesM: [20, 50, 140],
    scaleRange: [0.8, 1.2],
    castShadow: true,
    sinkM: 0.05,
  },
  grass: {
    id: 'grass',
    label: 'Matas de pasto',
    models: [
      m('grass_medium_01', 'grass_medium_01_small_a'),
      m('grass_medium_01', 'grass_medium_01_small_b'),
      m('grass_medium_01', 'grass_medium_01_mid_a'),
      m('grass_medium_01', 'grass_medium_01_mid_b'),
      m('grass_medium_01', 'grass_medium_01_mid_c'),
      m('grass_medium_01', 'grass_medium_01_tall_a'),
      m('grass_medium_01', 'grass_medium_01_tall_b'),
      m('grass_bermuda_01', 'grass_bermuda_01_dead_a', 1.5),
      m('grass_bermuda_01', 'grass_bermuda_01_dead_b', 1.5),
      m('grass_bermuda_01', 'grass_bermuda_01_medium_a'),
      m('grass_bermuda_01', 'grass_bermuda_01_medium_c'),
      m('grass_bermuda_01', 'grass_bermuda_01_medium_f'),
    ],
    layer: 'near',
    lodDistancesM: [10, 24, 60],
    scaleRange: [0.8, 1.35],
    castShadow: false,
    sinkM: 0.02,
  },
  weed: {
    id: 'weed',
    label: 'Maleza',
    models: [
      m('weed_plant_02', 'weed_plant_02_a'),
      m('weed_plant_02', 'weed_plant_02_b'),
      m('weed_plant_02', 'weed_plant_02_c'),
      m('nettle_plant', 'nettle_plant_tall_a'),
      m('nettle_plant', 'nettle_plant_medium_a'),
      m('dandelion_01', 'dandelion_01_c'),
      m('dandelion_01', 'dandelion_01_d'),
    ],
    layer: 'near',
    lodDistancesM: [10, 22, 50],
    scaleRange: [0.8, 1.3],
    castShadow: false,
    sinkM: 0.02,
  },
};

export const SPECIES_ORDER: readonly SpeciesId[] = [
  'tree',
  'shrub',
  'rock',
  'debris',
  'grass',
  'weed',
];

/** Índice de modelo elegido con los pesos de la especie a partir de un valor uniforme. */
export function pickModel(species: SpeciesConfig, u: number): number {
  const total = species.models.reduce((sum, model) => sum + model.weight, 0);
  let r = u * total;
  for (let k = 0; k < species.models.length; k++) {
    r -= species.models[k]?.weight ?? 0;
    if (r < 0) return k;
  }
  return species.models.length - 1;
}

/** Recursos del catálogo necesarios para la vegetación. */
export function vegetationAssetIds(species: SpeciesSet = SPECIES): string[] {
  return [
    ...new Set(SPECIES_ORDER.flatMap((id) => species[id].models.map((model) => model.assetId))),
  ];
}

/** Variantes de pasto demasiado pequeñas para verse (plántulas, briznas sueltas, aplastadas). */
const TINY_VARIANT = /(tiny|seedling|single|flattened)/;
/** Límites de la escala base: más allá, el tronco y las hojas pierden la proporción. */
const MIN_TREE_SCALE = 0.6;
const MAX_TREE_SCALE = 2.2;

export interface BiomeSpecies {
  readonly species: SpeciesSet;
  /** Modelos del bioma que faltan en el catálogo (se usan los de la plantilla en su lugar). */
  readonly missing: readonly string[];
}

/**
 * Especies de un bioma con las variantes publicadas en el catálogo. Los árboles se escalan a la
 * altura objetivo del bioma (limitada para no deformar el modelo); si falta un modelo se usa
 * el de la plantilla y se informa.
 */
export function speciesForBiome(rule: VegetationRule, catalog: AssetCatalog): BiomeSpecies {
  const missing: string[] = [];
  const build = (id: SpeciesId, assetIds: readonly string[]): SpeciesConfig => {
    const template = SPECIES[id];
    const models: SpeciesModel[] = [];
    for (const assetId of assetIds) {
      const asset = catalog.assets.find((entry) => entry.id === assetId);
      const info = asset?.model;
      if (asset?.status !== 'available' || info === null || info === undefined) {
        missing.push(assetId);
        continue;
      }
      let variants = info.variants.length > 0 ? [...info.variants] : [assetId];
      if (id === 'grass' || id === 'weed') {
        const visible = variants.filter((variant) => !TINY_VARIANT.test(variant));
        if (visible.length > 0) variants = visible;
      }
      let baseScale = 1;
      if (id === 'tree') {
        const heightM = info.sizeM[1];
        const target = (rule.treeHeightM[0] + rule.treeHeightM[1]) / 2;
        baseScale = Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, target / heightM));
      }
      // Cada modelo pesa lo mismo, repartido entre sus variantes.
      for (const variant of variants)
        models.push({ assetId, variant, weight: 1 / variants.length, baseScale });
    }
    const scaleRange: readonly [number, number] =
      id === 'tree'
        ? [
            (2 * rule.treeHeightM[0]) / (rule.treeHeightM[0] + rule.treeHeightM[1]),
            (2 * rule.treeHeightM[1]) / (rule.treeHeightM[0] + rule.treeHeightM[1]),
          ]
        : template.scaleRange;
    return { ...template, models: models.length > 0 ? models : template.models, scaleRange };
  };
  return {
    species: {
      tree: build('tree', rule.tree),
      shrub: build('shrub', rule.shrub),
      rock: build('rock', rule.rock),
      debris: build('debris', rule.debris),
      grass: build('grass', rule.grass),
      weed: build('weed', rule.weed),
    },
    missing,
  };
}
