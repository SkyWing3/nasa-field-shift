/**
 * Medidas geodésicas de una región rectangular sobre el elipsoide WGS84 (GeographicLib). Sirven
 * de comprobación independiente de la definición en el plano local. Módulo aparte para que
 * GeographicLib solo se descargue con las pantallas que lo usan.
 */
import { quantity, type Quantity } from '../domain/units.ts';
import { geodesicInverse, geodesicPolygon } from './geodesic.ts';
import { createLocalFrame } from './localFrame.ts';
import { normalizeOrientation, type RectangularRegion, regionCorners } from './region.ts';
import type { GeoPoint } from './wgs84.ts';

export interface RegionMetrics {
  readonly corners: readonly GeoPoint[];
  /** Superficie del polígono geodésico sobre WGS84. */
  readonly areaM2: Quantity<'m2'>;
  readonly areaHa: Quantity<'ha'>;
  /** Superficie en el plano local (ancho × largo), para comparar con la geodésica. */
  readonly planarAreaM2: Quantity<'m2'>;
  readonly perimeterM: Quantity<'m'>;
  /** Longitud geodésica de los lados SO→SE, SE→NE, NE→NO y NO→SO. */
  readonly sideLengthsM: readonly Quantity<'m'>[];
  /** Azimut geodésico del eje largo medido desde el centro. */
  readonly orientationDeg: Quantity<'deg'>;
}

export function regionMetrics(region: RectangularRegion): RegionMetrics {
  const corners = regionCorners(region);
  const polygon = geodesicPolygon(corners);
  const sideLengthsM = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length] ?? corner;
    return geodesicInverse(corner, next).distanceM;
  });
  const [, , northEast, northWest] = corners as [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
  // Punto medio del lado "norte" del rectángulo (entre NO y NE) en el plano local.
  const frame = createLocalFrame(region.center);
  const a = frame.toEnu(northWest);
  const b = frame.toEnu(northEast);
  const mid = frame.fromEnu({ east: (a.east + b.east) / 2, north: (a.north + b.north) / 2, up: 0 });
  const azimuth = geodesicInverse(region.center, mid).azimuthDeg;
  return {
    corners,
    areaM2: polygon.areaM2,
    areaHa: quantity(polygon.areaM2 / 10_000, 'ha'),
    planarAreaM2: quantity(region.widthM * region.lengthM, 'm2'),
    perimeterM: polygon.perimeterM,
    sideLengthsM,
    orientationDeg: quantity(normalizeOrientation(azimuth), 'deg'),
  };
}
