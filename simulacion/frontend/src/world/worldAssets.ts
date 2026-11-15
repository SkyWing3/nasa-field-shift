/** Recursos del catálogo que usa el mundo 3D (se publican en el build de producción). */
import { allBiomeAssetIds } from './biome.ts';
import { vegetationAssetIds } from './vegetationSpecies.ts';

export const WORLD_MATERIAL_RESOLUTION = 1024;

export const WORLD_HDRIS = [
  'kloofendal_43d_clear_puresky',
  'farm_field_puresky',
  'overcast_soil_puresky',
  'kloofendal_misty_morning_puresky',
  'belfast_sunset_puresky',
] as const;

export function worldPublishedAssets(): {
  materials: string[];
  materialResolution: number;
  models: string[];
  hdris: string[];
} {
  const assets = allBiomeAssetIds();
  return {
    materials: assets.materials,
    materialResolution: WORLD_MATERIAL_RESOLUTION,
    models: [...new Set([...assets.models, ...vegetationAssetIds()])],
    hdris: [...WORLD_HDRIS],
  };
}
