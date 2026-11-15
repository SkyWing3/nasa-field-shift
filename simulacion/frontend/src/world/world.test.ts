import { describe, expect, it } from 'vitest';

import { createLocalFrame } from '../geo/localFrame.ts';
import { createRegion } from '../geo/region.ts';
import { geoPoint } from '../geo/wgs84.ts';
import { BIOMES } from './biome.ts';
import { computeWorldExtent, type GeoBBox } from './extent.ts';
import {
  dominantOrientationDeg,
  ESTIMATED_WIDTH_M,
  pointInRing,
  segmentDistance,
  toLocalFeatures,
  type WorldFeatureInput,
} from './features.ts';
import { createFieldMosaic, sampleField } from './fields.ts';
import type { GeoGrid } from './grid.ts';
import { heightAt } from './heightfield.ts';
import { LAND_COVER } from './landcover.ts';
import { buildWorld, STAGES, type StageId, transferables } from './pipeline.ts';
import { proceduralElevation, proceduralLandCover } from './procedural.ts';
import { WORLD_QUALITIES } from './quality.ts';
import { fbm, hash32, hashCoords, seedFromText, sequence, unit } from './random.ts';
import { farSets, INSTANCE_STRIDE, isBlocked, scatterGroundCoverCell } from './scatter.ts';
import {
  decodeDistance,
  encodeDistance,
  LAYER,
  materialWeights,
  regionContains,
  regionEdgeDistance,
  TERRAIN_LAYERS,
} from './splat.ts';
import { pickModel, SPECIES } from './vegetationSpecies.ts';

const CENTER = geoPoint(-17.551334, -65.861983);
const REGION = createRegion(CENTER, 400, 300, 0);
const FRAME = createLocalFrame(CENTER);

describe('aleatoriedad determinista', () => {
  it('produce los mismos valores con la misma semilla', () => {
    expect(hash32(42)).toBe(hash32(42));
    expect(hashCoords(1, 2, 3)).not.toBe(hashCoords(1, 3, 2));
    expect(unit(0xffffffff)).toBeLessThan(1);
    const a = sequence(7);
    const b = sequence(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seedFromText('Valle Alto')).toBe(seedFromText('Valle Alto'));
    const n = fbm(3, 1.3, 2.7);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(1);
  });
});

describe('elementos de OpenStreetMap en el marco local', () => {
  const lon = (east: number): number => FRAME.fromEnu({ east, north: 0, up: 0 }).longitude;
  const lat = (north: number): number => FRAME.fromEnu({ east: 0, north, up: 0 }).latitude;
  const features: WorldFeatureInput[] = [
    {
      id: 'way/1',
      kind: 'road',
      subtype: 'primary',
      geometryType: 'LineString',
      coordinates: [
        [lon(-500), lat(0)],
        [lon(500), lat(0)],
      ],
      tags: { name: 'Avenida' },
    },
    {
      id: 'way/2',
      kind: 'track',
      subtype: 'grade3',
      geometryType: 'LineString',
      coordinates: [
        [lon(0), lat(-300)],
        [lon(0), lat(300)],
      ],
      tags: { surface: 'ground', width: '4,5' },
    },
    {
      id: 'way/3',
      kind: 'waterway',
      subtype: 'canal',
      geometryType: 'LineString',
      coordinates: [
        [lon(-100), lat(100)],
        [lon(100), lat(100)],
      ],
      tags: { intermittent: 'yes' },
    },
    {
      id: 'way/4',
      kind: 'building',
      subtype: 'yes',
      geometryType: 'Polygon',
      coordinates: [
        [lon(200), lat(200)],
        [lon(220), lat(200)],
        [lon(220), lat(210)],
        [lon(200), lat(210)],
        [lon(200), lat(200)],
      ],
      tags: {},
    },
  ];
  const local = toLocalFeatures(features, FRAME);

  it('convierte a metros con z = −norte y estima anchos y superficies sin etiquetas', () => {
    const [road, track, canal] = local.lines;
    expect(road?.points[0]).toBeCloseTo(-500, 1);
    // Las coordenadas de prueba combinan latitud y longitud por separado: error de milímetros.
    expect(road?.points[1]).toBeCloseTo(0, 1);
    expect(road?.paved).toBe(true);
    expect(road?.surfaceEstimated).toBe(true);
    expect(road?.widthM).toBe(ESTIMATED_WIDTH_M.primary);
    expect(road?.widthEstimated).toBe(true);
    expect(track?.paved).toBe(false);
    expect(track?.surfaceEstimated).toBe(false);
    expect(track?.widthM).toBe(4.5);
    expect(canal?.points[1]).toBeCloseTo(-100, 1);
    expect(canal?.intermittent).toBe(true);
    const building = local.polygons[0];
    expect(building?.bounds[0]).toBeCloseTo(200, 1);
    expect(pointInRing(building?.ring ?? new Float32Array(), 210, -205)).toBe(true);
    expect(pointInRing(building?.ring ?? new Float32Array(), 230, -205)).toBe(false);
  });

  it('calcula distancias a segmentos y la orientación dominante de las vías', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5);
    // Una vía este-oeste de 1 km y una norte-sur de 600 m: ambas a 0° módulo 90°.
    expect(dominantOrientationDeg(local.lines)).toBeLessThan(4);
    expect(dominantOrientationDeg([])).toBeNull();
  });
});

describe('materiales del terreno', () => {
  it('codifica distancias con signo en 8 bits', () => {
    expect(decodeDistance(encodeDistance(-2))).toBeCloseTo(-2, 1);
    expect(decodeDistance(encodeDistance(10.3))).toBeCloseTo(10.3, 1);
    expect(encodeDistance(-50)).toBe(0);
    expect(encodeDistance(500)).toBe(255);
  });

  it('respeta la orientación de la región reservada', () => {
    const rotated = createRegion(CENTER, 100, 300, 90); // lado largo hacia el este
    expect(regionContains(rotated, 140, 0)).toBe(true);
    expect(regionContains(rotated, 0, 140)).toBe(false);
    expect(regionEdgeDistance(REGION, 0, 0)).toBeCloseTo(-150, 6);
    expect(regionEdgeDistance(REGION, 210, 0)).toBeCloseTo(10, 6);
  });

  it('asigna materiales según la cobertura real y la pendiente', () => {
    const w = new Float32Array(TERRAIN_LAYERS.length);
    materialWeights(LAND_COVER.crop, 2, 'furrows', 20, 0.5, w);
    expect(w[LAYER.furrows]).toBe(1);
    materialWeights(LAND_COVER.crop, 2, 'tilled', 0.5, 0.5, w);
    expect(w[LAYER.grass]).toBeGreaterThan(0.5); // linde con hierba
    materialWeights(LAND_COVER.grass, 45, null, 99, 0.5, w);
    expect(w[LAYER.stony]).toBe(1); // pendiente fuerte: roca
    materialWeights(LAND_COVER.built, 0, null, 99, 0.5, w);
    expect(w[LAYER.dirt]).toBe(Math.max(...w)); // suelo apisonado dominante
    expect(TERRAIN_LAYERS).toHaveLength(10);
  });

  it('el mosaico procedural de campos es estable y orientado', () => {
    const mosaic = createFieldMosaic(5, 30);
    const a = sampleField(mosaic, 123.4, -56.7);
    expect(sampleField(mosaic, 123.4, -56.7)).toEqual(a);
    expect(a.edgeDistanceM).toBeGreaterThanOrEqual(0);
    expect(mosaic.angleRad).toBeCloseTo(Math.PI / 6, 9);
  });
});

describe('vegetación', () => {
  it('elige modelos con los pesos de la especie', () => {
    const counts = new Map<number, number>();
    for (let k = 0; k < 1000; k++) {
      const index = pickModel(SPECIES.shrub, k / 1000);
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
    // shrub_04 pesa 1,5 de 5,5.
    expect(counts.get(4)).toBeGreaterThan(250);
    expect(counts.get(4)).toBeLessThan(300);
  });
});

function syntheticData(
  bbox: GeoBBox,
  seed: number,
): {
  elevation: GeoGrid<Float32Array>;
  landCover: GeoGrid<Uint8Array>;
} {
  return {
    elevation: proceduralElevation(bbox, seed, 2700),
    landCover: proceduralLandCover(bbox, seed),
  };
}

describe('pipeline completo', () => {
  const extentResult = computeWorldExtent(REGION, FRAME);
  if (!extentResult.ok) throw new Error('extensión no válida');
  const extent = extentResult.extent;
  const elevation = syntheticData(extent.elevationBBox, 3);
  const detailCover = proceduralLandCover(extent.landcoverDetailBBox, 3);
  const contextCover = proceduralLandCover(extent.landcoverContextBBox, 3, 1 / 1200);
  const lon = (east: number): number => FRAME.fromEnu({ east, north: 0, up: 0 }).longitude;
  const lat = (north: number): number => FRAME.fromEnu({ east: 0, north, up: 0 }).latitude;
  const road: WorldFeatureInput = {
    id: 'way/9',
    kind: 'road',
    subtype: 'tertiary',
    geometryType: 'LineString',
    coordinates: [
      [lon(-1400), lat(-400)],
      [lon(1400), lat(-400)],
    ],
    tags: { surface: 'asphalt' },
  };
  const stages: StageId[] = [];
  const build = buildWorld(
    {
      region: REGION,
      extent,
      quality: WORLD_QUALITIES.low,
      seed: 3,
      biome: 'valley',
      species: SPECIES,
      data: {
        elevation: elevation.elevation,
        elevationOrigin: 'procedural',
        landCoverDetail: detailCover,
        landCoverContext: contextCover,
        landCoverOrigin: 'procedural',
        features: [road],
        contextFeatures: null,
        imageryDetail: null,
        imageryContext: null,
      },
    },
    (stage, duration) => {
      stages.push(stage);
      expect(duration).toBeGreaterThanOrEqual(0);
    },
  );

  it('ejecuta las etapas en el orden del pipeline', () => {
    expect(stages).toEqual(['normalize', 'mesh', 'materials', 'features', 'vegetation']);
    expect(STAGES.map((stage) => stage.id)).toEqual([
      'elevation',
      'normalize',
      'mesh',
      'materials',
      'features',
      'vegetation',
      'scene',
    ]);
  });

  it('genera terreno, contexto y mapas coherentes', () => {
    expect(build.detail.sizeM).toBe(3000);
    expect(heightAt(build.detail, 0, 0)).toBeCloseTo(0, 1);
    expect(build.chunks).toHaveLength(64);
    expect(build.context.sizeM).toBeGreaterThanOrEqual(30_000);
    expect(build.context.spacingM).toBeCloseTo(build.detail.spacingM * 16, 6);
    // El borde del hueco del contexto coincide con una línea de su malla.
    const holeOffset = (build.context.sizeM - 3000) / 2 / build.context.spacingM;
    expect(holeOffset).toBeCloseTo(Math.round(holeOffset), 9);
    expect(build.splat.resolution).toBe(750);
    expect(build.stats.instances.tree).toBeGreaterThanOrEqual(0);
    expect(transferables(build).length).toBeGreaterThan(100);
  });

  it('la región reservada queda con suelo agrícola y sin vegetación', () => {
    const { resolution, weightsA, texelM } = build.splat;
    const center = Math.floor(resolution / 2);
    expect(weightsA[(center * resolution + center) * 4 + LAYER.farmSoil]).toBe(255);
    expect(texelM).toBeCloseTo(4, 6);
    for (const set of farSets(build.far)) {
      for (let k = 0; k < set.count; k++) {
        const x = set.data[k * INSTANCE_STRIDE] ?? 0;
        const z = set.data[k * INSTANCE_STRIDE + 2] ?? 0;
        expect(regionContains(REGION, x, z)).toBe(false);
      }
    }
  });

  it('no coloca vegetación sobre el camino y genera el pasto de forma reproducible', () => {
    const ctx = {
      seed: 3,
      sizeM: 3000,
      heightfield: build.detail,
      landCover: build.landCover,
      featureField: build.featureField,
      buildingMask: build.buildingMask,
      region: REGION,
      mosaic: build.mosaic,
      features: build.localFeatures,
      density: 1,
      species: SPECIES,
      vegetation: BIOMES.valley.vegetation,
    };
    expect(isBlocked(ctx, 0, 400, 0.3)).toBe(true); // sobre el asfalto (z = −norte)
    expect(isBlocked(ctx, 0, 0, 0.3)).toBe(true); // región reservada
    for (const set of farSets(build.far)) {
      for (let k = 0; k < set.count; k++) {
        const z = set.data[k * INSTANCE_STRIDE + 2] ?? 0;
        expect(Math.abs(z - 400)).toBeGreaterThan(3);
      }
    }
    const first = scatterGroundCoverCell(ctx, 'grass', 20, 20, 16, 2);
    expect(scatterGroundCoverCell(ctx, 'grass', 20, 20, 16, 2)).toEqual(first);
  });
});
