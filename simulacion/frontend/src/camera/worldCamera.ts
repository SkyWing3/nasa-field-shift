/**
 * Reglas puras de la cámara del mundo: vistas predefinidas, límites y separación del terreno.
 */
import type { RectangularRegion } from '../geo/region.ts';

export type Vec3 = [number, number, number];
export type HeightSampler = (x: number, z: number) => number;

export type WorldViewId = 'aerial' | 'farm' | 'ground';

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
}

export const CAMERA_LIMITS = {
  /** Altura mínima de la cámara sobre el terreno (m). */
  clearanceM: 1.6,
  minDistanceM: 2,
  /** Margen entre el punto de mira y el borde del área de detalle (m). */
  targetMarginM: 60,
} as const;

/** Vistas predefinidas alrededor de la región reservada para la granja. */
export function viewPose(
  view: WorldViewId,
  region: RectangularRegion,
  height: HeightSampler,
): CameraPose {
  const half = Math.max(region.widthM, region.lengthM) / 2;
  const groundY = height(0, 0);
  // Dirección de observación: desde el sur-sureste, con el sol (hemisferio sur) a la espalda.
  const dir: [number, number] = [0.42, 0.91];
  switch (view) {
    case 'aerial': {
      const distance = Math.max(900, half * 5);
      return {
        target: [0, groundY, 0],
        position: [dir[0] * distance * 0.55, groundY + distance * 0.75, dir[1] * distance * 0.55],
      };
    }
    case 'farm': {
      const distance = Math.max(260, half * 2.2);
      return {
        target: [0, groundY, 0],
        position: [dir[0] * distance * 0.8, groundY + distance * 0.42, dir[1] * distance * 0.8],
      };
    }
    case 'ground': {
      // A la altura de los ojos en el borde sur de la región, mirando hacia el centro.
      const x = dir[0] * (half + 25);
      const z = dir[1] * (half + 25);
      return { target: [0, height(0, 0) + 1.6, 0], position: [x, height(x, z) + 1.7, z] };
    }
  }
}

export function clampTarget(target: Vec3, detailHalfM: number): Vec3 {
  const limit = detailHalfM - CAMERA_LIMITS.targetMarginM;
  return [
    Math.min(limit, Math.max(-limit, target[0])),
    target[1],
    Math.min(limit, Math.max(-limit, target[2])),
  ];
}

/**
 * Eleva la cámara si quedaría bajo el terreno, en su posición o en cualquier punto del segmento
 * hasta el punto de mira (así no se mira a través de una ladera). Devuelve la altura corregida.
 */
export function enforceClearance(
  position: Vec3,
  target: Vec3,
  height: HeightSampler,
  clearanceM: number,
): number {
  let y = Math.max(position[1], height(position[0], position[2]) + clearanceM);
  // Hasta 3/4 del recorrido: cerca del punto de mira (que está en el suelo) la recta lo roza.
  for (let k = 1; k <= 6; k++) {
    const t = k / 8;
    const x = position[0] + (target[0] - position[0]) * t;
    const z = position[2] + (target[2] - position[2]) * t;
    const ground = height(x, z) + 0.3;
    const lineY = y + (target[1] - y) * t;
    if (lineY < ground) {
      // Altura mínima de la cámara para que la recta pase por encima de ese punto.
      y = Math.max(y, (ground - target[1] * t) / (1 - t));
    }
  }
  return y;
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Plano cercano según la altura sobre el suelo: precisión de profundidad cerca y lejos. */
export function nearPlaneFor(heightAboveGroundM: number): number {
  return Math.min(4, Math.max(0.08, heightAboveGroundM * 0.04));
}
