import { describe, expect, it } from 'vitest';

import type { AssetCatalog, AssetEntry } from '../assets';
import { BIOMES } from './biome.ts';
import { biomeLayerIds, terrainLayerUrls } from './textures.ts';
import { worldPublishedAssets } from './worldAssets.ts';

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

const ids = biomeLayerIds(BIOMES.valley);
const catalog = {
  assets: ids.map((id, k) => material(id, k === 0 ? null : 2)),
} as unknown as AssetCatalog;

describe('texturas del terreno', () => {
  it('publica los materiales y modelos de otros biomas además del valle', () => {
    const published = worldPublishedAssets();
    expect(published.materials).toContain('red_laterite_soil_stones');
    expect(published.materials).toContain('withered_grass');
    expect(published.models).toContain('pachira_aquatica_01');
    expect(published.materials.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('usa la menor versión del catálogo que no sea inferior a la resolución pedida', () => {
    const low = terrainLayerUrls(catalog, 512, ids, '/lib/');
    expect(low[0]?.albedo).toBe('/lib/materials/farm_soil/farm_soil_albedo_1024.webp');
    expect(terrainLayerUrls(catalog, 1024, ids)[1]?.normal).toContain('_normal_1024.webp');
    expect(terrainLayerUrls(catalog, 2048, ids)[1]?.normal).toContain('_normal_2048.webp');
  });

  it('usa el tamaño real publicado o 2 m si la fuente no lo publica', () => {
    const layers = terrainLayerUrls(catalog, 1024, ids);
    expect(layers[0]?.tileSizeM).toBe(2);
    expect(layers.map((layer) => layer.id)).toEqual(ids);
  });

  it('cada bioma asigna un material a cada una de las 10 capas', () => {
    for (const profile of Object.values(BIOMES)) {
      const layerIds = biomeLayerIds(profile);
      expect(layerIds).toHaveLength(10);
      expect(layerIds.every((id) => id.length > 0)).toBe(true);
    }
    expect(biomeLayerIds(BIOMES.highland)[4]).toBe('withered_grass');
    expect(biomeLayerIds(BIOMES['tropical-forest'])[0]).toBe('red_laterite_soil_stones');
  });

  it('falla con un mensaje claro si falta un material o una resolución', () => {
    const missing = { assets: catalog.assets.slice(1) } as unknown as AssetCatalog;
    expect(() => terrainLayerUrls(missing, 1024, ids)).toThrow(/farm_soil.*make assets/);
    expect(() => terrainLayerUrls(catalog, 4096, ids)).toThrow(/4096/);
  });
});
