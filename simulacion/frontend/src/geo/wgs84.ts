/**
 * Elipsoide WGS84 y conversiones entre coordenadas geodésicas y cartesianas geocéntricas (ECEF).
 *
 * Fórmulas estándar (p. ej. NGA TR8350.2, "Department of Defense World Geodetic System 1984").
 * Este módulo no depende de React ni del navegador: también lo usan las herramientas de Node.
 */
import { quantity, type Quantity } from '../domain/units.ts';

/** Semieje mayor y achatamiento del elipsoide WGS84 (NGA TR8350.2). */
export const WGS84 = { a: 6_378_137, f: 1 / 298.257_223_563 } as const;
/** Primera excentricidad al cuadrado. */
export const WGS84_E2 = WGS84.f * (2 - WGS84.f);

const DEG = Math.PI / 180;

/** Punto sobre el elipsoide WGS84 (latitud y longitud geodésicas). */
export interface GeoPoint {
  /** Latitud, positiva al norte, en [-90, 90]. */
  readonly latitude: Quantity<'deg'>;
  /** Longitud, positiva al este, en (-180, 180]. */
  readonly longitude: Quantity<'deg'>;
}

export interface GeodeticPosition extends GeoPoint {
  /** Altura sobre el elipsoide (no sobre el nivel del mar). */
  readonly heightM: Quantity<'m'>;
}

/** Coordenadas cartesianas geocéntricas fijas a la Tierra, en metros. */
export interface Ecef {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function geoPoint(latitude: number, longitude: number): GeoPoint {
  return { latitude: quantity(latitude, 'deg'), longitude: quantity(longitude, 'deg') };
}

/** Normaliza una longitud a (-180, 180]. */
export function normalizeLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function isValidLatitude(latitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(longitude: number): boolean {
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function geodeticToEcef(position: GeodeticPosition): Ecef {
  const phi = position.latitude * DEG;
  const lambda = position.longitude * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = WGS84.a / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const h = position.heightM;
  return {
    x: (n + h) * cosPhi * Math.cos(lambda),
    y: (n + h) * cosPhi * Math.sin(lambda),
    z: (n * (1 - WGS84_E2) + h) * sinPhi,
  };
}

/**
 * ECEF → geodésicas por iteración de punto fijo sobre la latitud (converge a 1e-12 rad en pocas
 * iteraciones cerca de la superficie). La altura se obtiene por la fórmula estable según la
 * latitud para evitar divisiones por cos φ ≈ 0 cerca de los polos.
 */
export function ecefToGeodetic(point: Ecef): GeodeticPosition {
  const { x, y, z } = point;
  const p = Math.hypot(x, y);
  const lambda = Math.atan2(y, x);
  let phi = Math.atan2(z, p * (1 - WGS84_E2));
  for (let iteration = 0; iteration < 10; iteration++) {
    const sinPhi = Math.sin(phi);
    const n = WGS84.a / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
    const next = Math.atan2(z + WGS84_E2 * n * sinPhi, p);
    if (Math.abs(next - phi) < 1e-14) {
      phi = next;
      break;
    }
    phi = next;
  }
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = WGS84.a / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const h = Math.abs(cosPhi) > 0.7 ? p / cosPhi - n : z / sinPhi - n * (1 - WGS84_E2);
  return {
    latitude: quantity(phi / DEG, 'deg'),
    longitude: quantity(lambda / DEG, 'deg'),
    heightM: quantity(h, 'm'),
  };
}
