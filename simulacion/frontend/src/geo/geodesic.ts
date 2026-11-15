/**
 * Medidas geodésicas sobre el elipsoide WGS84 con GeographicLib (C. F. F. Karney, "Algorithms
 * for geodesics", J. Geodesy 87, 43–55, 2013; doi:10.1007/s00190-012-0578-z). Distancias con
 * error de nanómetros y áreas de polígonos geodésicos exactas para el elipsoide.
 */
// Módulo UMD/CommonJS: la importación por defecto funciona igual en Vite, Vitest y Node.
import geographiclib from 'geographiclib-geodesic';

import { quantity, type Quantity } from '../domain/units.ts';
import type { GeoPoint } from './wgs84.ts';

const WGS84_GEODESIC = geographiclib.Geodesic.WGS84;

export interface GeodesicSegment {
  readonly distanceM: Quantity<'m'>;
  /** Azimut inicial, en grados horarios desde el norte verdadero, en [0, 360). */
  readonly azimuthDeg: Quantity<'deg'>;
}

export function geodesicInverse(from: GeoPoint, to: GeoPoint): GeodesicSegment {
  const result = WGS84_GEODESIC.Inverse(from.latitude, from.longitude, to.latitude, to.longitude);
  const azimuth = result.azi1 ?? 0;
  return {
    distanceM: quantity(result.s12 ?? 0, 'm'),
    azimuthDeg: quantity(((azimuth % 360) + 360) % 360, 'deg'),
  };
}

export interface GeodesicPolygonMeasure {
  /** Área encerrada por el polígono de lados geodésicos (valor absoluto). */
  readonly areaM2: Quantity<'m2'>;
  readonly perimeterM: Quantity<'m'>;
}

/** Área y perímetro de un polígono simple cuyos lados son geodésicas del elipsoide. */
export function geodesicPolygon(vertices: readonly GeoPoint[]): GeodesicPolygonMeasure {
  if (vertices.length < 3) throw new RangeError('Un polígono necesita al menos 3 vértices');
  const polygon = WGS84_GEODESIC.Polygon(false);
  for (const vertex of vertices) polygon.AddPoint(vertex.latitude, vertex.longitude);
  const result = polygon.Compute(false, true);
  return {
    areaM2: quantity(Math.abs(result.area ?? 0), 'm2'),
    perimeterM: quantity(result.perimeter, 'm'),
  };
}
