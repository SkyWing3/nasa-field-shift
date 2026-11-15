/**
 * Distribución procedural de la vegetación y los elementos dispersos.
 *
 * **Dato real**: la clase de cobertura (ESA WorldCover), la pendiente (NASADEM), los caminos,
 * cauces, agua, edificaciones y huertos (OSM) y la región reservada para la granja.
 * **Procedural**: la posición, el giro, la escala y el modelo de cada planta, generados con una
 * semilla dentro de las zonas que los datos permiten. Nunca se coloca vegetación sobre caminos,
 * agua, edificaciones conocidas ni dentro de la región reservada para las parcelas.
 *
 * Todas las decisiones dependen solo de la semilla y de coordenadas enteras: el resultado es
 * reproducible y cada celda cercana a la cámara se puede generar por separado.
 */
import type { RectangularRegion } from '../geo/region.ts';
import type { FieldMosaic } from './fields.ts';
import { sampleField } from './fields.ts';
import type { LocalFeatures } from './features.ts';
import { pointInRing } from './features.ts';
import { type Heightfield, heightAt, slopeDegAt } from './heightfield.ts';
import { type ClassGrid, classAt, LAND_COVER } from './landcover.ts';
import { hashCoords, unit } from './random.ts';
import { decodeDistance, type FeatureField, regionContains } from './splat.ts';
import { pickModel, SPECIES, type SpeciesConfig, type SpeciesId } from './vegetationSpecies.ts';

/** Datos por instancia: x, y, z, giro (rad), escala, índice de modelo. */
export const INSTANCE_STRIDE = 6;

export interface InstanceSet {
  readonly species: SpeciesId;
  readonly count: number;
  readonly data: Float32Array;
  readonly cellSizeM: number;
  readonly cellsPerSide: number;
  readonly origin: number;
  /** Índice de la primera instancia de cada celda (ordenadas por celda); longitud celdas² + 1. */
  readonly cellStart: Uint32Array;
}

export interface ScatterContext {
  readonly seed: number;
  readonly sizeM: number;
  readonly heightfield: Heightfield;
  readonly landCover: ClassGrid;
  readonly featureField: FeatureField | null;
  /** Máscara de edificaciones (1 = edificio) con la resolución del campo de elementos. */
  readonly buildingMask: Uint8Array | null;
  readonly region: RectangularRegion | null;
  readonly mosaic: FieldMosaic;
  readonly features: LocalFeatures | null;
  readonly density: number;
}

const FAR = 1e3;

function fieldDistance(ctx: ScatterContext, channel: number, x: number, z: number): number {
  const field = ctx.featureField;
  if (field === null) return FAR;
  const cell = field.sizeM / field.resolution;
  const i = Math.floor((x + field.sizeM / 2) / cell);
  const j = Math.floor((z + field.sizeM / 2) / cell);
  if (i < 0 || j < 0 || i >= field.resolution || j >= field.resolution) return FAR;
  return decodeDistance(field.data[(j * field.resolution + i) * 4 + channel] ?? 255);
}

/** Distancia (m) al borde del camino más cercano (pavimentado o de tierra). */
export function roadDistance(ctx: ScatterContext, x: number, z: number): number {
  return Math.min(fieldDistance(ctx, 0, x, z), fieldDistance(ctx, 1, x, z));
}

export function bedDistance(ctx: ScatterContext, x: number, z: number): number {
  return fieldDistance(ctx, 2, x, z);
}

export function waterDistance(ctx: ScatterContext, x: number, z: number): number {
  return fieldDistance(ctx, 3, x, z);
}

export function isBuilding(ctx: ScatterContext, x: number, z: number): boolean {
  const field = ctx.featureField;
  const mask = ctx.buildingMask;
  if (field === null || mask === null) return false;
  const cell = field.sizeM / field.resolution;
  const i = Math.floor((x + field.sizeM / 2) / cell);
  const j = Math.floor((z + field.sizeM / 2) / cell);
  if (i < 0 || j < 0 || i >= field.resolution || j >= field.resolution) return false;
  return mask[j * field.resolution + i] === 1;
}

/** ¿Está prohibido colocar algo en (x, z) con un margen libre `clearanceM`? */
export function isBlocked(ctx: ScatterContext, x: number, z: number, clearanceM: number): boolean {
  const half = ctx.sizeM / 2;
  if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) return true;
  if (ctx.region !== null && regionContains(ctx.region, x, z, clearanceM)) return true;
  if (roadDistance(ctx, x, z) < clearanceM) return true;
  if (waterDistance(ctx, x, z) < clearanceM) return true;
  if (bedDistance(ctx, x, z) < Math.min(clearanceM, 0.4)) return true;
  if (
    isBuilding(ctx, x, z) ||
    isBuilding(ctx, x + clearanceM, z) ||
    isBuilding(ctx, x - clearanceM, z) ||
    isBuilding(ctx, x, z + clearanceM) ||
    isBuilding(ctx, x, z - clearanceM)
  ) {
    return true;
  }
  return false;
}

class InstanceWriter {
  private readonly values: number[] = [];
  private readonly ctx: ScatterContext;
  private readonly species: SpeciesConfig;

  constructor(ctx: ScatterContext, species: SpeciesConfig) {
    this.ctx = ctx;
    this.species = species;
  }

  add(x: number, z: number, hash: number, scaleFactor = 1): void {
    const [smin, smax] = this.species.scaleRange;
    const scale = (smin + (smax - smin) * unit(hashCoords(hash, 1))) * scaleFactor;
    const y = heightAt(this.ctx.heightfield, x, z) - this.species.sinkM * scale;
    this.values.push(
      x,
      y,
      z,
      unit(hashCoords(hash, 2)) * Math.PI * 2,
      scale,
      pickModel(this.species, unit(hashCoords(hash, 3))),
    );
  }

  get count(): number {
    return this.values.length / INSTANCE_STRIDE;
  }

  build(cellSizeM: number): InstanceSet {
    return groupByCell(this.species.id, Float32Array.from(this.values), this.ctx.sizeM, cellSizeM);
  }
}

/** Ordena las instancias por celda de una rejilla para seleccionarlas por zonas visibles. */
export function groupByCell(
  species: SpeciesId,
  data: Float32Array,
  sizeM: number,
  cellSizeM: number,
): InstanceSet {
  const cellsPerSide = Math.ceil(sizeM / cellSizeM);
  const origin = -(cellsPerSide * cellSizeM) / 2;
  const count = data.length / INSTANCE_STRIDE;
  const cellOf = new Uint32Array(count);
  const counts = new Uint32Array(cellsPerSide * cellsPerSide + 1);
  for (let k = 0; k < count; k++) {
    const i = Math.min(
      cellsPerSide - 1,
      Math.max(0, Math.floor(((data[k * INSTANCE_STRIDE] ?? 0) - origin) / cellSizeM)),
    );
    const j = Math.min(
      cellsPerSide - 1,
      Math.max(0, Math.floor(((data[k * INSTANCE_STRIDE + 2] ?? 0) - origin) / cellSizeM)),
    );
    const cell = j * cellsPerSide + i;
    cellOf[k] = cell;
    counts[cell + 1] = (counts[cell + 1] ?? 0) + 1;
  }
  const cellStart = new Uint32Array(cellsPerSide * cellsPerSide + 1);
  for (let c = 0; c < cellsPerSide * cellsPerSide; c++)
    cellStart[c + 1] = (cellStart[c] ?? 0) + (counts[c + 1] ?? 0);
  const cursor = cellStart.slice(0, -1);
  const sorted = new Float32Array(data.length);
  for (let k = 0; k < count; k++) {
    const cell = cellOf[k] ?? 0;
    const target = cursor[cell] ?? 0;
    cursor[cell] = target + 1;
    sorted.set(
      data.subarray(k * INSTANCE_STRIDE, (k + 1) * INSTANCE_STRIDE),
      target * INSTANCE_STRIDE,
    );
  }
  return { species, count, data: sorted, cellSizeM, cellsPerSide, origin, cellStart };
}

/** Recorre una rejilla con desplazamiento aleatorio dentro de cada celda. */
function jitteredGrid(
  seed: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  spacing: number,
  visit: (x: number, z: number, hash: number) => void,
): void {
  const i0 = Math.floor(x0 / spacing);
  const i1 = Math.ceil(x1 / spacing);
  const j0 = Math.floor(z0 / spacing);
  const j1 = Math.ceil(z1 / spacing);
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const hash = hashCoords(seed, i, j);
      const x = (i + unit(hashCoords(hash, 10))) * spacing;
      const z = (j + unit(hashCoords(hash, 11))) * spacing;
      if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
      visit(x, z, hash);
    }
  }
}

function accept(hash: number, probability: number): boolean {
  return unit(hashCoords(hash, 4)) < probability;
}

/** Árboles: cobertura arbórea, huertos de OSM, zonas habitadas, lindes de cauces y pastizal. */
export function scatterTrees(ctx: ScatterContext): InstanceSet {
  const writer = new InstanceWriter(ctx, SPECIES.tree);
  const half = ctx.sizeM / 2;
  const seed = ctx.seed + 101;
  const d = ctx.density;
  jitteredGrid(seed, -half, -half, half, half, 7, (x, z, hash) => {
    const cover = classAt(ctx.landCover, x, z);
    const p =
      cover === LAND_COVER.tree
        ? 0.55
        : cover === LAND_COVER.built
          ? 0.06
          : cover === LAND_COVER.grass
            ? 0.008
            : 0;
    if (
      p > 0 &&
      accept(hash, p * d) &&
      !isBlocked(ctx, x, z, 3) &&
      slopeDegAt(ctx.heightfield, x, z) < 35
    ) {
      writer.add(x, z, hash);
    }
  });
  // Huertos declarados en OSM: filas regulares de árboles más pequeños.
  for (const polygon of ctx.features?.polygons ?? []) {
    if (polygon.kind !== 'landuse' || polygon.subtype !== 'orchard') continue;
    const [minX, minZ, maxX, maxZ] = polygon.bounds;
    for (let z = Math.ceil(minZ / 6) * 6; z <= maxZ; z += 6) {
      for (let x = Math.ceil(minX / 5) * 5; x <= maxX; x += 5) {
        const hash = hashCoords(seed + 7, Math.round(x), Math.round(z));
        const jx = x + (unit(hashCoords(hash, 12)) - 0.5) * 0.8;
        const jz = z + (unit(hashCoords(hash, 13)) - 0.5) * 0.8;
        if (!pointInRing(polygon.ring, jx, jz) || !accept(hash, 0.85) || isBlocked(ctx, jx, jz, 2))
          continue;
        writer.add(jx, jz, hash, 0.55);
      }
    }
  }
  // Árboles aislados en las orillas de canales y arroyos (frecuentes en el valle; procedural).
  for (const line of ctx.features?.lines ?? []) {
    if (line.kind !== 'waterway') continue;
    const points = line.points;
    for (let k = 0; k + 3 < points.length; k += 2) {
      const ax = points[k] ?? 0;
      const az = points[k + 1] ?? 0;
      const bx = points[k + 2] ?? 0;
      const bz = points[k + 3] ?? 0;
      const length = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < length; s += 10) {
        const hash = hashCoords(
          seed + 13,
          Math.round(ax + ((bx - ax) * s) / length),
          Math.round(az + ((bz - az) * s) / length),
        );
        if (!accept(hash, 0.07 * d)) continue;
        const side = unit(hashCoords(hash, 14)) < 0.5 ? -1 : 1;
        const offset = line.widthM / 2 + 2.5;
        const nx = (-(bz - az) / length) * offset * side;
        const nz = ((bx - ax) / length) * offset * side;
        const x = ax + ((bx - ax) * s) / length + nx;
        const z = az + ((bz - az) * s) / length + nz;
        if (!isBlocked(ctx, x, z, 2)) writer.add(x, z, hash);
      }
    }
  }
  return writer.build(64);
}

export function scatterShrubs(ctx: ScatterContext): InstanceSet {
  const writer = new InstanceWriter(ctx, SPECIES.shrub);
  const half = ctx.sizeM / 2;
  const d = ctx.density;
  jitteredGrid(ctx.seed + 202, -half, -half, half, half, 4.5, (x, z, hash) => {
    const cover = classAt(ctx.landCover, x, z);
    let p = 0;
    if (cover === LAND_COVER.shrub) p = 0.32;
    else if (cover === LAND_COVER.grass) p = 0.05;
    else if (cover === LAND_COVER.bare) p = 0.03;
    else if (cover === LAND_COVER.tree) p = 0.15;
    else if (cover === LAND_COVER.crop && sampleField(ctx.mosaic, x, z).edgeDistanceM < 1.5)
      p = 0.03;
    const bed = bedDistance(ctx, x, z);
    if (bed > 0.5 && bed < 2.5) p = Math.max(p, 0.16);
    if (p === 0 || !accept(hash, p * d) || isBlocked(ctx, x, z, 1)) return;
    writer.add(x, z, hash);
  });
  return writer.build(64);
}

export function scatterRocks(ctx: ScatterContext): InstanceSet {
  const writer = new InstanceWriter(ctx, SPECIES.rock);
  const half = ctx.sizeM / 2;
  const d = ctx.density;
  jitteredGrid(ctx.seed + 303, -half, -half, half, half, 7, (x, z, hash) => {
    const cover = classAt(ctx.landCover, x, z);
    const slope = slopeDegAt(ctx.heightfield, x, z);
    let p =
      cover === LAND_COVER.bare
        ? 0.07
        : cover === LAND_COVER.shrub
          ? 0.02
          : cover === LAND_COVER.grass
            ? 0.006
            : 0;
    if (slope > 18) p = Math.max(p, Math.min(0.25, (slope - 18) / 60));
    if (p === 0 || !accept(hash, p * d) || isBlocked(ctx, x, z, 1)) return;
    writer.add(x, z, hash);
  });
  return writer.build(64);
}

/** Tocones y ramas: alrededor de algunos árboles y dispersos en el matorral. */
export function scatterDebris(ctx: ScatterContext, trees: InstanceSet): InstanceSet {
  const writer = new InstanceWriter(ctx, SPECIES.debris);
  for (let k = 0; k < trees.count; k++) {
    const tx = trees.data[k * INSTANCE_STRIDE] ?? 0;
    const tz = trees.data[k * INSTANCE_STRIDE + 2] ?? 0;
    const hash = hashCoords(ctx.seed + 404, Math.round(tx * 10), Math.round(tz * 10));
    if (!accept(hash, 0.22)) continue;
    const angle = unit(hashCoords(hash, 20)) * Math.PI * 2;
    const r = 2 + unit(hashCoords(hash, 21)) * 3;
    const x = tx + Math.cos(angle) * r;
    const z = tz + Math.sin(angle) * r;
    if (!isBlocked(ctx, x, z, 0.5)) writer.add(x, z, hash);
  }
  const half = ctx.sizeM / 2;
  jitteredGrid(ctx.seed + 405, -half, -half, half, half, 20, (x, z, hash) => {
    if (classAt(ctx.landCover, x, z) !== LAND_COVER.shrub) return;
    if (accept(hash, 0.05 * ctx.density) && !isBlocked(ctx, x, z, 0.5)) writer.add(x, z, hash);
  });
  return writer.build(64);
}

/** Probabilidad de pasto o maleza en un punto según la cobertura y los bordes reales. */
function groundCoverProbability(
  ctx: ScatterContext,
  species: 'grass' | 'weed',
  x: number,
  z: number,
): number {
  const cover = classAt(ctx.landCover, x, z);
  const road = roadDistance(ctx, x, z);
  const bed = bedDistance(ctx, x, z);
  const verge = road > 0.3 && road < 2.2;
  const bank = bed > 0.2 && bed < 2.5;
  let p: number;
  if (species === 'grass') {
    p =
      cover === LAND_COVER.grass
        ? 0.9
        : cover === LAND_COVER.shrub
          ? 0.6
          : cover === LAND_COVER.tree
            ? 0.7
            : cover === LAND_COVER.bare
              ? 0.12
              : cover === LAND_COVER.built
                ? 0.05
                : 0;
    if (cover === LAND_COVER.crop)
      p = sampleField(ctx.mosaic, x, z).edgeDistanceM < 1.3 ? 0.8 : 0.015;
    if (verge) p = Math.max(p, 0.55);
    if (bank) p = Math.max(p, 0.85);
  } else {
    p = cover === LAND_COVER.grass ? 0.08 : cover === LAND_COVER.shrub ? 0.06 : 0;
    if (cover === LAND_COVER.crop && sampleField(ctx.mosaic, x, z).edgeDistanceM < 1.5) p = 0.25;
    if (verge) p = Math.max(p, 0.2);
    if (bank) p = Math.max(p, 0.3);
  }
  return p;
}

/**
 * Pasto o maleza de una celda cuadrada (cx, cz) de lado `cellSizeM`, generada bajo demanda cerca
 * de la cámara. Devuelve las instancias (formato `INSTANCE_STRIDE`).
 */
export function scatterGroundCoverCell(
  ctx: ScatterContext,
  species: 'grass' | 'weed',
  cx: number,
  cz: number,
  cellSizeM: number,
  densityPerM2: number,
): Float32Array {
  const config = SPECIES[species];
  const writer = new InstanceWriter(ctx, config);
  const spacing = species === 'grass' ? 1 / Math.sqrt(Math.max(densityPerM2, 0.05)) : 2.2;
  const x0 = cx * cellSizeM;
  const z0 = cz * cellSizeM;
  jitteredGrid(
    ctx.seed + (species === 'grass' ? 505 : 606),
    x0,
    z0,
    x0 + cellSizeM,
    z0 + cellSizeM,
    spacing,
    (x, z, hash) => {
      const p = groundCoverProbability(ctx, species, x, z);
      if (p > 0 && accept(hash, p) && !isBlocked(ctx, x, z, 0.3)) writer.add(x, z, hash);
    },
  );
  return writer.build(cellSizeM).data;
}

export interface FarScatter {
  readonly tree: InstanceSet;
  readonly shrub: InstanceSet;
  readonly rock: InstanceSet;
  readonly debris: InstanceSet;
}

/** Los cuatro conjuntos de instancias del área de detalle, en orden fijo. */
export function farSets(far: FarScatter): InstanceSet[] {
  return [far.tree, far.shrub, far.rock, far.debris];
}

export function scatterFarVegetation(ctx: ScatterContext): FarScatter {
  const tree = scatterTrees(ctx);
  return {
    tree,
    shrub: scatterShrubs(ctx),
    rock: scatterRocks(ctx),
    debris: scatterDebris(ctx, tree),
  };
}
