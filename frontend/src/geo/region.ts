/**
 * Región de trabajo rectangular.
 *
 * Se define en metros sobre el plano tangente local de su centro (ancho, largo y orientación), no
 * en grados: así sus lados miden lo que dicen en el terreno a cualquier latitud. Los vértices
 * geográficos se obtienen con la conversión ENU inversa. Las medidas geodésicas (superficie,
 * lados, orientación) están en `metrics.ts`, que depende de GeographicLib.
 */
import { quantity, type Quantity } from '../domain/units.ts';
import { createLocalFrame } from './localFrame.ts';
import { type GeoPoint, geoPoint, isValidLatitude, isValidLongitude } from './wgs84.ts';

/** Lado mínimo y máximo de la región (ADR-029: error del plano tangente despreciable). */
export const REGION_LIMITS = {
  minSideM: 50,
  maxSideM: 5_000,
  /** Límite de latitud de la proyección del mapa (Web Mercator). */
  maxAbsLatitude: 85,
} as const;

export interface RectangularRegion {
  readonly center: GeoPoint;
  /** Extensión perpendicular al eje de orientación (este–oeste con orientación 0°). */
  readonly widthM: Quantity<'m'>;
  /** Extensión a lo largo del eje de orientación (norte–sur con orientación 0°). */
  readonly lengthM: Quantity<'m'>;
  /** Azimut del eje largo, en grados horarios desde el norte verdadero, en [0, 180). */
  readonly orientationDeg: Quantity<'deg'>;
}

export function normalizeOrientation(degrees: number): number {
  return ((degrees % 180) + 180) % 180;
}

export function createRegion(
  center: GeoPoint,
  widthM: number,
  lengthM: number,
  orientationDeg = 0,
): RectangularRegion {
  return {
    center,
    widthM: quantity(widthM, 'm'),
    lengthM: quantity(lengthM, 'm'),
    orientationDeg: quantity(normalizeOrientation(orientationDeg), 'deg'),
  };
}

export type RegionProblem =
  'invalid-center' | 'latitude-out-of-range' | 'side-too-small' | 'side-too-large';

export function validateRegion(region: RectangularRegion): RegionProblem[] {
  const problems: RegionProblem[] = [];
  const { latitude, longitude } = region.center;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) problems.push('invalid-center');
  else if (Math.abs(latitude) > REGION_LIMITS.maxAbsLatitude)
    problems.push('latitude-out-of-range');
  const sides = [region.widthM, region.lengthM];
  if (sides.some((side) => !(side >= REGION_LIMITS.minSideM))) problems.push('side-too-small');
  if (sides.some((side) => side > REGION_LIMITS.maxSideM)) problems.push('side-too-large');
  return problems;
}

export const REGION_PROBLEM_MESSAGES: Readonly<Record<RegionProblem, string>> = {
  'invalid-center': 'Las coordenadas del centro no son válidas.',
  'latitude-out-of-range': `La latitud debe estar entre −${REGION_LIMITS.maxAbsLatitude}° y ${REGION_LIMITS.maxAbsLatitude}°.`,
  'side-too-small': `Cada lado debe medir al menos ${REGION_LIMITS.minSideM} m.`,
  'side-too-large': `Cada lado debe medir como máximo ${REGION_LIMITS.maxSideM.toLocaleString('es-ES')} m.`,
};

/** Vértices en coordenadas locales (este, norte), en el orden SO, SE, NE, NO del rectángulo. */
export function regionCornersEnu(
  region: RectangularRegion,
): readonly (readonly [east: number, north: number])[] {
  const theta = (region.orientationDeg * Math.PI) / 180;
  // Eje largo: azimut θ → (sin θ, cos θ) en (E, N). Eje ancho: 90° a la derecha.
  const along = [Math.sin(theta), Math.cos(theta)] as const;
  const across = [Math.cos(theta), -Math.sin(theta)] as const;
  const halfWidth = region.widthM / 2;
  const halfLength = region.lengthM / 2;
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([w, l]) => [
    w * halfWidth * across[0] + l * halfLength * along[0],
    w * halfWidth * across[1] + l * halfLength * along[1],
  ]);
}

/** Vértices geográficos (SO, SE, NE, NO del rectángulo), sobre el elipsoide. */
export function regionCorners(region: RectangularRegion): readonly GeoPoint[] {
  const frame = createLocalFrame(region.center);
  return regionCornersEnu(region).map(([east, north]) => {
    const position = frame.fromEnu({ east, north, up: 0 });
    return geoPoint(position.latitude, position.longitude);
  });
}

/** Rectángulo alineado al norte que abarca dos esquinas opuestas dibujadas en el mapa. */
export function regionFromDiagonal(first: GeoPoint, second: GeoPoint): RectangularRegion {
  const frame = createLocalFrame(first);
  const b = frame.toEnu(second);
  const centerPosition = frame.fromEnu({ east: b.east / 2, north: b.north / 2, up: 0 });
  return createRegion(
    geoPoint(centerPosition.latitude, centerPosition.longitude),
    Math.abs(b.east),
    Math.abs(b.north),
    0,
  );
}

/** Ajusta lados y latitud a los límites permitidos (para interacciones de arrastre). */
export function clampRegion(region: RectangularRegion): RectangularRegion {
  const clampSide = (value: number) =>
    Math.min(REGION_LIMITS.maxSideM, Math.max(REGION_LIMITS.minSideM, value));
  return createRegion(
    region.center,
    clampSide(region.widthM),
    clampSide(region.lengthM),
    region.orientationDeg,
  );
}
