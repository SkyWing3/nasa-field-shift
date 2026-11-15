/**
 * Cobertura del suelo (ESA WorldCover 2021) remuestreada a una rejilla del marco local.
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import { type GeoGrid, sampleNearest } from './grid.ts';

/** Códigos de clase de ESA WorldCover v200. */
export const LAND_COVER = {
  tree: 10,
  shrub: 20,
  grass: 30,
  crop: 40,
  built: 50,
  bare: 60,
  snow: 70,
  water: 80,
  wetland: 90,
  mangrove: 95,
  moss: 100,
} as const;

export const LAND_COVER_LABELS: Readonly<Record<number, string>> = {
  10: 'Árboles',
  20: 'Arbustos',
  30: 'Pastizal',
  40: 'Cultivos',
  50: 'Construido',
  60: 'Suelo desnudo o vegetación escasa',
  70: 'Nieve y hielo',
  80: 'Agua permanente',
  90: 'Humedal herbáceo',
  95: 'Manglar',
  100: 'Musgos y líquenes',
};

/** Rejilla cuadrada centrada en el origen; celda (i, j) con centro en (originX + (i+½)·cellM, …). */
export interface ClassGrid {
  readonly sizeM: number;
  readonly cells: number;
  readonly cellM: number;
  readonly originX: number;
  readonly originZ: number;
  readonly data: Uint8Array;
}

export function resampleLandCover(
  grid: GeoGrid<Uint8Array>,
  frame: LocalFrame,
  sizeM: number,
  cellM: number,
): ClassGrid {
  const cells = Math.ceil(sizeM / cellM);
  const origin = -(cells * cellM) / 2;
  const data = new Uint8Array(cells * cells);
  for (let j = 0; j < cells; j++) {
    const z = origin + (j + 0.5) * cellM;
    for (let i = 0; i < cells; i++) {
      const x = origin + (i + 0.5) * cellM;
      const p = frame.fromEnu({ east: x, north: -z, up: 0 });
      data[j * cells + i] = sampleNearest(grid, p.latitude, p.longitude);
    }
  }
  return { sizeM: cells * cellM, cells, cellM, originX: origin, originZ: origin, data };
}

export function classAt(grid: ClassGrid, x: number, z: number): number {
  const i = Math.floor((x - grid.originX) / grid.cellM);
  const j = Math.floor((z - grid.originZ) / grid.cellM);
  if (i < 0 || j < 0 || i >= grid.cells || j >= grid.cells) return 0;
  return grid.data[j * grid.cells + i] ?? 0;
}

/** Fracción de cada clase (para el panel de datos). */
export function classShares(grid: ClassGrid): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of grid.data) counts.set(value, (counts.get(value) ?? 0) + 1);
  const shares = new Map<number, number>();
  for (const [code, count] of counts) shares.set(code, count / grid.data.length);
  return shares;
}
