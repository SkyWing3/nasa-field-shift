/**
 * Color real del terreno a partir de la imagen satelital Sentinel-2 cloudless 2016 (EOX,
 * CC BY 4.0), servida por el backend con caché.
 *
 * - Hilo principal: se descargan los mosaicos Web Mercator (zoom 14 en el área de detalle,
 *   ~9 m/píxel; zoom 12 en el contexto, ~36 m/píxel) y se componen en una imagen RGBA.
 * - Worker: la imagen se remuestrea a una textura alineada con el marco local (este-norte), con
 *   la misma convención que los mapas de mezcla del terreno.
 *
 * El canal alfa marca la cobertura: 0 donde falta un mosaico (océano o error), y el sombreador
 * usa entonces solo los materiales PBR.
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import type { GeoBBox } from './extent.ts';

export const TILE_PX = 256;
export const DETAIL_IMAGERY_ZOOM = 14;
export const CONTEXT_IMAGERY_ZOOM = 12;
/** Límite de mosaicos por imagen (tamaño del área de contexto con margen). */
export const MAX_IMAGERY_TILES = 64;

export interface ImageryMosaic {
  readonly zoom: number;
  readonly x0: number;
  readonly y0: number;
  readonly tilesX: number;
  readonly tilesY: number;
  /** RGBA (sRGB) de `tilesX · 256` × `tilesY · 256` píxeles; alfa 0 donde falta el mosaico. */
  readonly rgba: Uint8ClampedArray;
  readonly tilesLoaded: number;
  readonly tilesMissing: number;
}

export interface ImageryTexture {
  readonly sizeM: number;
  readonly resolution: number;
  /** RGBA (sRGB, alfa = cobertura); fila j ↔ z = −size/2 + (j + ½)·texel, como los mapas de mezcla. */
  readonly data: Uint8Array;
  readonly zoom: number;
}

/** Coordenada X de mosaico (fraccionaria) de una longitud. */
export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

/** Coordenada Y de mosaico (fraccionaria) de una latitud (Web Mercator). */
export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export interface TileRange {
  readonly zoom: number;
  readonly x0: number;
  readonly y0: number;
  readonly tilesX: number;
  readonly tilesY: number;
}

export function imageryTileRange(bbox: GeoBBox, zoom: number): TileRange {
  const n = 2 ** zoom;
  const clamp = (v: number): number => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const x0 = clamp(lonToTileX(bbox.west, zoom));
  const x1 = clamp(lonToTileX(bbox.east, zoom));
  const y0 = clamp(latToTileY(bbox.north, zoom));
  const y1 = clamp(latToTileY(bbox.south, zoom));
  return { zoom, x0, y0, tilesX: x1 - x0 + 1, tilesY: y1 - y0 + 1 };
}

/** Descarga y compone los mosaicos de un área. `loadTile` devuelve `null` si no existe. */
export async function fetchImageryMosaic(
  range: TileRange,
  loadTile: (z: number, x: number, y: number) => Promise<Blob | null>,
): Promise<ImageryMosaic> {
  if (range.tilesX * range.tilesY > MAX_IMAGERY_TILES) {
    throw new Error('El área necesita demasiados mosaicos de imagen satelital');
  }
  const width = range.tilesX * TILE_PX;
  const height = range.tilesY * TILE_PX;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('OffscreenCanvas 2D no disponible');
  let loaded = 0;
  let missing = 0;
  const jobs: Promise<void>[] = [];
  for (let ty = 0; ty < range.tilesY; ty++) {
    for (let tx = 0; tx < range.tilesX; tx++) {
      jobs.push(
        (async () => {
          const blob = await loadTile(range.zoom, range.x0 + tx, range.y0 + ty).catch(() => null);
          if (blob === null || blob.size === 0) {
            missing++;
            return;
          }
          try {
            const bitmap = await createImageBitmap(blob);
            context.drawImage(bitmap, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
            bitmap.close();
            loaded++;
          } catch {
            missing++;
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);
  return {
    ...range,
    rgba: context.getImageData(0, 0, width, height).data,
    tilesLoaded: loaded,
    tilesMissing: missing,
  };
}

function sampleMosaic(mosaic: ImageryMosaic, px: number, py: number, out: Float32Array): void {
  const width = mosaic.tilesX * TILE_PX;
  const height = mosaic.tilesY * TILE_PX;
  const x = Math.min(width - 1.001, Math.max(0, px - 0.5));
  const y = Math.min(height - 1.001, Math.max(0, py - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const data = mosaic.rgba;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * width + x0) * 4 + c] ?? 0;
    const b = data[(y0 * width + x0 + 1) * 4 + c] ?? 0;
    const d = data[((y0 + 1) * width + x0) * 4 + c] ?? 0;
    const e = data[((y0 + 1) * width + x0 + 1) * 4 + c] ?? 0;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
}

/**
 * Remuestrea la imagen a un cuadrado de `sizeM` centrado en el origen del marco local. Las
 * coordenadas geográficas se calculan exactas en una rejilla de 33 × 33 y se interpolan entre
 * ellas (el error es de milímetros en 30 km).
 */
export function resampleImagery(
  mosaic: ImageryMosaic,
  frame: LocalFrame,
  sizeM: number,
  resolution: number,
): ImageryTexture {
  const knots = 33;
  const lonGrid = new Float64Array(knots * knots);
  const latGrid = new Float64Array(knots * knots);
  for (let j = 0; j < knots; j++) {
    for (let i = 0; i < knots; i++) {
      const east = -sizeM / 2 + (i / (knots - 1)) * sizeM;
      const north = sizeM / 2 - (j / (knots - 1)) * sizeM; // fila j ↔ z creciente = sur
      const geo = frame.fromEnu({ east, north, up: 0 });
      lonGrid[j * knots + i] = geo.longitude;
      latGrid[j * knots + i] = geo.latitude;
    }
  }
  const data = new Uint8Array(resolution * resolution * 4);
  const pixel = new Float32Array(4);
  for (let j = 0; j < resolution; j++) {
    const gv = ((j + 0.5) / resolution) * (knots - 1);
    const kj = Math.min(knots - 2, Math.floor(gv));
    const fj = gv - kj;
    for (let i = 0; i < resolution; i++) {
      const gu = ((i + 0.5) / resolution) * (knots - 1);
      const ki = Math.min(knots - 2, Math.floor(gu));
      const fi = gu - ki;
      const lerp = (grid: Float64Array): number => {
        const a = grid[kj * knots + ki] ?? 0;
        const b = grid[kj * knots + ki + 1] ?? 0;
        const c = grid[(kj + 1) * knots + ki] ?? 0;
        const d = grid[(kj + 1) * knots + ki + 1] ?? 0;
        return (a * (1 - fi) + b * fi) * (1 - fj) + (c * (1 - fi) + d * fi) * fj;
      };
      const px = (lonToTileX(lerp(lonGrid), mosaic.zoom) - mosaic.x0) * TILE_PX;
      const py = (latToTileY(lerp(latGrid), mosaic.zoom) - mosaic.y0) * TILE_PX;
      const index = (j * resolution + i) * 4;
      if (px < 0 || py < 0 || px > mosaic.tilesX * TILE_PX || py > mosaic.tilesY * TILE_PX) {
        continue; // fuera de la imagen: alfa 0
      }
      sampleMosaic(mosaic, px, py, pixel);
      data[index] = Math.round(pixel[0] ?? 0);
      data[index + 1] = Math.round(pixel[1] ?? 0);
      data[index + 2] = Math.round(pixel[2] ?? 0);
      data[index + 3] = Math.round(pixel[3] ?? 0);
    }
  }
  return { sizeM, resolution, data, zoom: mosaic.zoom };
}
