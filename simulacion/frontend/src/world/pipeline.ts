/**
 * Pipeline de generación del mundo 3D. Cada etapa es una función pura con entradas y salidas
 * explícitas; el worker las ejecuta en orden e informa de su duración real.
 *
 *   coordenadas → consulta de elevación → normalización → malla → materiales
 *     → elementos geográficos → vegetación → escena explorable
 *
 * La consulta de datos ocurre antes (hilo principal, API) y la escena explorable después (GPU).
 */
import { quantity } from '../domain/units.ts';
import { createLocalFrame, type LocalFrame } from '../geo/localFrame.ts';
import type { RectangularRegion } from '../geo/region.ts';
import { geoPoint } from '../geo/wgs84.ts';
import { BIOMES, type BiomeId } from './biome.ts';
import { type BuildingSet, buildBuildings } from './buildings.ts';
import { WORLD_LIMITS, type WorldExtent } from './extent.ts';
import {
  dominantOrientationDeg,
  type LocalFeatures,
  type LocalPlace,
  toLocalFeatures,
  type WorldFeatureInput,
} from './features.ts';
import { type ImageryMosaic, type ImageryTexture, resampleImagery } from './imagery.ts';
import { createFieldMosaic, type FieldMosaic } from './fields.ts';
import { type GeoGrid, sampleBicubic } from './grid.ts';
import { buildHeightfield, type Heightfield } from './heightfield.ts';
import { type ClassGrid, classAt, LAND_COVER, resampleLandCover } from './landcover.ts';
import { type DemNormalization, normalizeDem } from './normalize.ts';
import type { WorldQuality } from './quality.ts';
import { type FarScatter, farSets, type ScatterContext, scatterFarVegetation } from './scatter.ts';
import {
  buildContextSplat,
  buildFeatureField,
  buildSplatMaps,
  type ContextSplat,
  type FeatureField,
  LAYER,
  rasterizePolygons,
  regionContains,
  type SplatMaps,
} from './splat.ts';
import {
  buildContextRing,
  buildDetailChunks,
  type ChunkLevels,
  type MeshData,
} from './terrainMesh.ts';
import type { SpeciesSet } from './vegetationSpecies.ts';

export type StageId =
  'elevation' | 'normalize' | 'mesh' | 'materials' | 'features' | 'vegetation' | 'scene';

export const STAGES: readonly { readonly id: StageId; readonly label: string }[] = [
  { id: 'elevation', label: 'Consulta de elevación y datos geográficos' },
  { id: 'normalize', label: 'Normalización del terreno' },
  { id: 'mesh', label: 'Construcción de la malla 3D' },
  { id: 'materials', label: 'Aplicación de materiales' },
  { id: 'features', label: 'Integración de elementos geográficos' },
  { id: 'vegetation', label: 'Vegetación ambiental' },
  { id: 'scene', label: 'Escena explorable' },
];

export type DataOrigin = 'real' | 'procedural';

export interface WorldSourceData {
  readonly elevation: GeoGrid<Float32Array>;
  readonly elevationOrigin: DataOrigin;
  readonly landCoverDetail: GeoGrid<Uint8Array>;
  readonly landCoverContext: GeoGrid<Uint8Array>;
  readonly landCoverOrigin: DataOrigin;
  /** `null` si no hay datos de OSM para el área. */
  readonly features: readonly WorldFeatureInput[] | null;
  /** Elementos del área de contexto (teselas de zoom 11): nombres de poblaciones. */
  readonly contextFeatures: readonly WorldFeatureInput[] | null;
  /** Imagen satelital del área de detalle y del contexto; `null` si no está disponible. */
  readonly imageryDetail: ImageryMosaic | null;
  readonly imageryContext: ImageryMosaic | null;
}

export interface WorldBuildInput {
  readonly region: RectangularRegion;
  readonly extent: WorldExtent;
  readonly quality: WorldQuality;
  readonly seed: number;
  readonly data: WorldSourceData;
  readonly biome: BiomeId;
  readonly species: SpeciesSet;
}

export interface WorldBuildStats {
  readonly detailSpacingM: number;
  readonly contextSpacingM: number;
  readonly terrainTrianglesLod0: number;
  readonly contextTriangles: number;
  readonly instances: Readonly<Record<string, number>>;
  readonly featureCounts: Readonly<Record<string, number>>;
  readonly fieldOrientationDeg: number | null;
  readonly buildings: {
    readonly count: number;
    readonly taggedHeights: number;
    readonly estimatedHeights: number;
    readonly pitchedRoofs: number;
  } | null;
}

export interface WorldBuild {
  /** Altura ortométrica del terreno en el origen (m, EGM96 si la fuente es NASADEM). */
  readonly originElevationM: number;
  readonly normalization: Omit<DemNormalization, 'grid'>;
  readonly detail: Heightfield;
  readonly context: Heightfield;
  readonly chunks: readonly ChunkLevels[];
  readonly contextRing: MeshData;
  readonly landCover: ClassGrid;
  readonly contextLandCover: ClassGrid;
  readonly splat: SplatMaps;
  readonly contextSplat: ContextSplat;
  /** Color real del terreno (Sentinel-2 2016) alineado con los mapas de mezcla. */
  readonly satelliteDetail: ImageryTexture | null;
  readonly satelliteContext: ImageryTexture | null;
  readonly buildings: BuildingSet | null;
  /** Poblaciones con nombre (detalle y contexto), sin duplicados. */
  readonly places: readonly LocalPlace[];
  readonly featureField: FeatureField | null;
  readonly buildingMask: Uint8Array | null;
  readonly localFeatures: LocalFeatures | null;
  readonly mosaic: FieldMosaic;
  readonly far: FarScatter;
  readonly stats: WorldBuildStats;
}

export type StageReporter = (stage: StageId, durationMs: number, detail: string) => void;

const LOD_LEVELS = 3;

export function createSceneFrame(region: RectangularRegion, originElevationM: number): LocalFrame {
  return createLocalFrame({
    ...geoPoint(region.center.latitude, region.center.longitude),
    heightM: quantity(originElevationM, 'm'),
  });
}

function timed<T>(stage: StageId, report: StageReporter, run: () => [T, string]): T {
  const start = performance.now();
  const [result, detail] = run();
  report(stage, performance.now() - start, detail);
  return result;
}

export function buildWorld(input: WorldBuildInput, report: StageReporter): WorldBuild {
  const { extent, quality, region, data, seed } = input;
  const segments = extent.chunksPerSide * quality.chunkSegments;
  const detailSpacingM = extent.detailSizeM / segments;
  const contextSpacingM = detailSpacingM * WORLD_LIMITS.contextSpacingFactor;
  const ring = Math.ceil((extent.contextSizeM - extent.detailSizeM) / 2 / contextSpacingM);
  const contextSizeM = extent.detailSizeM + 2 * ring * contextSpacingM;

  // 2 · Normalización: relleno de vacíos, suavizado y reproyección al marco local.
  const { normalization, frame, detail, context } = timed('normalize', report, () => {
    const normalized = normalizeDem(data.elevation);
    const { grid, ...summary } = normalized;
    const originElevationM = sampleBicubic(grid, region.center.latitude, region.center.longitude);
    const sceneFrame = createSceneFrame(region, originElevationM);
    const detailField = buildHeightfield(grid, sceneFrame, extent.detailSizeM, segments);
    const contextField = buildHeightfield(
      grid,
      sceneFrame,
      contextSizeM,
      Math.round(contextSizeM / contextSpacingM),
    );
    return [
      {
        normalization: { ...summary, originElevationM },
        frame: sceneFrame,
        detail: detailField,
        context: contextField,
      },
      `${String(segments + 1)}² nodos a ${detailSpacingM.toFixed(1)} m; contexto ${(contextSizeM / 1000).toFixed(1)} km a ${contextSpacingM.toFixed(0)} m; σ ${String(summary.smoothingSigmaPx)} px; ${String(summary.voidsFilled)} vacíos rellenados`,
    ];
  });

  // 3 · Malla: fragmentos con niveles de detalle y faldones; anillo de contexto.
  const { chunks, contextRing } = timed('mesh', report, () => {
    const built = buildDetailChunks(detail, extent.chunksPerSide, LOD_LEVELS);
    const ringMesh = buildContextRing(context, extent.detailSizeM / 2);
    const triangles = built.reduce(
      (sum, chunk) => sum + (chunk.levels[0]?.indices.length ?? 0) / 3,
      0,
    );
    return [
      { chunks: built, contextRing: ringMesh },
      `${String(built.length)} fragmentos × ${String(LOD_LEVELS)} LOD; ${Math.round(triangles / 1000).toLocaleString('es')} k triángulos en LOD0`,
    ];
  });

  // 4 · Materiales: cobertura real, pendiente, región reservada, mosaico procedural de campos e
  //     imagen satelital.
  const lc = resampleLandCover(data.landCoverDetail, frame, extent.detailSizeM, 5);
  const isUrban = (x: number, z: number): boolean => classAt(lc, x, z) === LAND_COVER.built;
  const localFeatures =
    data.features === null ? null : toLocalFeatures(data.features, frame, { isUrban });
  const orientation = localFeatures === null ? null : dominantOrientationDeg(localFeatures.lines);
  const mosaic = createFieldMosaic(seed, orientation ?? region.orientationDeg);
  const profile = BIOMES[input.biome];
  const {
    landCover,
    contextLandCover,
    splat,
    contextSplat,
    satelliteDetail,
    satelliteContext,
  } = timed('materials', report, () => {
    const ctxLc = resampleLandCover(data.landCoverContext, frame, contextSizeM, contextSpacingM);
    const maps = buildSplatMaps({
      sizeM: extent.detailSizeM,
      texelM: quality.splatTexelM,
      heightfield: detail,
      landCover: lc,
      region,
      mosaic,
      features: null,
      seed,
    });
    const ctxMaps = buildContextSplat(
      context,
      ctxLc,
      Math.min(1024, Math.round(contextSizeM / 32)),
      seed,
    );
    const satD =
      data.imageryDetail === null
        ? null
        : resampleImagery(
            data.imageryDetail,
            frame,
            extent.detailSizeM,
            Math.min(1024, Math.ceil(extent.detailSizeM / 5)),
          );
    const satC =
      data.imageryContext === null
        ? null
        : resampleImagery(data.imageryContext, frame, contextSizeM, 1024);
    return [
      {
        landCover: lc,
        contextLandCover: ctxLc,
        splat: maps,
        contextSplat: ctxMaps,
        satelliteDetail: satD,
        satelliteContext: satC,
      },
      `bioma «${profile.label}»: mezcla de 10 materiales a ${maps.texelM.toFixed(1)} m/texel (${String(maps.resolution)}²)${satD === null ? '; sin imagen satelital' : `; color satelital ${String(satD.resolution)}² + contexto ${String(satC?.resolution ?? 0)}²`}`,
    ];
  });

  // 5 · Elementos geográficos de OSM: campos de distancia, edificaciones 3D y poblaciones.
  const contextLocal =
    data.contextFeatures === null ? null : toLocalFeatures(data.contextFeatures, frame);
  const places = mergePlaces([
    ...(localFeatures?.places ?? []),
    ...(contextLocal?.places ?? []),
  ]);
  const { featureField, buildingMask, buildings } = timed<{
    featureField: FeatureField | null;
    buildingMask: Uint8Array | null;
    buildings: BuildingSet | null;
  }>('features', report, () => {
    if (localFeatures === null)
      return [
        { featureField: null, buildingMask: null, buildings: null },
        'sin datos de OpenStreetMap',
      ];
    const field = buildFeatureField(localFeatures, extent.detailSizeM, quality.splatTexelM);
    const cell = field.sizeM / field.resolution;
    const footprints = localFeatures.polygons.filter((p) => p.kind === 'building');
    const mask = rasterizePolygons(footprints, field.resolution, cell, -field.sizeM / 2);
    paintBuildings(splat, mask, field.resolution);
    const built = buildBuildings({
      polygons: footprints,
      heightfield: detail,
      seed,
      style: profile.buildings,
      isUrban,
      isExcluded: (x, z) => regionContains(region, x, z, 2),
    });
    return [
      { featureField: field, buildingMask: mask, buildings: built },
      `${String(localFeatures.lines.length)} líneas, ${String(localFeatures.polygons.length)} polígonos; ${String(built.count)} edificaciones 3D (${String(built.taggedHeights)} con altura de OSM); ${String(places.length)} poblaciones`,
    ];
  });

  // 6 · Vegetación: posiciones procedurales dentro de las zonas que permiten los datos.
  const ctx: ScatterContext = {
    seed,
    sizeM: extent.detailSizeM,
    heightfield: detail,
    landCover,
    featureField,
    buildingMask,
    region,
    mosaic,
    features: localFeatures,
    density: quality.vegetationDensity,
    species: input.species,
    vegetation: profile.vegetation,
  };
  const far = timed('vegetation', report, () => {
    const scatter = scatterFarVegetation(ctx);
    return [
      scatter,
      `${String(scatter.tree.count)} árboles, ${String(scatter.shrub.count)} arbustos, ${String(scatter.rock.count)} rocas, ${String(scatter.debris.count)} restos`,
    ];
  });

  const featureCounts: Record<string, number> = {};
  for (const line of localFeatures?.lines ?? [])
    featureCounts[line.kind] = (featureCounts[line.kind] ?? 0) + 1;
  for (const polygon of localFeatures?.polygons ?? []) {
    featureCounts[polygon.kind] = (featureCounts[polygon.kind] ?? 0) + 1;
  }

  return {
    originElevationM: normalization.originElevationM,
    normalization,
    detail,
    context,
    chunks,
    contextRing,
    landCover,
    contextLandCover,
    splat,
    contextSplat,
    satelliteDetail,
    satelliteContext,
    buildings,
    places,
    featureField,
    buildingMask,
    localFeatures,
    mosaic,
    far,
    stats: {
      detailSpacingM,
      contextSpacingM,
      terrainTrianglesLod0: chunks.reduce(
        (sum, c) => sum + (c.levels[0]?.indices.length ?? 0) / 3,
        0,
      ),
      contextTriangles: contextRing.indices.length / 3,
      instances: {
        tree: far.tree.count,
        shrub: far.shrub.count,
        rock: far.rock.count,
        debris: far.debris.count,
      },
      featureCounts,
      fieldOrientationDeg: orientation,
      buildings:
        buildings === null
          ? null
          : {
              count: buildings.count,
              taggedHeights: buildings.taggedHeights,
              estimatedHeights: buildings.estimatedHeights,
              pitchedRoofs: buildings.pitchedRoofs,
            },
    },
  };
}

/** Poblaciones sin duplicados (mismo nombre a menos de 2 km): se conserva la más importante. */
export function mergePlaces(places: readonly LocalPlace[]): LocalPlace[] {
  const order: Record<LocalPlace['kind'], number> = {
    city: 0,
    town: 1,
    village: 2,
    suburb: 3,
    hamlet: 4,
    quarter: 5,
    neighbourhood: 6,
  };
  const sorted = [...places].sort(
    (a, b) => order[a.kind] - order[b.kind] || (a.rank ?? 99) - (b.rank ?? 99),
  );
  const kept: LocalPlace[] = [];
  for (const place of sorted) {
    if (kept.some((k) => k.name === place.name && Math.hypot(k.x - place.x, k.z - place.z) < 2000))
      continue;
    kept.push(place);
  }
  return kept;
}

/** Repinta las huellas de edificaciones como suelo compactado en los mapas de mezcla. */
function paintBuildings(splat: SplatMaps, mask: Uint8Array, maskResolution: number): void {
  for (let j = 0; j < splat.resolution; j++) {
    const mj = Math.min(maskResolution - 1, Math.floor((j / splat.resolution) * maskResolution));
    for (let i = 0; i < splat.resolution; i++) {
      const mi = Math.min(maskResolution - 1, Math.floor((i / splat.resolution) * maskResolution));
      if (mask[mj * maskResolution + mi] !== 1) continue;
      const index = (j * splat.resolution + i) * 4;
      splat.weightsA.fill(0, index, index + 4);
      splat.weightsB.fill(0, index, index + 4);
      splat.weightsC.fill(0, index, index + 4);
      splat.weightsA[index + LAYER.dirt] = 204;
      splat.weightsA[index + LAYER.dryGround] = 51;
    }
  }
}

/** Arrays que el worker puede transferir sin copiarlos. */
export function transferables(build: WorldBuild): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (array: ArrayBufferView | null | undefined): void => {
    if (array !== null && array !== undefined && array.buffer instanceof ArrayBuffer)
      buffers.add(array.buffer);
  };
  add(build.detail.heights);
  add(build.context.heights);
  for (const chunk of build.chunks) {
    for (const level of chunk.levels) {
      add(level.positions);
      add(level.normals);
      add(level.indices);
    }
  }
  add(build.contextRing.positions);
  add(build.contextRing.normals);
  add(build.contextRing.indices);
  add(build.landCover.data);
  add(build.contextLandCover.data);
  add(build.splat.weightsA);
  add(build.splat.weightsB);
  add(build.splat.weightsC);
  add(build.splat.fieldInfo);
  add(build.contextSplat.weightsA);
  add(build.contextSplat.weightsB);
  add(build.contextSplat.weightsC);
  add(build.featureField?.data);
  add(build.buildingMask);
  for (const set of farSets(build.far)) {
    add(set.data);
    add(set.cellStart);
  }
  for (const line of build.localFeatures?.lines ?? []) add(line.points);
  for (const polygon of build.localFeatures?.polygons ?? []) {
    add(polygon.ring);
    for (const hole of polygon.holes) add(hole);
  }
  add(build.satelliteDetail?.data);
  add(build.satelliteContext?.data);
  for (const mesh of build.buildings?.meshes ?? []) {
    add(mesh.positions);
    add(mesh.normals);
    add(mesh.uvs);
    add(mesh.colors);
    add(mesh.indices);
  }
  return [...buffers];
}
