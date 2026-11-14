/**
 * Extensión del mundo 3D a partir de la región elegida en el mapa.
 *
 * - **Área de detalle**: cuadrado centrado en el origen del marco local que contiene la región
 *   con un margen. Tiene terreno de alta resolución, materiales, elementos geográficos y
 *   vegetación. Es lo que se puede explorar.
 * - **Contexto**: anillo de relieve real de menor resolución hasta ~15 km del centro, para que el
 *   horizonte muestre las montañas reales en lugar de un borde vacío.
 *
 * La región máxima que admite la generación es menor que la del mapa (5 km): con un margen de
 * 1 km por lado, el área de detalle no supera 6 × 6 km, un límite medido para no saturar la
 * memoria del navegador (malla, mapas de materiales y vegetación).
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import { type RectangularRegion, regionCornersEnu } from '../geo/region.ts';

export const WORLD_LIMITS = {
  chunksPerSide: 8,
  minDetailSizeM: 3_000,
  detailMarginM: 1_000,
  maxDetailSizeM: 6_000,
  detailStepM: 500,
  contextSizeM: 30_000,
  /** Separación de la malla de contexto respecto a la de detalle (entero para que coincidan). */
  contextSpacingFactor: 16,
  /** Margen de los datos pedidos alrededor del área (interpolación bicúbica y bordes). */
  dataPaddingDeg: 0.002,
} as const;

/** Rectángulo geográfico en grados (sur, oeste, norte, este). */
export interface GeoBBox {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export interface WorldExtent {
  /** Lado del área de detalle, centrada en el origen (m). */
  readonly detailSizeM: number;
  readonly chunksPerSide: number;
  readonly chunkSizeM: number;
  /** Semilado del rectángulo que contiene la región (m). */
  readonly regionHalfExtentM: number;
  /** Lado aproximado del contexto (el exacto depende de la resolución de la malla). */
  readonly contextSizeM: number;
  readonly elevationBBox: GeoBBox;
  readonly landcoverDetailBBox: GeoBBox;
  readonly landcoverContextBBox: GeoBBox;
  readonly featuresBBox: GeoBBox;
}

export type ExtentResult =
  | { readonly ok: true; readonly extent: WorldExtent }
  | { readonly ok: false; readonly reason: 'region-too-large'; readonly maxRegionM: number };

/** Lado máximo del rectángulo envolvente de la región para poder generar su mundo 3D. */
export const MAX_GENERATED_REGION_M = WORLD_LIMITS.maxDetailSizeM - 2 * WORLD_LIMITS.detailMarginM;

/** Rectángulo geográfico que contiene un cuadrado ENU centrado en el origen. */
export function squareBBox(frame: LocalFrame, halfSizeM: number, paddingDeg: number): GeoBBox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  // Esquinas y puntos medios: los lados se curvan levemente en coordenadas geográficas.
  for (const fx of [-1, 0, 1]) {
    for (const fy of [-1, 0, 1]) {
      const p = frame.fromEnu({ east: fx * halfSizeM, north: fy * halfSizeM, up: 0 });
      south = Math.min(south, p.latitude);
      north = Math.max(north, p.latitude);
      west = Math.min(west, p.longitude);
      east = Math.max(east, p.longitude);
    }
  }
  return {
    south: Math.max(-90, south - paddingDeg),
    west: Math.max(-180, west - paddingDeg),
    north: Math.min(90, north + paddingDeg),
    east: Math.min(180, east + paddingDeg),
  };
}

export function computeWorldExtent(region: RectangularRegion, frame: LocalFrame): ExtentResult {
  const corners = regionCornersEnu(region);
  const regionHalfExtentM = Math.max(...corners.flatMap(([e, n]) => [Math.abs(e), Math.abs(n)]));
  const needed = 2 * (regionHalfExtentM + WORLD_LIMITS.detailMarginM);
  if (needed > WORLD_LIMITS.maxDetailSizeM + 1e-6) {
    return { ok: false, reason: 'region-too-large', maxRegionM: MAX_GENERATED_REGION_M };
  }
  const detailSizeM = Math.max(
    WORLD_LIMITS.minDetailSizeM,
    Math.ceil(needed / WORLD_LIMITS.detailStepM) * WORLD_LIMITS.detailStepM,
  );
  const pad = WORLD_LIMITS.dataPaddingDeg;
  const detailBBox = squareBBox(frame, detailSizeM / 2, pad);
  // El contexto real puede superar 16 km en una celda de la malla gruesa por lado.
  const contextBBox = squareBBox(frame, WORLD_LIMITS.contextSizeM / 2 + 400, pad);
  return {
    ok: true,
    extent: {
      detailSizeM,
      chunksPerSide: WORLD_LIMITS.chunksPerSide,
      chunkSizeM: detailSizeM / WORLD_LIMITS.chunksPerSide,
      regionHalfExtentM,
      contextSizeM: WORLD_LIMITS.contextSizeM,
      elevationBBox: contextBBox,
      landcoverDetailBBox: detailBBox,
      landcoverContextBBox: contextBBox,
      featuresBBox: detailBBox,
    },
  };
}
