import type { Quantity } from '../domain';

export type Vector3Tuple = [x: number, y: number, z: number];

const DEG_TO_RAD = Math.PI / 180;

/**
 * Vector unitario que apunta desde el origen hacia el Sol.
 *
 * - Elevación: ángulo sobre el horizonte (0° horizonte, 90° cenit).
 * - Azimut: medido desde el norte en sentido horario (90° = este).
 *
 * Ejes de la escena (convención de Three.js usada en todo el proyecto):
 * +X = este, +Y = arriba, −Z = norte.
 */
export function sunDirection(elevation: Quantity<'deg'>, azimuth: Quantity<'deg'>): Vector3Tuple {
  const el = elevation * DEG_TO_RAD;
  const az = azimuth * DEG_TO_RAD;
  const horizontal = Math.cos(el);
  return [horizontal * Math.sin(az), Math.sin(el), -horizontal * Math.cos(az)];
}
