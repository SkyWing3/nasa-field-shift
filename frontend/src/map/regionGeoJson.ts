import type { Feature, FeatureCollection, Polygon } from 'geojson';

import { type GeoPoint, type RectangularRegion, regionCorners } from '../geo';

/**
 * Longitudes continuas respecto al centro: una región que cruza el antimeridiano se dibuja como
 * un único polígono (MapLibre admite longitudes fuera de ±180).
 */
function unwrapped(point: GeoPoint, referenceLongitude: number): [number, number] {
  let longitude: number = point.longitude;
  while (longitude - referenceLongitude > 180) longitude -= 360;
  while (longitude - referenceLongitude < -180) longitude += 360;
  return [longitude, point.latitude];
}

export function regionPolygon(region: RectangularRegion): Feature<Polygon> {
  const reference = region.center.longitude;
  const ring = regionCorners(region).map((corner) => unwrapped(corner, reference));
  const first = ring[0];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [first === undefined ? ring : [...ring, first]] },
  };
}

export function regionCollection(region: RectangularRegion | null): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: region === null ? [] : [regionPolygon(region)] };
}

/** Caja envolvente [[oeste, sur], [este, norte]] para encuadrar la región. */
export function regionBounds(
  region: RectangularRegion,
): [[west: number, south: number], [east: number, north: number]] {
  const ring = regionPolygon(region).geometry.coordinates[0] ?? [];
  const longitudes = ring.map(([longitude = 0]) => longitude);
  const latitudes = ring.map(([, latitude = 0]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}
