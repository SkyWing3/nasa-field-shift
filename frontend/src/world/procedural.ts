/**
 * Datos **procedurales de demostración** para cuando no se puede acceder a las fuentes reales
 * (sin conexión, servicio caído o región fuera de cobertura). Se generan con ruido fractal a
 * partir de una semilla y se etiquetan siempre en la interfaz como relieve o cobertura
 * demostrativos: no representan la topografía ni el suelo del lugar.
 */
import type { GeoBBox } from './extent.ts';
import type { GeoGrid } from './grid.ts';
import { LAND_COVER } from './landcover.ts';
import { fbm } from './random.ts';

const ARC_SECOND = 1 / 3600;

export function proceduralElevation(
  bbox: GeoBBox,
  seed: number,
  baseM = 2_000,
): GeoGrid<Float32Array> {
  const width = Math.ceil((bbox.east - bbox.west) / ARC_SECOND);
  const height = Math.ceil((bbox.north - bbox.south) / ARC_SECOND);
  const data = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      // Coordenadas en km aproximados: colinas suaves y una sierra en un lado.
      const x = (c * 30) / 1000;
      const y = (r * 30) / 1000;
      const hills = fbm(seed, x / 2.5, y / 2.5, 5) * 120;
      const ridge = Math.max(0, fbm(seed + 9, x / 6, y / 6, 3) - 0.55) * 900;
      data[r * width + c] = baseM + hills + ridge;
    }
  }
  return {
    west: bbox.west,
    north: bbox.north,
    pixelWidth: ARC_SECOND,
    pixelHeight: ARC_SECOND,
    width,
    height,
    data,
  };
}

export function proceduralLandCover(
  bbox: GeoBBox,
  seed: number,
  pixelDeg = ARC_SECOND / 3,
): GeoGrid<Uint8Array> {
  const width = Math.ceil((bbox.east - bbox.west) / pixelDeg);
  const height = Math.ceil((bbox.north - bbox.south) / pixelDeg);
  const data = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const n = fbm(seed + 31, (c * pixelDeg * 111) / 0.8, (r * pixelDeg * 111) / 0.8, 4);
      data[r * width + c] =
        n < 0.45
          ? LAND_COVER.crop
          : n < 0.6
            ? LAND_COVER.grass
            : n < 0.7
              ? LAND_COVER.shrub
              : LAND_COVER.bare;
    }
  }
  return {
    west: bbox.west,
    north: bbox.north,
    pixelWidth: pixelDeg,
    pixelHeight: pixelDeg,
    width,
    height,
    data,
  };
}
