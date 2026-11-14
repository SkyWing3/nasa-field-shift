import { describe, expect, it } from 'vitest';

import type { AssetCatalog, AssetEntry } from '../assets';
import { TERRAIN_LAYERS } from './splat.ts';
import { terrainLayerUrls } from './textures.ts';

function material(id: string, tile: number | null): AssetEntry {
  const files = [2048, 1024].flatMap((width) =>
    ['albedo', 'normal', 'orm', 'height'].map((role) => ({
      path: `materials/${id}/${id}_${role}_${String(width)}.webp`,
      role,
      format: 'webp',
      bytes: 1,
      sha256: 'x',
      width,
      height: width,
    })),
  );
  return {
    id,
    status: 'available',
    files,
    material:
      tile === null
        ? null
        : { tileSizeM: [tile, tile], resolutions: [2048, 1024], gpuTextureBytes: 1 },
  } as unknown as AssetEntry;
}

const catalog = {
  assets: TERRAIN_LAYERS.map((layer, k) => material(layer.id, k === 0 ? null : 2)),
} as unknown as AssetCatalog;

describe('texturas del terreno', () => {
  it('usa la menor versión del catálogo que no sea inferior a la resolución pedida', () => {
    const low = terrainLayerUrls(catalog, 512, '/lib/');
    expect(low[0]?.albedo).toBe('/lib/materials/farm_soil/farm_soil_albedo_1024.webp');
    expect(terrainLayerUrls(catalog, 1024)[1]?.normal).toContain('_normal_1024.webp');
    expect(terrainLayerUrls(catalog, 2048)[1]?.normal).toContain('_normal_2048.webp');
  });

  it('usa el tamaño real publicado o 2 m si la fuente no lo publica', () => {
    const layers = terrainLayerUrls(catalog, 1024);
    expect(layers[0]?.tileSizeM).toBe(2);
    expect(layers.map((layer) => layer.id)).toEqual(TERRAIN_LAYERS.map((layer) => layer.id));
  });

  it('falla con un mensaje claro si falta un material o una resolución', () => {
    const missing = { assets: catalog.assets.slice(1) } as unknown as AssetCatalog;
    expect(() => terrainLayerUrls(missing, 1024)).toThrow(/farm_soil.*make assets/);
    expect(() => terrainLayerUrls(catalog, 4096)).toThrow(/4096/);
  });
});
