import { describe, expect, it } from 'vitest';

import { ASSET_CATALOG_SCHEMA_VERSION } from './catalogSchema';
import { CatalogFormatError, parseAssetCatalog } from './parseCatalog';

const SHA = 'f'.repeat(64);

function availableModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wooden_bucket_01',
    name: 'Balde de madera',
    description: '',
    kind: 'model',
    category: 'environment',
    group: 'farm-object',
    status: 'available',
    source: {
      provider: 'Poly Haven',
      providerAssetId: 'wooden_bucket_01',
      pageUrl: 'https://polyhaven.com/a/wooden_bucket_01',
    },
    authors: ['Autor'],
    license: { id: 'CC0-1.0' },
    files: [
      {
        path: 'models/wooden_bucket_01/wooden_bucket_01.glb',
        role: 'model',
        format: 'glb',
        bytes: 10,
        sha256: SHA,
      },
    ],
    sizeBytes: 10,
    model: { lods: [{ level: 0, nodeName: 'LOD0', triangles: 1, vertices: 3, drawCalls: 1 }] },
    material: null,
    hdri: null,
    missing: null,
    error: null,
    validation: { checks: [], gltfValidator: null },
    ...overrides,
  };
}

function catalog(assets: unknown[], schemaVersion: unknown = ASSET_CATALOG_SCHEMA_VERSION) {
  return {
    schemaVersion,
    generatedAt: '2026-11-14T00:00:00.000Z',
    pipelineVersion: '0.1.0',
    assets,
  };
}

describe('parseAssetCatalog', () => {
  it('acepta un catálogo válido', () => {
    const parsed = parseAssetCatalog(catalog([availableModel()]));
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]?.id).toBe('wooden_bucket_01');
  });

  it('rechaza otras versiones del esquema con una indicación para regenerar', () => {
    expect(() => parseAssetCatalog(catalog([], 99))).toThrow(/make assets/);
  });

  it('rechaza rutas inseguras', () => {
    for (const unsafe of ['../secreto.glb', '/abs/a.glb', 'models/../../a.glb', 'a\\b.glb']) {
      const asset = availableModel({
        files: [{ path: unsafe, role: 'model', format: 'glb', bytes: 1, sha256: SHA }],
      });
      expect(() => parseAssetCatalog(catalog([asset])), unsafe).toThrow(CatalogFormatError);
    }
  });

  it('rechaza ids duplicados, estados desconocidos y huellas no válidas', () => {
    expect(() => parseAssetCatalog(catalog([availableModel(), availableModel()]))).toThrow(
      /duplicado/,
    );
    expect(() => parseAssetCatalog(catalog([availableModel({ status: 'quizá' })]))).toThrow(
      /status/,
    );
    expect(() =>
      parseAssetCatalog(
        catalog([
          availableModel({
            files: [{ path: 'models/a.glb', role: 'model', format: 'glb', bytes: 1, sha256: 'x' }],
          }),
        ]),
      ),
    ).toThrow(/sha256/);
  });

  it('exige fuente, licencia y niveles de detalle a los modelos disponibles', () => {
    expect(() => parseAssetCatalog(catalog([availableModel({ license: null })]))).toThrow(
      /licencia/,
    );
    expect(() => parseAssetCatalog(catalog([availableModel({ model: { lods: [] } })]))).toThrow(
      /detalle/,
    );
  });

  it('exige el motivo de un recurso faltante', () => {
    const missing = availableModel({
      status: 'missing',
      files: [],
      license: null,
      source: null,
      model: null,
      missing: null,
    });
    expect(() => parseAssetCatalog(catalog([missing]))).toThrow(/motivo/);
    expect(() =>
      parseAssetCatalog(catalog([{ ...missing, missing: { reason: 'x', alternatives: [] } }])),
    ).not.toThrow();
  });
});
