/**
 * Mapas de mezcla de materiales del terreno y campos de distancia de los elementos geográficos.
 *
 * - `weights`: dos texturas RGBA (8 capas de material del catálogo) derivadas de la cobertura
 *   real (WorldCover), la pendiente real (NASADEM), la región reservada para la granja y el
 *   mosaico procedural de campos.
 * - `fieldInfo`: dirección de los surcos y tono de cada campo (procedural) y la máscara de la
 *   región reservada.
 * - `featureField`: distancias con signo (m) al borde de caminos pavimentados, caminos de
 *   tierra, cauces y superficies de agua de OSM. El sombreador las usa para trazar bordes nítidos
 *   aunque la textura tenga varios metros por texel (la distancia se interpola linealmente).
 */
import type { RectangularRegion } from '../geo/region.ts';
import type { FieldMosaic } from './fields.ts';
import { sampleField } from './fields.ts';
import { type Heightfield, slopeDegAt } from './heightfield.ts';
import { type ClassGrid, classAt, LAND_COVER } from './landcover.ts';
import {
  type LocalFeatures,
  type LocalPolygon,
  pointInPolygon,
  segmentDistance,
} from './features.ts';
import { fbm, hashCoords, unit } from './random.ts';
import type { TerrainRole } from './biome.ts';

/**
 * Funciones de las capas de material del terreno, en el orden de las texturas de array. El
 * material del catálogo de cada función lo decide el bioma de la región (`biome.ts`): p. ej. el
 * «suelo natural» es pajonal seco en el altiplano y pasto verde en los llanos.
 */
export const TERRAIN_LAYERS = [
  { role: 'soil', label: 'Suelo agrícola' },
  { role: 'tilled', label: 'Suelo labrado con surcos' },
  { role: 'path', label: 'Camino de tierra y suelo compactado' },
  { role: 'dryGround', label: 'Suelo seco o arenoso' },
  { role: 'naturalGround', label: 'Suelo con vegetación natural (pasto, pajonal)' },
  { role: 'rock', label: 'Roca y grava (pendientes, cauces)' },
  { role: 'wet', label: 'Barro húmedo (cauces y canales)' },
  { role: 'asphalt', label: 'Asfalto' },
  { role: 'forestFloor', label: 'Hojarasca bajo el dosel' },
  { role: 'snow', label: 'Nieve y hielo' },
] as const satisfies readonly { role: TerrainRole; label: string }[];

export const LAYER = {
  farmSoil: 0,
  furrows: 1,
  dirt: 2,
  dryGround: 3,
  grass: 4,
  stony: 5,
  wetMud: 6,
  asphalt: 7,
  forestFloor: 8,
  snow: 9,
} as const;

/** Número de capas; los pesos se guardan en tres texturas RGBA (la última usa 2 canales). */
export const LAYER_COUNT = TERRAIN_LAYERS.length;

/** Rango de distancias codificado en 8 bits: [−8, 24] m con 0,125 m de resolución. */
export const FIELD_DISTANCE_MIN_M = -8;
export const FIELD_DISTANCE_RANGE_M = 32;

export interface SplatMaps {
  readonly sizeM: number;
  readonly resolution: number;
  readonly texelM: number;
  /** Capas 0–3, 4–7 y 8–9 (RGBA), 8 bits, normalizadas para sumar 255. */
  readonly weightsA: Uint8Array;
  readonly weightsB: Uint8Array;
  readonly weightsC: Uint8Array;
  /** R: surcos transversales (0/255) · G: tono del campo · B: región reservada · A: libre. */
  readonly fieldInfo: Uint8Array;
}

export interface FeatureField {
  readonly sizeM: number;
  readonly resolution: number;
  /** R: pavimento · G: tierra · B: cauce · A: agua. Distancia con signo codificada. */
  readonly data: Uint8Array;
}

export function encodeDistance(distanceM: number): number {
  const t = (distanceM - FIELD_DISTANCE_MIN_M) / FIELD_DISTANCE_RANGE_M;
  return Math.round(Math.min(1, Math.max(0, t)) * 255);
}

export function decodeDistance(value: number): number {
  return (value / 255) * FIELD_DISTANCE_RANGE_M + FIELD_DISTANCE_MIN_M;
}

/** Prueba de pertenencia al rectángulo (girado) de la región, con margen opcional (m). */
export function regionContains(
  region: RectangularRegion,
  x: number,
  z: number,
  marginM = 0,
): boolean {
  const theta = (region.orientationDeg * Math.PI) / 180;
  const east = x;
  const north = -z;
  const along = east * Math.sin(theta) + north * Math.cos(theta);
  const across = east * Math.cos(theta) - north * Math.sin(theta);
  return (
    Math.abs(along) <= region.lengthM / 2 + marginM &&
    Math.abs(across) <= region.widthM / 2 + marginM
  );
}

/** Distancia (m) al borde de la región; negativa dentro. */
export function regionEdgeDistance(region: RectangularRegion, x: number, z: number): number {
  const theta = (region.orientationDeg * Math.PI) / 180;
  const along = x * Math.sin(theta) - z * Math.cos(theta);
  const across = x * Math.cos(theta) + z * Math.sin(theta);
  const dx = Math.abs(across) - region.widthM / 2;
  const dz = Math.abs(along) - region.lengthM / 2;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return outside > 0 ? outside : Math.max(dx, dz);
}

export interface SplatInput {
  readonly sizeM: number;
  readonly texelM: number;
  readonly heightfield: Heightfield;
  readonly landCover: ClassGrid;
  readonly region: RectangularRegion | null;
  readonly mosaic: FieldMosaic;
  readonly features: LocalFeatures | null;
  readonly seed: number;
}

function resolutionFor(sizeM: number, texelM: number): number {
  return Math.min(2048, Math.ceil(sizeM / texelM));
}

/** Pesos de material de un punto según la cobertura, la pendiente y el mosaico de campos. */
export function materialWeights(
  landCover: number,
  slopeDeg: number,
  fieldType: string | null,
  edgeDistanceM: number,
  noise: number,
  out: Float32Array,
): void {
  out.fill(0);
  switch (landCover) {
    case LAND_COVER.crop: {
      // Lindes con hierba: transición gradual de 0,5 a 2,5 m del borde del campo.
      const margin = 0.7 * (1 - Math.min(1, Math.max(0, (edgeDistanceM - 0.5) / 2)));
      if (fieldType === 'furrows') {
        out[LAYER.furrows] = 1;
      } else if (fieldType === 'fallow') {
        out[LAYER.grass] = 0.18 + 0.12 * noise;
        out[LAYER.farmSoil] = 0.82 - 0.12 * noise;
      } else if (fieldType === 'dry') {
        out[LAYER.dryGround] = 0.4;
        out[LAYER.farmSoil] = 0.6;
      } else {
        out[LAYER.farmSoil] = 1;
      }
      if (margin > 0) {
        for (let k = 0; k < out.length; k++) out[k] = (out[k] ?? 0) * (1 - margin);
        out[LAYER.grass] = (out[LAYER.grass] ?? 0) + margin * 0.75;
        out[LAYER.farmSoil] = (out[LAYER.farmSoil] ?? 0) + margin * 0.25;
      }
      break;
    }
    case LAND_COVER.grass:
      out[LAYER.grass] = 0.55 + 0.35 * noise;
      out[LAYER.dryGround] = 0.45 - 0.35 * noise;
      break;
    case LAND_COVER.shrub:
      out[LAYER.grass] = 0.35 + 0.3 * noise;
      out[LAYER.dryGround] = 0.65 - 0.3 * noise;
      break;
    case LAND_COVER.tree:
      // Bajo el dosel: hojarasca con claros de vegetación baja.
      out[LAYER.forestFloor] = 0.6 + 0.25 * noise;
      out[LAYER.grass] = 0.3 - 0.2 * noise;
      out[LAYER.farmSoil] = 0.1;
      break;
    case LAND_COVER.mangrove:
      out[LAYER.forestFloor] = 0.4;
      out[LAYER.wetMud] = 0.6;
      break;
    case LAND_COVER.snow:
      out[LAYER.snow] = 0.85 + 0.15 * noise;
      out[LAYER.stony] = 0.15 - 0.15 * noise;
      break;
    case LAND_COVER.moss:
      out[LAYER.grass] = 0.5;
      out[LAYER.stony] = 0.5;
      break;
    case LAND_COVER.built:
      // Patios y solares de tierra apisonada con algo de hierba (sin modelos de edificios).
      out[LAYER.dirt] = 0.4 + 0.15 * noise;
      out[LAYER.farmSoil] = 0.35;
      out[LAYER.grass] = 0.25 - 0.15 * noise;
      break;
    case LAND_COVER.bare:
      out[LAYER.dryGround] = 0.6 + 0.2 * noise;
      out[LAYER.stony] = 0.4 - 0.2 * noise;
      break;
    case LAND_COVER.water:
    case LAND_COVER.wetland:
      out[LAYER.wetMud] = 0.7;
      out[LAYER.grass] = 0.3;
      break;
    default:
      out[LAYER.dryGround] = 1;
  }
  // Pendientes fuertes: roca y grava (transición entre 22° y 38°).
  const rock = Math.min(1, Math.max(0, (slopeDeg - 22) / 16));
  if (rock > 0) {
    for (let k = 0; k < out.length; k++) out[k] = (out[k] ?? 0) * (1 - rock);
    out[LAYER.stony] = (out[LAYER.stony] ?? 0) + rock;
  }
}

/** Escribe los pesos normalizados (suma 255) del texel `index` en las tres texturas. */
export function packWeights(
  weights: Float32Array,
  index: number,
  a: Uint8Array,
  b: Uint8Array,
  c: Uint8Array,
): void {
  let total = 0;
  for (const w of weights) total += w;
  const scale = total > 0 ? 255 / total : 0;
  for (let k = 0; k < 4; k++) {
    a[index + k] = Math.round((weights[k] ?? 0) * scale);
    b[index + k] = Math.round((weights[k + 4] ?? 0) * scale);
    c[index + k] = Math.round((weights[k + 8] ?? 0) * scale);
  }
}

/** Máscara (1 = dentro) de un conjunto de polígonos sobre la rejilla de texels. */
export function rasterizePolygons(
  polygons: readonly LocalPolygon[],
  resolution: number,
  cell: number,
  origin: number,
): Uint8Array {
  const mask = new Uint8Array(resolution * resolution);
  for (const polygon of polygons) {
    const [minX, minZ, maxX, maxZ] = polygon.bounds;
    const i0 = Math.max(0, Math.floor((minX - origin) / cell));
    const i1 = Math.min(resolution - 1, Math.ceil((maxX - origin) / cell));
    const j0 = Math.max(0, Math.floor((minZ - origin) / cell));
    const j1 = Math.min(resolution - 1, Math.ceil((maxZ - origin) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = origin + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        if (pointInPolygon(polygon, origin + (i + 0.5) * cell, z)) mask[j * resolution + i] = 1;
      }
    }
  }
  return mask;
}

/** Mapas de mezcla de materiales de un área cuadrada centrada en el origen. */
export function buildSplatMaps(input: SplatInput): SplatMaps {
  const resolution = resolutionFor(input.sizeM, input.texelM);
  const texelM = input.sizeM / resolution;
  const origin = -input.sizeM / 2;
  const weightsA = new Uint8Array(resolution * resolution * 4);
  const weightsB = new Uint8Array(resolution * resolution * 4);
  const weightsC = new Uint8Array(resolution * resolution * 4);
  const fieldInfo = new Uint8Array(resolution * resolution * 4);
  const weights = new Float32Array(LAYER_COUNT);
  const buildingMask = rasterizePolygons(
    input.features?.polygons.filter((p) => p.kind === 'building') ?? [],
    resolution,
    texelM,
    origin,
  );
  for (let j = 0; j < resolution; j++) {
    const z = origin + (j + 0.5) * texelM;
    for (let i = 0; i < resolution; i++) {
      const x = origin + (i + 0.5) * texelM;
      const index = (j * resolution + i) * 4;
      const noise = fbm(input.seed, x / 45, z / 45, 3);
      // Bordes de clase orgánicos: se muestrea la cobertura con un desplazamiento de ruido.
      const jitterX = (fbm(input.seed + 17, x / 23, z / 23, 2) - 0.5) * 14;
      const jitterZ = (fbm(input.seed + 29, x / 23, z / 23, 2) - 0.5) * 14;
      const cover = classAt(input.landCover, x + jitterX, z + jitterZ);
      const slope = slopeDegAt(input.heightfield, x, z);
      const reserved = input.region !== null && regionContains(input.region, x, z);
      const field = cover === LAND_COVER.crop && !reserved ? sampleField(input.mosaic, x, z) : null;
      if (reserved) {
        weights.fill(0);
        weights[LAYER.farmSoil] = 1;
      } else {
        materialWeights(
          cover,
          slope,
          field?.type ?? null,
          field?.edgeDistanceM ?? 99,
          noise,
          weights,
        );
      }
      // Huellas de edificaciones de OSM: suelo compactado (no hay modelos de edificios).
      if (buildingMask[j * resolution + i] === 1) {
        weights.fill(0);
        weights[LAYER.dirt] = 0.8;
        weights[LAYER.dryGround] = 0.2;
      }
      packWeights(weights, index, weightsA, weightsB, weightsC);
      if (field !== null) {
        const across = Math.abs(field.furrowAngleRad - input.mosaic.angleRad) > 0.1;
        fieldInfo[index] = across ? 255 : 0;
        fieldInfo[index + 1] = Math.round(
          unit(hashCoords(input.seed, field.row, field.column, 5)) * 255,
        );
      } else {
        fieldInfo[index + 1] = 128;
      }
      if (input.region !== null) {
        const edge = regionEdgeDistance(input.region, x, z);
        fieldInfo[index + 2] = encodeDistance(edge);
      } else {
        fieldInfo[index + 2] = 255;
      }
    }
  }
  // Filtro 3 × 3 de los pesos: suaviza los escalones de las transiciones a la escala del texel.
  smoothWeights(weightsA, resolution);
  smoothWeights(weightsB, resolution);
  smoothWeights(weightsC, resolution);
  return { sizeM: input.sizeM, resolution, texelM, weightsA, weightsB, weightsC, fieldInfo };
}

/** Promedio 3 × 3 (con pesos 1-2-1) de una textura RGBA de 8 bits, en el sitio. */
export function smoothWeights(data: Uint8Array, resolution: number): void {
  const source = data.slice();
  const kernel = [1, 2, 1];
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;
        let weight = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = Math.min(resolution - 1, Math.max(0, j + dj));
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(resolution - 1, Math.max(0, i + di));
            const w = (kernel[di + 1] ?? 1) * (kernel[dj + 1] ?? 1);
            sum += (source[(jj * resolution + ii) * 4 + channel] ?? 0) * w;
            weight += w;
          }
        }
        data[(j * resolution + i) * 4 + channel] = Math.round(sum / weight);
      }
    }
  }
}

/** Campos de distancia con signo de los elementos lineales y de agua de OSM. */
export function buildFeatureField(
  features: LocalFeatures,
  sizeM: number,
  texelM: number,
): FeatureField {
  const resolution = resolutionFor(sizeM, texelM);
  const cell = sizeM / resolution;
  const origin = -sizeM / 2;
  const reach = FIELD_DISTANCE_MIN_M + FIELD_DISTANCE_RANGE_M; // 24 m
  const distances = [0, 1, 2, 3].map(() => new Float32Array(resolution * resolution).fill(reach));

  const stamp = (
    channel: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    halfWidth: number,
  ): void => {
    const target = distances[channel];
    if (target === undefined) return;
    const pad = halfWidth + reach;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - origin) / cell));
    const i1 = Math.min(resolution - 1, Math.ceil((Math.max(ax, bx) + pad - origin) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - pad - origin) / cell));
    const j1 = Math.min(resolution - 1, Math.ceil((Math.max(az, bz) + pad - origin) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = origin + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = origin + (i + 0.5) * cell;
        const d = segmentDistance(x, z, ax, az, bx, bz) - halfWidth;
        const k = j * resolution + i;
        if (d < (target[k] ?? reach)) target[k] = d;
      }
    }
  };

  for (const line of features.lines) {
    let channel: number | null = null;
    const halfWidth = line.widthM / 2;
    if (line.kind === 'road' || line.kind === 'track' || line.kind === 'path') {
      channel = line.paved === true ? 0 : 1;
    } else if (line.kind === 'waterway') {
      channel = 2;
    }
    if (channel === null) continue;
    const points = line.points;
    for (let k = 0; k + 3 < points.length; k += 2) {
      const ax = points[k] ?? 0;
      const az = points[k + 1] ?? 0;
      const bx = points[k + 2] ?? 0;
      const bz = points[k + 3] ?? 0;
      stamp(channel, ax, az, bx, bz, halfWidth);
      // Lámina de agua en cauces permanentes: más estrecha que el cauce.
      if (line.kind === 'waterway' && !line.intermittent) stamp(3, ax, az, bx, bz, halfWidth * 0.6);
    }
  }

  // Superficies de agua (polígonos): distancia con signo al contorno, negativa dentro.
  const water = distances[3];
  for (const polygon of features.polygons) {
    if (polygon.kind !== 'water' || polygon.intermittent || water === undefined) continue;
    const [minX, minZ, maxX, maxZ] = polygon.bounds;
    const i0 = Math.max(0, Math.floor((minX - reach - origin) / cell));
    const i1 = Math.min(resolution - 1, Math.ceil((maxX + reach - origin) / cell));
    const j0 = Math.max(0, Math.floor((minZ - reach - origin) / cell));
    const j1 = Math.min(resolution - 1, Math.ceil((maxZ + reach - origin) / cell));
    const rings = [polygon.ring, ...polygon.holes];
    for (let j = j0; j <= j1; j++) {
      const z = origin + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = origin + (i + 0.5) * cell;
        let edge = Infinity;
        for (const ring of rings) {
          for (let k = 0; k + 3 < ring.length; k += 2) {
            edge = Math.min(
              edge,
              segmentDistance(
                x,
                z,
                ring[k] ?? 0,
                ring[k + 1] ?? 0,
                ring[k + 2] ?? 0,
                ring[k + 3] ?? 0,
              ),
            );
          }
        }
        const signed = pointInPolygon(polygon, x, z) ? -edge : edge;
        const index = j * resolution + i;
        if (signed < (water[index] ?? reach)) water[index] = signed;
      }
    }
  }

  const data = new Uint8Array(resolution * resolution * 4);
  for (let k = 0; k < resolution * resolution; k++) {
    for (let channel = 0; channel < 4; channel++) {
      data[k * 4 + channel] = encodeDistance(distances[channel]?.[k] ?? reach);
    }
  }
  return { sizeM, resolution, data };
}

export interface ContextSplat {
  readonly weightsA: Uint8Array;
  readonly weightsB: Uint8Array;
  readonly weightsC: Uint8Array;
  readonly resolution: number;
  readonly sizeM: number;
}

/** Mapas de mezcla gruesos del contexto: solo cobertura y pendiente. */
export function buildContextSplat(
  heightfield: Heightfield,
  landCover: ClassGrid,
  resolution: number,
  seed: number,
): ContextSplat {
  const sizeM = heightfield.sizeM;
  const texel = sizeM / resolution;
  const origin = -sizeM / 2;
  const weightsA = new Uint8Array(resolution * resolution * 4);
  const weightsB = new Uint8Array(resolution * resolution * 4);
  const weightsC = new Uint8Array(resolution * resolution * 4);
  const weights = new Float32Array(LAYER_COUNT);
  for (let j = 0; j < resolution; j++) {
    const z = origin + (j + 0.5) * texel;
    for (let i = 0; i < resolution; i++) {
      const x = origin + (i + 0.5) * texel;
      const noise = fbm(seed, x / 300, z / 300, 3);
      // Desplazamiento de ruido (±60 m) para que los píxeles de 80 m no formen bloques cuadrados.
      const jx = (fbm(seed + 51, x / 170, z / 170, 2) - 0.5) * 120;
      const jz = (fbm(seed + 53, x / 170, z / 170, 2) - 0.5) * 120;
      const cover = classAt(landCover, x + jx, z + jz);
      // En el contexto los campos se ven de lejos: suelo agrícola con algo de barbecho.
      materialWeights(
        cover,
        slopeDegAt(heightfield, x, z),
        noise > 0.55 ? 'fallow' : 'tilled',
        99,
        noise,
        weights,
      );
      packWeights(weights, (j * resolution + i) * 4, weightsA, weightsB, weightsC);
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    smoothWeights(weightsA, resolution);
    smoothWeights(weightsB, resolution);
    smoothWeights(weightsC, resolution);
  }
  return { weightsA, weightsB, weightsC, resolution, sizeM };
}
