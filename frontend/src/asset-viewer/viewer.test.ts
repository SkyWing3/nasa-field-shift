import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Texture,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ASSET_CATALOG_SCHEMA_VERSION } from '../assets';
import { fetchCatalog } from '../assets/catalogClient';
import { formatBytes, formatMeters } from './labels';
import { applyLodMode, buildLod, currentLodLevel, lodSwitchDistances } from './scene/lod';
import { releaseResource, retainResource } from '../scene/resources';
import { applyViewMode, createViewModeMaterial } from './scene/viewModes';

describe('formato', () => {
  it('usa unidades binarias con coma decimal y espacio no separable', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1,50 KB');
    expect(formatBytes(137_000_000)).toBe('130,7 MB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('formatea dimensiones en metros', () => {
    expect(formatMeters([2.908, 4.552, 4.245])).toBe('2,91 × 4,55 × 4,25 m');
  });
});

function lodModel(levels: number): Group {
  const root = new Group();
  for (let level = 0; level < levels; level++) {
    const node = new Group();
    node.name = `LOD${level}`;
    node.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial()));
    root.add(node);
  }
  return root;
}

describe('niveles de detalle', () => {
  it('calcula distancias de cambio proporcionales al radio', () => {
    expect(lodSwitchDistances(2, 3)).toEqual([0, 16, 40]);
  });

  it('construye un THREE.LOD con los nodos LOD0…LODn del GLB', () => {
    const built = buildLod(lodModel(3), ['LOD0', 'LOD1', 'LOD2']);
    expect(built.lod.levels.map((level) => level.distance)).toEqual([
      0,
      built.radius * 8,
      built.radius * 20,
    ]);
    expect(built.radius).toBeCloseTo(Math.sqrt(3));
  });

  it('falla de forma explícita si falta un nivel', () => {
    expect(() => buildLod(lodModel(1), ['LOD0', 'LOD1'])).toThrow(/LOD1/);
  });

  it('permite fijar un nivel para inspeccionarlo y volver al modo automático', () => {
    const built = buildLod(lodModel(3), ['LOD0', 'LOD1', 'LOD2']);
    applyLodMode(built, 2);
    expect(built.lod.autoUpdate).toBe(false);
    expect(built.levels.map((level) => level.visible)).toEqual([false, false, true]);
    expect(currentLodLevel(built, 2)).toBe(2);
    applyLodMode(built, 'auto');
    expect(built.lod.autoUpdate).toBe(true);
  });
});

describe('modos de visualización', () => {
  const pbr = () =>
    new MeshStandardMaterial({ map: new Texture(), normalMap: new Texture(), roughness: 0.7 });

  it('mantiene el material PBR y sustituye por vistas de un solo mapa', () => {
    expect(createViewModeMaterial(pbr(), 'pbr')).toBeNull();
    expect(createViewModeMaterial(pbr(), 'albedo')).toBeInstanceOf(MeshBasicMaterial);
    const roughness = createViewModeMaterial(pbr(), 'roughness');
    expect(roughness).toBeInstanceOf(ShaderMaterial);
    // Sin mapa de rugosidad se muestra el factor uniforme del material.
    expect((roughness as ShaderMaterial).uniforms.hasMap?.value).toBe(false);
    expect((roughness as ShaderMaterial).uniforms.factor?.value).toBe(0.7);
    expect((createViewModeMaterial(pbr(), 'wireframe') as MeshBasicMaterial).wireframe).toBe(true);
  });

  it('restaura los materiales originales', () => {
    const original = pbr();
    const mesh = new Mesh(new BoxGeometry(), original);
    const root = new Group().add(mesh);
    const restore = applyViewMode(root, 'normal');
    expect(mesh.material).not.toBe(original);
    restore();
    expect(mesh.material).toBe(original);
  });
});

describe('liberación de recursos', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no libera un recurso que se vuelve a retener en el mismo ciclo (StrictMode)', () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    retainResource('a');
    releaseResource('a', dispose);
    retainResource('a');
    vi.runAllTimers();
    expect(dispose).not.toHaveBeenCalled();
    releaseResource('a', dispose);
    vi.runAllTimers();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('espera a que lo suelten todos los usuarios', () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    retainResource('b');
    retainResource('b');
    releaseResource('b', dispose);
    vi.runAllTimers();
    expect(dispose).not.toHaveBeenCalled();
    releaseResource('b', dispose);
    vi.runAllTimers();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('cliente del catálogo', () => {
  const signal = new AbortController().signal;
  const respond = (body: string, status = 200) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));

  it('distingue catálogo no generado, inválido, inaccesible y válido', async () => {
    expect((await fetchCatalog(signal, respond('', 404))).status).toBe('not-generated');
    expect((await fetchCatalog(signal, respond('<html>'))).status).toBe('invalid');
    expect((await fetchCatalog(signal, respond('{}', 500))).status).toBe('unreachable');
    expect(
      (await fetchCatalog(signal, vi.fn<typeof fetch>().mockRejectedValue(new TypeError('red'))))
        .status,
    ).toBe('unreachable');
    const valid = JSON.stringify({
      schemaVersion: ASSET_CATALOG_SCHEMA_VERSION,
      generatedAt: '2026-11-14T00:00:00Z',
      pipelineVersion: '0.1.0',
      assets: [],
    });
    expect((await fetchCatalog(signal, respond(valid))).status).toBe('ready');
  });
});
