import { describe, expect, it } from 'vitest';

import { quantity } from '../domain/units.ts';
import { createLocalFrame } from '../geo/localFrame.ts';
import { createRegion } from '../geo/region.ts';
import { geoPoint } from '../geo/wgs84.ts';
import { computeWorldExtent, MAX_GENERATED_REGION_M, squareBBox, WORLD_LIMITS } from './extent.ts';
import {
  decodeFloat32LE,
  decodeUint8,
  type GeoGrid,
  sampleBicubic,
  sampleBilinear,
  sampleNearest,
} from './grid.ts';
import {
  buildHeightfield,
  heightAt,
  type Heightfield,
  normalAt,
  raycastHeightfield,
  slopeDegAt,
} from './heightfield.ts';
import { fillVoids, gaussianSmooth, normalizeDem } from './normalize.ts';
import { buildChunkLevel, buildContextRing, buildDetailChunks } from './terrainMesh.ts';

const CENTER = geoPoint(-17.551334, -65.861983);

function grid(
  width: number,
  height: number,
  value: (c: number, r: number) => number,
): GeoGrid<Float32Array> {
  const data = new Float32Array(width * height);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) data[r * width + c] = value(c, r);
  return { west: -66, north: -17, pixelWidth: 0.01, pixelHeight: 0.01, width, height, data };
}

/** Campo de alturas analítico: plano inclinado y = a·x + b·z. */
function planeField(a: number, b: number, size = 100, segments = 10): Heightfield {
  const n = segments + 1;
  const spacing = size / segments;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++)
      heights[j * n + i] = a * (-size / 2 + i * spacing) + b * (-size / 2 + j * spacing);
  }
  return {
    sizeM: size,
    segments,
    spacingM: spacing,
    originX: -size / 2,
    originZ: -size / 2,
    heights,
    minY: Math.min(...heights),
    maxY: Math.max(...heights),
  };
}

describe('extensión del mundo', () => {
  it('centra el área de detalle en la región y respeta los mínimos', () => {
    const region = createRegion(CENTER, 400, 300, 0);
    const result = computeWorldExtent(region, createLocalFrame(CENTER));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extent.detailSizeM).toBe(WORLD_LIMITS.minDetailSizeM);
    expect(result.extent.chunkSizeM).toBe(375);
    const bbox = result.extent.featuresBBox;
    expect(bbox.south).toBeLessThan(CENTER.latitude);
    expect(bbox.north).toBeGreaterThan(CENTER.latitude);
    // ±1,5 km + margen: unos 0,0135° de latitud a cada lado.
    expect(bbox.north - bbox.south).toBeCloseTo(
      3000 / 110_770 + 2 * WORLD_LIMITS.dataPaddingDeg,
      3,
    );
  });

  it('amplía el área para regiones grandes y rechaza las que superan el límite', () => {
    const frame = createLocalFrame(CENTER);
    const big = computeWorldExtent(createRegion(CENTER, 2500, 3000, 0), frame);
    expect(big.ok && big.extent.detailSizeM).toBe(5000);
    const rotated = computeWorldExtent(createRegion(CENTER, 3000, 3000, 45), frame);
    expect(rotated.ok).toBe(false);
    if (!rotated.ok) expect(rotated.maxRegionM).toBe(MAX_GENERATED_REGION_M);
  });

  it('el rectángulo geográfico contiene el cuadrado ENU', () => {
    const frame = createLocalFrame(CENTER);
    const bbox = squareBBox(frame, 8000, 0);
    for (const [e, n] of [
      [8000, 8000],
      [-8000, -8000],
      [8000, -8000],
    ] as const) {
      const p = frame.fromEnu({ east: e, north: n, up: 0 });
      expect(p.latitude).toBeGreaterThanOrEqual(bbox.south);
      expect(p.latitude).toBeLessThanOrEqual(bbox.north);
      expect(p.longitude).toBeGreaterThanOrEqual(bbox.west);
      expect(p.longitude).toBeLessThanOrEqual(bbox.east);
    }
  });
});

describe('rejillas geográficas', () => {
  it('decodifica float32 little-endian y uint8 de base64', () => {
    const bytes = new Uint8Array(new Float32Array([2707.5, Number.NaN]).buffer);
    const base64 = btoa(String.fromCharCode(...bytes));
    const values = decodeFloat32LE(base64, 2);
    expect(values[0]).toBe(2707.5);
    expect(Number.isNaN(values[1])).toBe(true);
    expect(() => decodeFloat32LE(base64, 3)).toThrow();
    expect([...decodeUint8(btoa('(\u001e'), 2)]).toEqual([40, 30]);
  });

  it('muestrea en el centro de los píxeles y reproduce funciones lineales', () => {
    const g = grid(10, 10, (c, r) => 100 + 3 * c - 2 * r);
    // Centro del píxel (2, 3).
    const lat = -17 - 3.5 * 0.01;
    const lon = -66 + 2.5 * 0.01;
    expect(sampleNearest(g, lat, lon)).toBe(100 + 6 - 6);
    expect(sampleBilinear(g, lat - 0.004, lon + 0.002)).toBeCloseTo(100 + 3 * 2.2 - 2 * 3.4, 5);
    // Catmull-Rom reproduce exactamente funciones lineales lejos del borde.
    expect(sampleBicubic(g, lat - 0.004, lon + 0.002)).toBeCloseTo(100 + 3 * 2.2 - 2 * 3.4, 5);
  });
});

describe('normalización del DEM', () => {
  it('rellena vacíos con la media de los vecinos válidos', () => {
    const g = grid(5, 5, () => 10);
    g.data[12] = Number.NaN;
    g.data[13] = Number.NaN;
    const { grid: filled, filled: count } = fillVoids(g);
    expect(count).toBe(2);
    expect(filled.data[12]).toBe(10);
    expect(() => fillVoids(grid(2, 2, () => Number.NaN))).toThrow();
  });

  it('el suavizado conserva superficies lineales y atenúa el ruido', () => {
    const plane = grid(20, 20, (c, r) => 2 * c + r);
    const smooth = gaussianSmooth(plane, 1.2);
    expect(smooth.data[10 * 20 + 10]).toBeCloseTo(30, 4);
    const noisy = grid(40, 40, (c, r) => ((c * 7 + r * 13) % 5) - 2);
    const report = normalizeDem(noisy, 1.2);
    const std = (values: Float32Array): number => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    expect(std(report.grid.data)).toBeLessThan(std(noisy.data) * 0.3);
    expect(report.smoothingSigmaPx).toBe(1.2);
  });
});

describe('campo de alturas', () => {
  it('construye el terreno en el marco ENU con y = 0 en el origen y la caída por curvatura', () => {
    const flat = grid(400, 400, () => 2700);
    const g = { ...flat, west: -66.05, north: -17.4 };
    const frame = createLocalFrame({ ...CENTER, heightM: quantity(2700, 'm') });
    const hf = buildHeightfield(g, frame, 8000, 16);
    expect(heightAt(hf, 0, 0)).toBeCloseTo(0, 6);
    // A 4 km del origen la superficie (misma altura elipsoidal) cae unos d²/2R ≈ 1,26 m.
    expect(heightAt(hf, 4000, 0)).toBeCloseTo(-(4000 ** 2) / (2 * 6_371_000), 1);
  });

  it('interpola con la misma triangulación que la malla y calcula normales y pendientes', () => {
    const hf = planeField(0.5, -0.25);
    expect(heightAt(hf, 13.3, -27.1)).toBeCloseTo(0.5 * 13.3 - 0.25 * -27.1, 5);
    const [nx, ny, nz] = normalAt(hf, 0, 0);
    expect(nx).toBeCloseTo(-0.5 / Math.hypot(0.5, 1, 0.25), 5);
    expect(nz).toBeCloseTo(0.25 / Math.hypot(0.5, 1, 0.25), 5);
    expect(ny).toBeGreaterThan(0);
    expect(slopeDegAt(hf, 0, 0)).toBeCloseTo((Math.atan(Math.hypot(0.5, 0.25)) * 180) / Math.PI, 3);
  });

  it('el rayo corta el terreno donde corresponde', () => {
    const hf = planeField(0, 0);
    const down = raycastHeightfield(hf, [10, 50, -5], [0, -1, 0]);
    expect(down?.x).toBeCloseTo(10, 6);
    expect(down?.y).toBeCloseTo(0, 4);
    expect(down?.distance).toBeCloseTo(50, 3);
    const slanted = raycastHeightfield(hf, [0, 30, 0], [1, -1, 0]);
    expect(slanted?.x).toBeCloseTo(30, 3);
    expect(raycastHeightfield(hf, [0, 30, 0], [0, 1, 0])).toBeNull();
    expect(raycastHeightfield(hf, [500, 30, 0], [0, -1, 0])).toBeNull();
    const sloped = planeField(0.5, 0);
    const hit = raycastHeightfield(sloped, [-40, 100, 0], [0.6, -1, 0.1]);
    expect(hit).not.toBeNull();
    if (hit !== null) expect(hit.y).toBeCloseTo(0.5 * hit.x, 2);
  });
});

describe('malla del terreno', () => {
  it('genera los niveles de detalle con faldones orientados hacia fuera', () => {
    const hf = planeField(0, 0, 160, 16);
    const chunks = buildDetailChunks(hf, 2, 3);
    expect(chunks).toHaveLength(4);
    const levels = chunks[0]?.levels ?? [];
    expect(levels.map((level) => level.indices.length / 3)).toEqual([
      8 * 8 * 2 + 4 * 8 * 2,
      4 * 4 * 2 + 4 * 4 * 2,
      2 * 2 * 2 + 4 * 2 * 2,
    ]);
    const mesh = buildChunkLevel(hf, 0, 0, 8, 1, 5);
    const { positions, indices } = mesh;
    let up = 0;
    let outward = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0].map((k) => [
        positions[k * 3] ?? 0,
        positions[k * 3 + 1] ?? 0,
        positions[k * 3 + 2] ?? 0,
      ]) as [number[], number[], number[]];
      const u = [(b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0), (b[2] ?? 0) - (a[2] ?? 0)];
      const v = [(c[0] ?? 0) - (a[0] ?? 0), (c[1] ?? 0) - (a[1] ?? 0), (c[2] ?? 0) - (a[2] ?? 0)];
      const normal = [
        (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
        (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
        (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
      ];
      const centroid = [0, 2].map((axis) => ((a[axis] ?? 0) + (b[axis] ?? 0) + (c[axis] ?? 0)) / 3);
      if ((normal[1] ?? 0) > 0) up++;
      else {
        // Faldón: la normal apunta desde el centro del fragmento (-40, -40) hacia fuera.
        const dot =
          (normal[0] ?? 0) * ((centroid[0] ?? 0) + 40) +
          (normal[2] ?? 0) * ((centroid[1] ?? 0) + 40);
        if (dot > 0) outward++;
      }
    }
    expect(up).toBe(8 * 8 * 2);
    expect(outward).toBe(4 * 8 * 2);
    expect(mesh.bounds[1]).toBe(-5);
  });

  it('el anillo de contexto deja un hueco exacto para el área de detalle', () => {
    const hf = planeField(0, 0, 400, 8);
    const ring = buildContextRing(hf, 100);
    // 8 × 8 celdas de 50 m menos las 4 × 4 del hueco central de 200 m.
    expect(ring.indices.length / 3).toBe((64 - 16) * 2);
  });
});
