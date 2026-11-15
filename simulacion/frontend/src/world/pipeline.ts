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
import { WORLD_LIMITS, type WorldExtent } from './extent.ts';
import {
  dominantOrientationDeg,
  type LocalFeatures,
  toLocalFeatures,
  type WorldFeatureInput,
} from './features.ts';
import { createFieldMosaic, type FieldMosaic } from './fields.ts';
import { type GeoGrid, sampleBicubic } from './grid.ts';
import { buildHeightfield, type Heightfield } from './heightfield.ts';
import { type ClassGrid, resampleLandCover } from './landcover.ts';
import { type DemNormalization, normalizeDem } from './normalize.ts';
import type { WorldQuality } from './quality.ts';
import { type FarScatter, farSets, type ScatterContext, scatterFarVegetation } from './scatter.ts';
import {
  buildContextSplat,
  buildFeatureField,
  buildSplatMaps,
  type FeatureField,
  LAYER,
  rasterizePolygons,
  type SplatMaps,
} from './splat.ts';
import {
  buildContextRing,
  buildDetailChunks,
  type ChunkLevels,
  type MeshData,
} from './terrainMesh.ts';

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
}

export interface WorldBuildInput {
  readonly region: RectangularRegion;
  readonly extent: WorldExtent;
  readonly quality: WorldQuality;
  readonly seed: number;
  readonly data: WorldSourceData;
}

export interface WorldBuildStats {
  readonly detailSpacingM: number;
  readonly contextSpacingM: number;
  readonly terrainTrianglesLod0: number;
  readonly contextTriangles: number;
  readonly instances: Readonly<Record<string, number>>;
  readonly featureCounts: Readonly<Record<string, number>>;
  readonly fieldOrientationDeg: number | null;
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
  readonly contextSplat: ReturnType<typeof buildContextSplat>;
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

  // 4 · Materiales: cobertura real, pendiente, región reservada y mosaico procedural de campos.
  const localFeatures = data.features === null ? null : toLocalFeatures(data.features, frame);
  const orientation = localFeatures === null ? null : dominantOrientationDeg(localFeatures.lines);
  const mosaic = createFieldMosaic(seed, orientation ?? region.orientationDeg);
  const { landCover, contextLandCover, splat, contextSplat } = timed('materials', report, () => {
    const lc = resampleLandCover(data.landCoverDetail, frame, extent.detailSizeM, 5);
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
    return [
      { landCover: lc, contextLandCover: ctxLc, splat: maps, contextSplat: ctxMaps },
      `mezcla de 8 materiales a ${maps.texelM.toFixed(1)} m/texel (${String(maps.resolution)}²)`,
    ];
  });

  // 5 · Elementos geográficos de OSM: campos de distancia y huellas de edificaciones.
  const { featureField, buildingMask } = timed<{
    featureField: FeatureField | null;
    buildingMask: Uint8Array | null;
  }>('features', report, () => {
    if (localFeatures === null)
      return [{ featureField: null, buildingMask: null }, 'sin datos de OpenStreetMap'];
    const field = buildFeatureField(localFeatures, extent.detailSizeM, quality.splatTexelM);
    const cell = field.sizeM / field.resolution;
    const buildings = localFeatures.polygons.filter((p) => p.kind === 'building');
    const mask = rasterizePolygons(buildings, field.resolution, cell, -field.sizeM / 2);
    paintBuildings(splat, mask, field.resolution);
    return [
      { featureField: field, buildingMask: mask },
      `${String(localFeatures.lines.length)} líneas y ${String(localFeatures.polygons.length)} polígonos`,
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
    },
  };
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
  add(build.splat.fieldInfo);
  add(build.contextSplat.weightsA);
  add(build.contextSplat.weightsB);
  add(build.featureField?.data);
  add(build.buildingMask);
  for (const set of farSets(build.far)) {
    add(set.data);
    add(set.cellStart);
  }
  for (const line of build.localFeatures?.lines ?? []) add(line.points);
  for (const polygon of build.localFeatures?.polygons ?? []) add(polygon.ring);
  return [...buffers];
}
