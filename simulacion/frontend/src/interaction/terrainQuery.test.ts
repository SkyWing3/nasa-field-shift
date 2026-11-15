import { describe, expect, it } from 'vitest';

import { createLocalFrame } from '../geo/localFrame.ts';
import { createRegion } from '../geo/region.ts';
import { geoPoint } from '../geo/wgs84.ts';
import { computeWorldExtent } from '../world/extent.ts';
import type { WorldFeatureInput } from '../world/features.ts';
import type { GeneratedWorld } from '../world/generate.ts';
import { buildWorld, createSceneFrame } from '../world/pipeline.ts';
import { proceduralElevation, proceduralLandCover } from '../world/procedural.ts';
import { WORLD_QUALITIES } from '../world/quality.ts';
import { describeTerrainPoint, nearestFeature } from './terrainQuery';

const center = geoPoint(-17.551334, -65.861983);
const region = createRegion(center, 400, 300, 0);
const frame0 = createLocalFrame(center);
const result = computeWorldExtent(region, frame0);
if (!result.ok) throw new Error('extensión');
const extent = result.extent;
const lon = (east: number): number => frame0.fromEnu({ east, north: 0, up: 0 }).longitude;
const lat = (north: number): number => frame0.fromEnu({ east: 0, north, up: 0 }).latitude;
const canal: WorldFeatureInput = {
  id: 'way/7',
  kind: 'waterway',
  subtype: 'canal',
  geometryType: 'LineString',
  coordinates: [
    [lon(-600), lat(-500)],
    [lon(600), lat(-500)],
  ],
  tags: { name: 'Canal Norte' },
};
const build = buildWorld(
  {
    region,
    extent,
    quality: WORLD_QUALITIES.low,
    seed: 9,
    data: {
      elevation: proceduralElevation(extent.elevationBBox, 9, 2700),
      elevationOrigin: 'procedural',
      landCoverDetail: proceduralLandCover(extent.landcoverDetailBBox, 9),
      landCoverContext: proceduralLandCover(extent.landcoverContextBBox, 9, 1 / 1200),
      landCoverOrigin: 'procedural',
      features: [canal],
    },
  },
  () => undefined,
);
const world = {
  region,
  extent,
  quality: WORLD_QUALITIES.low,
  seed: 9,
  build,
} as unknown as GeneratedWorld;
const frame = createSceneFrame(region, build.originElevationM);

describe('consulta de puntos del terreno', () => {
  it('devuelve coordenadas, altura, cobertura y si el punto está en la granja', () => {
    const point = describeTerrainPoint(world, frame, 0, 0);
    expect(point.latitude).toBeCloseTo(center.latitude, 6);
    expect(point.longitude).toBeCloseTo(center.longitude, 6);
    expect(point.elevationM).toBeCloseTo(build.originElevationM, 0);
    expect(point.insideFarm).toBe(true);
    expect(point.landCover.length).toBeGreaterThan(0);
    const outside = describeTerrainPoint(world, frame, 900, 900);
    expect(outside.insideFarm).toBe(false);
    // Fuera del área de detalle: se usa el contexto y no se buscan elementos OSM.
    expect(describeTerrainPoint(world, frame, 5000, 0).nearestFeature).toBeNull();
  });

  it('nombra el elemento de OpenStreetMap más cercano', () => {
    // El canal está 500 m al sur (norte = −500): z = +500 en la escena.
    expect(nearestFeature(world, 0, 500)).toContain('Sobre: Cauce (canal) «Canal Norte»');
    expect(nearestFeature(world, 0, 510)).toMatch(/Cauce \(canal\) «Canal Norte» a 9 m/);
    expect(nearestFeature(world, 0, 560)).toBeNull();
  });
});
