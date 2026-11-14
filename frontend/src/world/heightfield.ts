/**
 * Campo de alturas del terreno en el marco local de la escena (metros).
 *
 * Malla regular en el plano E–N centrada en el origen: columna i → x = originX + i·spacing (este),
 * fila j → z = originZ + j·spacing (z = −norte, así que la fila 0 es el borde norte). La altura
 * `y` es la coordenada "arriba" ENU del punto del terreno: incluye la caída por la curvatura de la
 * Tierra (≈ 0,7 m a 3 km, 5 m a 8 km), de modo que distancias y alturas son coherentes con el
 * marco ENU de la fase 03. `y = 0` es la altura del terreno en el origen.
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import { quantity } from '../domain/units.ts';
import { type GeoGrid, sampleBicubic } from './grid.ts';

export interface Heightfield {
  readonly sizeM: number;
  readonly segments: number;
  readonly spacingM: number;
  readonly originX: number;
  readonly originZ: number;
  readonly heights: Float32Array;
  readonly minY: number;
  readonly maxY: number;
}

export function buildHeightfield(
  dem: GeoGrid<Float32Array>,
  frame: LocalFrame,
  sizeM: number,
  segments: number,
): Heightfield {
  const spacingM = sizeM / segments;
  const origin = -sizeM / 2;
  const n = segments + 1;
  const heights = new Float32Array(n * n);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let j = 0; j < n; j++) {
    const z = origin + j * spacingM;
    for (let i = 0; i < n; i++) {
      const x = origin + i * spacingM;
      const p = frame.fromEnu({ east: x, north: -z, up: 0 });
      const h = sampleBicubic(dem, p.latitude, p.longitude);
      const y = frame.toEnu({
        latitude: p.latitude,
        longitude: p.longitude,
        heightM: quantity(h, 'm'),
      }).up;
      heights[j * n + i] = y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { sizeM, segments, spacingM, originX: origin, originZ: origin, heights, minY, maxY };
}

export function heightAtNode(hf: Heightfield, i: number, j: number): number {
  const n = hf.segments + 1;
  const ii = i < 0 ? 0 : i > hf.segments ? hf.segments : i;
  const jj = j < 0 ? 0 : j > hf.segments ? hf.segments : j;
  return hf.heights[jj * n + ii] ?? 0;
}

export function containsPoint(hf: Heightfield, x: number, z: number): boolean {
  return (
    x >= hf.originX && z >= hf.originZ && x <= hf.originX + hf.sizeM && z <= hf.originZ + hf.sizeM
  );
}

/**
 * Altura en (x, z) con la misma triangulación que la malla (diagonal de (i+1, j) a (i, j+1)):
 * coincide con la superficie dibujada en el nivel de detalle más fino.
 */
export function heightAt(hf: Heightfield, x: number, z: number): number {
  const gx = (x - hf.originX) / hf.spacingM;
  const gz = (z - hf.originZ) / hf.spacingM;
  const i = Math.min(Math.max(Math.floor(gx), 0), hf.segments - 1);
  const j = Math.min(Math.max(Math.floor(gz), 0), hf.segments - 1);
  const fx = Math.min(Math.max(gx - i, 0), 1);
  const fz = Math.min(Math.max(gz - j, 0), 1);
  const a = heightAtNode(hf, i, j);
  const b = heightAtNode(hf, i + 1, j);
  const c = heightAtNode(hf, i, j + 1);
  const d = heightAtNode(hf, i + 1, j + 1);
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/** Normal unitaria en un nodo por diferencias centrales (continua entre fragmentos y niveles). */
export function normalAtNode(hf: Heightfield, i: number, j: number): [number, number, number] {
  const dx = (heightAtNode(hf, i + 1, j) - heightAtNode(hf, i - 1, j)) / (2 * hf.spacingM);
  const dz = (heightAtNode(hf, i, j + 1) - heightAtNode(hf, i, j - 1)) / (2 * hf.spacingM);
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}

/** Normal interpolada en un punto cualquiera. */
export function normalAt(hf: Heightfield, x: number, z: number): [number, number, number] {
  const gx = (x - hf.originX) / hf.spacingM;
  const gz = (z - hf.originZ) / hf.spacingM;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const acc: [number, number, number] = [0, 0, 0];
  const corners: [number, number, number][] = [
    [i, j, (1 - fx) * (1 - fz)],
    [i + 1, j, fx * (1 - fz)],
    [i, j + 1, (1 - fx) * fz],
    [i + 1, j + 1, fx * fz],
  ];
  for (const [ci, cj, w] of corners) {
    const nrm = normalAtNode(hf, ci, cj);
    acc[0] += nrm[0] * w;
    acc[1] += nrm[1] * w;
    acc[2] += nrm[2] * w;
  }
  const length = Math.hypot(acc[0], acc[1], acc[2]);
  return [acc[0] / length, acc[1] / length, acc[2] / length];
}

/** Pendiente en grados a partir de la normal. */
export function slopeDegAt(hf: Heightfield, x: number, z: number): number {
  const [, ny] = normalAt(hf, x, z);
  return (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
}

export interface RayHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
}

/**
 * Intersección de un rayo con el terreno: avance a pasos de media celda y bisección.
 * `direction` no necesita estar normalizada. Devuelve `null` si no corta dentro del campo.
 */
export function raycastHeightfield(
  hf: Heightfield,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  maxDistance = Infinity,
): RayHit | null {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0) return null;
  const d = [direction[0] / length, direction[1] / length, direction[2] / length] as const;
  // Recorte del rayo a la caja del campo de alturas (método de las placas).
  const min = [hf.originX, hf.minY - 1, hf.originZ];
  const max = [hf.originX + hf.sizeM, hf.maxY + 1, hf.originZ + hf.sizeM];
  let tNear = 0;
  let tFar = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis] ?? 0;
    const dir = d[axis] ?? 0;
    const lo = min[axis] ?? 0;
    const hi = max[axis] ?? 0;
    if (Math.abs(dir) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / dir;
    let t2 = (hi - o) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tNear = Math.max(tNear, t1);
    tFar = Math.min(tFar, t2);
    if (tNear > tFar) return null;
  }
  const above = (t: number): number =>
    origin[1] + d[1] * t - heightAt(hf, origin[0] + d[0] * t, origin[2] + d[2] * t);
  const step = hf.spacingM * 0.5;
  let previous = tNear;
  if (above(previous) < 0) {
    // El origen ya está bajo el terreno: el punto de corte es el propio origen recortado.
    return {
      x: origin[0] + d[0] * previous,
      y: origin[1] + d[1] * previous,
      z: origin[2] + d[2] * previous,
      distance: previous,
    };
  }
  for (let t = tNear + step; t <= tFar + step; t += step) {
    const current = Math.min(t, tFar);
    const currentAbove = above(current);
    if (currentAbove <= 0) {
      let lo = previous;
      let hi = current;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      const t0 = (lo + hi) / 2;
      const x = origin[0] + d[0] * t0;
      const z = origin[2] + d[2] * t0;
      return { x, y: heightAt(hf, x, z), z, distance: t0 };
    }
    previous = current;
    if (current >= tFar) break;
  }
  return null;
}
