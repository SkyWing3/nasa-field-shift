/**
 * Información de un punto del terreno seleccionado: coordenadas geográficas, altura, pendiente,
 * cobertura del suelo y elemento de OSM más cercano. Base para dibujar parcelas en la fase 05.
 */
import type { LocalFrame } from '../geo/localFrame.ts';
import type { TerrainSelection } from '../state/worldStore';
import { pointInRing, segmentDistance } from '../world/features.ts';
import type { GeneratedWorld } from '../world/generate.ts';
import { containsPoint, heightAt, slopeDegAt } from '../world/heightfield.ts';
import { classAt, LAND_COVER_LABELS } from '../world/landcover.ts';
import { regionContains } from '../world/splat.ts';

const FEATURE_LABELS: Readonly<Record<string, string>> = {
  road: 'Camino',
  track: 'Camino de tierra',
  path: 'Sendero',
  waterway: 'Cauce',
  railway: 'Vía férrea',
  building: 'Edificación',
  water: 'Agua',
  landuse: 'Uso del suelo',
};

const SUBTYPE_LABELS: Readonly<Record<string, string>> = {
  canal: 'canal',
  stream: 'arroyo',
  river: 'río',
  ditch: 'acequia',
  drain: 'desagüe',
  orchard: 'huerto',
  farmland: 'tierra de cultivo',
  farmyard: 'granja',
  residential: 'residencial',
};

export function nearestFeature(
  world: GeneratedWorld,
  x: number,
  z: number,
  maxDistanceM = 15,
): string | null {
  const features = world.build.localFeatures;
  if (features === null) return null;
  for (const polygon of features.polygons) {
    const [minX, minZ, maxX, maxZ] = polygon.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ || polygon.kind === 'landuse') continue;
    if (pointInRing(polygon.ring, x, z))
      return `${FEATURE_LABELS[polygon.kind] ?? polygon.kind} (OSM)`;
  }
  let best: { distance: number; label: string } | null = null;
  for (const line of features.lines) {
    for (let k = 0; k + 3 < line.points.length; k += 2) {
      const d =
        segmentDistance(
          x,
          z,
          line.points[k] ?? 0,
          line.points[k + 1] ?? 0,
          line.points[k + 2] ?? 0,
          line.points[k + 3] ?? 0,
        ) -
        line.widthM / 2;
      if (d < maxDistanceM && (best === null || d < best.distance)) {
        const kind = FEATURE_LABELS[line.kind] ?? line.kind;
        const subtype = SUBTYPE_LABELS[line.subtype];
        const name = line.name === null ? '' : ` «${line.name}»`;
        best = {
          distance: d,
          label: `${kind}${subtype === undefined ? '' : ` (${subtype})`}${name}`,
        };
      }
    }
  }
  if (best === null) return null;
  return best.distance <= 0
    ? `Sobre: ${best.label}`
    : `${best.label} a ${best.distance.toFixed(0)} m`;
}

export function describeTerrainPoint(
  world: GeneratedWorld,
  frame: LocalFrame,
  x: number,
  z: number,
): TerrainSelection {
  const build = world.build;
  const detail = containsPoint(build.detail, x, z);
  const field = detail ? build.detail : build.context;
  const y = heightAt(field, x, z);
  const geodetic = frame.fromScene([x, y, z]);
  const cover = classAt(detail ? build.landCover : build.contextLandCover, x, z);
  return {
    x,
    y,
    z,
    latitude: geodetic.latitude,
    longitude: geodetic.longitude,
    elevationM: geodetic.heightM,
    slopeDeg: slopeDegAt(field, x, z),
    landCover: LAND_COVER_LABELS[cover] ?? 'Sin dato',
    insideFarm: regionContains(world.region, x, z),
    nearestFeature: detail ? nearestFeature(world, x, z) : null,
  };
}
