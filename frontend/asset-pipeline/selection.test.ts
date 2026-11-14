import { describe, expect, it } from 'vitest';

import type { AssetCategory, AssetGroup } from '../src/assets/catalogSchema.ts';
import { ASSET_SELECTION } from './selection.ts';

const CATEGORY_OF_GROUP: Readonly<Record<AssetGroup, AssetCategory>> = {
  'agricultural-soil': 'terrain',
  'tilled-soil': 'terrain',
  mud: 'terrain',
  'wet-soil': 'terrain',
  'dry-soil': 'terrain',
  'stony-ground': 'terrain',
  'rural-path': 'terrain',
  'paved-road': 'terrain',
  'grass-ground': 'terrain',
  grass: 'vegetation',
  shrub: 'vegetation',
  tree: 'vegetation',
  weed: 'vegetation',
  potato: 'crop',
  maize: 'crop',
  'fava-bean': 'crop',
  fence: 'environment',
  irrigation: 'environment',
  'farm-object': 'environment',
  rock: 'environment',
  'ground-debris': 'environment',
  sky: 'lighting',
};

describe('selección de assets', () => {
  it('usa identificadores únicos y seguros', () => {
    const ids = ASSET_SELECTION.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('asigna cada grupo a su categoría', () => {
    for (const item of ASSET_SELECTION) {
      expect(item.category, item.id).toBe(CATEGORY_OF_GROUP[item.group]);
    }
  });

  it('cubre todos los tipos de recurso pedidos en la fase 02 (disponibles o documentados)', () => {
    const groups = new Set(ASSET_SELECTION.map((item) => item.group));
    for (const group of Object.keys(CATEGORY_OF_GROUP) as AssetGroup[]) {
      expect(groups.has(group), group).toBe(true);
    }
  });

  it('documenta motivo y alternativas gratuitas de cada recurso faltante', () => {
    for (const item of ASSET_SELECTION) {
      if (item.acquisition !== 'missing') continue;
      expect(item.missing.reason.length, item.id).toBeGreaterThan(40);
      expect(item.missing.alternatives.length, item.id).toBeGreaterThan(0);
      for (const alternative of item.missing.alternatives) {
        expect(alternative.url, item.id).toMatch(/^https:\/\//);
        expect(alternative.license.length).toBeGreaterThan(0);
      }
    }
  });

  it('descarga solo de fuentes CC0 (Poly Haven y ambientCG)', () => {
    for (const item of ASSET_SELECTION) {
      if (item.acquisition === 'download') {
        expect(['polyhaven', 'ambientcg']).toContain(item.source.provider);
      }
    }
  });

  it('define niveles de detalle decrecientes y presupuestos coherentes', () => {
    for (const item of ASSET_SELECTION) {
      if (item.acquisition !== 'download' || item.kind !== 'model') continue;
      expect(item.lod0MaxTriangles, item.id).toBeGreaterThan(0);
      let previous = 1;
      for (const ratio of item.lodRatios) {
        expect(ratio, item.id).toBeLessThan(previous);
        expect(ratio, item.id).toBeGreaterThan(0);
        previous = ratio;
      }
      const [min, max] = item.heightRangeM;
      expect(min, item.id).toBeLessThan(max);
    }
  });
});
