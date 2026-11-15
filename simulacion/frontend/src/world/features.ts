/**
 * Elementos geográficos de OpenStreetMap en el marco local.
 *
 * La geometría y la categoría vienen de OSM. El **ancho** se toma de la etiqueta `width` si
 * existe y es plausible; si no, se **estima** por categoría (OSM casi nunca lo registra en zonas
 * rurales). El tipo de superficie (pavimentada o no) sale de `surface`; sin esa etiqueta se
 * estima por categoría de vía. Cada valor estimado queda marcado como tal.
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import { geoPoint } from '../geo/wgs84.ts';

export type LineKind = 'road' | 'track' | 'path' | 'waterway' | 'railway';
export type PolygonKind = 'building' | 'water' | 'landuse';

export interface WorldFeatureInput {
  readonly id: string;
  readonly kind: LineKind | PolygonKind;
  readonly subtype: string;
  readonly geometryType: 'LineString' | 'Polygon';
  readonly coordinates: readonly (readonly [number, number])[];
  readonly tags: Readonly<Record<string, string>>;
}

export interface LocalLine {
  readonly id: string;
  readonly kind: LineKind;
  readonly subtype: string;
  readonly name: string | null;
  /** Pares (x, z) en metros. */
  readonly points: Float32Array;
  readonly widthM: number;
  readonly widthEstimated: boolean;
  /** `null` para cursos de agua y vías férreas. */
  readonly paved: boolean | null;
  readonly surfaceEstimated: boolean;
  readonly intermittent: boolean;
}

export interface LocalPolygon {
  readonly id: string;
  readonly kind: PolygonKind;
  readonly subtype: string;
  readonly name: string | null;
  /** Anillo exterior cerrado, pares (x, z). */
  readonly ring: Float32Array;
  readonly bounds: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  readonly intermittent: boolean;
}

export interface LocalFeatures {
  readonly lines: readonly LocalLine[];
  readonly polygons: readonly LocalPolygon[];
}

/** Anchos estimados por categoría (m): valores típicos de vías rurales, no medidas. */
export const ESTIMATED_WIDTH_M: Readonly<Record<string, number>> = {
  motorway: 14,
  trunk: 10,
  primary: 9,
  secondary: 7,
  tertiary: 6,
  unclassified: 5,
  residential: 5,
  living_street: 4,
  service: 3.5,
  road: 5,
  track: 3,
  grade1: 3.5,
  grade2: 3,
  grade3: 3,
  grade4: 2.5,
  grade5: 2,
  path: 1.2,
  footway: 1.5,
  cycleway: 1.8,
  bridleway: 1.5,
  steps: 1.5,
  pedestrian: 3,
  river: 10,
  stream: 2.5,
  canal: 2.5,
  ditch: 1.2,
  drain: 1.2,
  brook: 1.5,
  rail: 3,
};

const PAVED = new Set([
  'asphalt',
  'paved',
  'concrete',
  'concrete:plates',
  'concrete:lanes',
  'paving_stones',
  'sett',
  'cobblestone',
  'chipseal',
]);
const UNPAVED = new Set([
  'unpaved',
  'ground',
  'dirt',
  'earth',
  'gravel',
  'fine_gravel',
  'compacted',
  'sand',
  'grass',
  'mud',
  'pebblestone',
  'rock',
]);
/** Sin etiqueta `surface`, se supone pavimento solo en las vías principales. */
const PAVED_BY_DEFAULT = new Set([
  'motorway',
  'trunk',
  'primary',
  'motorway_link',
  'trunk_link',
  'primary_link',
]);

function parseWidth(tag: string | undefined): number | null {
  if (tag === undefined) return null;
  const value = Number.parseFloat(tag.replace(',', '.'));
  return Number.isFinite(value) && value >= 0.5 && value <= 40 ? value : null;
}

function toLocal(
  frame: LocalFrame,
  coordinates: readonly (readonly [number, number])[],
): Float32Array {
  const out = new Float32Array(coordinates.length * 2);
  coordinates.forEach(([lon, lat], k) => {
    const { east, north } = frame.toEnu(geoPoint(lat, lon));
    out[k * 2] = east;
    out[k * 2 + 1] = -north;
  });
  return out;
}

export function toLocalFeatures(
  features: readonly WorldFeatureInput[],
  frame: LocalFrame,
): LocalFeatures {
  const lines: LocalLine[] = [];
  const polygons: LocalPolygon[] = [];
  for (const feature of features) {
    const name = feature.tags.name ?? null;
    const intermittent = feature.tags.intermittent === 'yes' || feature.tags.seasonal === 'yes';
    if (feature.geometryType === 'LineString') {
      if (feature.coordinates.length < 2) continue;
      const kind = feature.kind as LineKind;
      const tagged = parseWidth(feature.tags.width);
      const estimate = ESTIMATED_WIDTH_M[feature.subtype] ?? (kind === 'waterway' ? 1.5 : 3);
      let paved: boolean | null = null;
      let surfaceEstimated = false;
      if (kind === 'road' || kind === 'track' || kind === 'path') {
        const surface = feature.tags.surface;
        if (surface !== undefined && PAVED.has(surface)) paved = true;
        else if (surface !== undefined && UNPAVED.has(surface)) paved = false;
        else {
          paved = kind === 'road' && PAVED_BY_DEFAULT.has(feature.subtype);
          surfaceEstimated = true;
        }
      }
      lines.push({
        id: feature.id,
        kind,
        subtype: feature.subtype,
        name,
        points: toLocal(frame, feature.coordinates),
        widthM: tagged ?? estimate,
        widthEstimated: tagged === null,
        paved,
        surfaceEstimated,
        intermittent,
      });
    } else {
      if (feature.coordinates.length < 4) continue;
      const ring = toLocal(frame, feature.coordinates);
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (let k = 0; k < ring.length; k += 2) {
        const x = ring[k] ?? 0;
        const z = ring[k + 1] ?? 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      polygons.push({
        id: feature.id,
        kind: feature.kind as PolygonKind,
        subtype: feature.subtype,
        name,
        ring,
        bounds: [minX, minZ, maxX, maxZ],
        intermittent,
      });
    }
  }
  return { lines, polygons };
}

/** Punto dentro de un polígono (regla par-impar). */
export function pointInRing(ring: Float32Array, x: number, z: number): boolean {
  let inside = false;
  const count = ring.length / 2;
  for (let a = 0, b = count - 1; a < count; b = a++) {
    const xa = ring[a * 2] ?? 0;
    const za = ring[a * 2 + 1] ?? 0;
    const xb = ring[b * 2] ?? 0;
    const zb = ring[b * 2 + 1] ?? 0;
    if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
  }
  return inside;
}

/** Distancia de un punto a un segmento. */
export function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * Orientación dominante de las vías (grados en [0, 90)), ponderada por longitud: orienta el
 * mosaico procedural de campos como el trazado real de la zona. `null` sin vías.
 */
export function dominantOrientationDeg(lines: readonly LocalLine[]): number | null {
  const bins = new Float64Array(90);
  let total = 0;
  for (const line of lines) {
    if (line.kind === 'waterway' || line.kind === 'railway') continue;
    for (let k = 0; k + 3 < line.points.length; k += 2) {
      const dx = (line.points[k + 2] ?? 0) - (line.points[k] ?? 0);
      const dz = (line.points[k + 3] ?? 0) - (line.points[k + 1] ?? 0);
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const angle = ((((Math.atan2(dz, dx) * 180) / Math.PI) % 90) + 90) % 90;
      bins[Math.floor(angle) % 90] = (bins[Math.floor(angle) % 90] ?? 0) + length;
      total += length;
    }
  }
  if (total === 0) return null;
  // Suavizado circular de ±3° para no depender de un solo segmento.
  let best = 0;
  let bestValue = -1;
  for (let b = 0; b < 90; b++) {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += bins[(b + k + 90) % 90] ?? 0;
    if (sum > bestValue) {
      bestValue = sum;
      best = b;
    }
  }
  return best + 0.5;
}
