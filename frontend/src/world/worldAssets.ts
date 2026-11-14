/** Recursos del catálogo que usa el mundo 3D (se publican en el build de producción). */
import { TERRAIN_LAYERS } from './splat.ts';
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
  return {
    materials: TERRAIN_LAYERS.map((layer) => layer.id),
    materialResolution: WORLD_MATERIAL_RESOLUTION,
    models: vegetationAssetIds(),
    hdris: [...WORLD_HDRIS],
  };
}
