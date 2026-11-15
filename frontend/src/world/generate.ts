/**
 * Orquestación de la generación del mundo en el hilo principal: consulta los datos a la API,
 * decide (con el consentimiento del usuario) si se usan sustitutos procedurales y ejecuta el
 * resto del pipeline en un worker.
 */
import type { AssetCatalog } from '../assets';
import { createLocalFrame } from '../geo/localFrame.ts';
import type { RectangularRegion } from '../geo/region.ts';
import {
  ApiError,
  type GeoFeatures,
  type RasterGrid,
  type SimulationClient,
  type WorldDatasets,
} from '../simulation-client';
import {
  type BiomeClassification,
  classifyBiome,
  coverShares,
  medianElevation,
} from './biome.ts';
import { computeWorldExtent, MAX_GENERATED_REGION_M, type WorldExtent } from './extent.ts';
import { decodeFloat32LE, decodeUint8, type GeoGrid } from './grid.ts';
import {
  CONTEXT_IMAGERY_ZOOM,
  DETAIL_IMAGERY_ZOOM,
  fetchImageryMosaic,
  type ImageryMosaic,
  imageryTileRange,
} from './imagery.ts';
import type { DataOrigin, StageId, WorldBuild, WorldSourceData } from './pipeline.ts';
import { proceduralElevation, proceduralLandCover } from './procedural.ts';
import type { WorldQuality } from './quality.ts';
import { seedFromText } from './random.ts';
import { biomeLayerIds, type TerrainTextureSet, terrainLayerUrls } from './textures.ts';
import { type SpeciesSet, speciesForBiome } from './vegetationSpecies.ts';
import type { BuildRequest, WorkerMessage } from './worker.ts';

export type StageStatus = 'pending' | 'running' | 'done' | 'error';

export interface StageEvent {
  readonly stage: StageId;
  readonly status: StageStatus;
  readonly durationMs?: number;
  readonly detail?: string;
}

export interface FeaturesSource {
  readonly available: boolean;
  readonly reason: string | null;
  readonly origin: GeoFeatures['origin'] | null;
  readonly snapshotId: string | null;
  readonly osmTimestamp: string | null;
  readonly count: number;
  /** Elementos del contexto (zoom 11): solo nombres de poblaciones. */
  readonly contextCount: number;
}

export interface ImagerySource {
  readonly available: boolean;
  readonly tilesLoaded: number;
  readonly tilesMissing: number;
  readonly failure: string | null;
}

export interface BiomeSource extends BiomeClassification {
  /** La clasificación usa datos procedurales si alguna fuente real falló. */
  readonly fromProceduralData: boolean;
  /** Modelos del bioma que faltan en el catálogo (sustituidos por los genéricos). */
  readonly missingModels: readonly string[];
}

export interface WorldSources {
  readonly datasets: WorldDatasets | null;
  readonly elevation: {
    readonly origin: DataOrigin;
    readonly tiles: readonly string[];
    readonly voidFraction: number;
    readonly failure: string | null;
  };
  readonly landCover: { readonly origin: DataOrigin; readonly failure: string | null };
  readonly features: FeaturesSource;
  readonly imagery: ImagerySource;
  readonly biome: BiomeSource;
}

export interface GeneratedWorld {
  readonly region: RectangularRegion;
  readonly extent: WorldExtent;
  readonly quality: WorldQuality;
  readonly seed: number;
  readonly build: WorldBuild;
  readonly textures: TerrainTextureSet;
  readonly sources: WorldSources;
  /** Modelos de vegetación del bioma (los mismos que usó la distribución del worker). */
  readonly species: SpeciesSet;
}

export type WorldGenerationErrorKind =
  'region-too-large' | 'data-unavailable' | 'worker' | 'aborted';

export class WorldGenerationError extends Error {
  readonly kind: WorldGenerationErrorKind;
  readonly failedSources: readonly string[];

  constructor(
    kind: WorldGenerationErrorKind,
    message: string,
    failedSources: readonly string[] = [],
  ) {
    super(message);
    this.name = 'WorldGenerationError';
    this.kind = kind;
    this.failedSources = failedSources;
  }
}

export interface GenerateOptions {
  readonly client: SimulationClient;
  readonly region: RectangularRegion;
  readonly quality: WorldQuality;
  readonly catalog: AssetCatalog;
  /** El usuario aceptó sustituir por datos procedurales las fuentes reales que fallen. */
  readonly allowProcedural: boolean;
  readonly signal?: AbortSignal;
  readonly onStage: (event: StageEvent) => void;
  /** Inyectable en pruebas. */
  readonly createWorker?: () => Worker;
}

function describeFailure(reason: unknown): string {
  if (reason instanceof ApiError) return reason.detail ?? reason.message;
  return reason instanceof Error ? reason.message : String(reason);
}

function toFloatGrid(grid: RasterGrid): GeoGrid<Float32Array> {
  return { ...grid, data: decodeFloat32LE(grid.data, grid.width * grid.height) };
}

function toClassGrid(grid: RasterGrid): GeoGrid<Uint8Array> {
  return { ...grid, data: decodeUint8(grid.data, grid.width * grid.height) };
}

function defaultWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'generador-de-mundo',
  });
}

export async function generateWorld(options: GenerateOptions): Promise<GeneratedWorld> {
  const { client, region, quality, catalog, signal, onStage } = options;
  const result = computeWorldExtent(region, createLocalFrame(region.center));
  if (!result.ok) {
    throw new WorldGenerationError(
      'region-too-large',
      `La región es demasiado grande para generar su mundo 3D: el rectángulo que la contiene debe medir como máximo ${String(MAX_GENERATED_REGION_M / 1000)} km por lado.`,
    );
  }
  const extent = result.extent;
  const seed = seedFromText(
    `${region.center.latitude.toFixed(6)},${region.center.longitude.toFixed(6)}`,
  );
  // 1 · Consulta de elevación, cobertura, elementos geográficos e imagen satelital (en paralelo).
  onStage({ stage: 'elevation', status: 'running' });
  const start = performance.now();
  const loadTile = (z: number, x: number, y: number): Promise<Blob | null> =>
    client.getImageryTile(z, x, y, signal);
  const [elevation, lcDetail, lcContext, features, contextFeatures, datasets, satD, satC] =
    await Promise.allSettled([
      client.getElevation(extent.elevationBBox, 2048, signal),
      client.getLandCover(extent.landcoverDetailBBox, 1024, signal),
      client.getLandCover(extent.landcoverContextBBox, 512, signal),
      client.getWorldFeatures(extent.featuresBBox, 14, signal),
      client.getWorldFeatures(extent.landcoverContextBBox, 11, signal),
      client.getWorldDatasets(signal),
      fetchImageryMosaic(imageryTileRange(extent.featuresBBox, DETAIL_IMAGERY_ZOOM), loadTile),
      fetchImageryMosaic(
        imageryTileRange(extent.landcoverContextBBox, CONTEXT_IMAGERY_ZOOM),
        loadTile,
      ),
    ]);
  if (signal?.aborted === true) throw new WorldGenerationError('aborted', 'Generación cancelada.');

  const failed: string[] = [];
  if (elevation.status === 'rejected')
    failed.push(`Elevación (NASADEM): ${describeFailure(elevation.reason)}`);
  if (lcDetail.status === 'rejected' || lcContext.status === 'rejected') {
    const reason: unknown =
      lcDetail.status === 'rejected'
        ? lcDetail.reason
        : (lcContext as PromiseRejectedResult).reason;
    failed.push(`Cobertura del suelo (ESA WorldCover): ${describeFailure(reason)}`);
  }
  if (failed.length > 0 && !options.allowProcedural) {
    onStage({ stage: 'elevation', status: 'error', detail: failed.join(' · ') });
    throw new WorldGenerationError(
      'data-unavailable',
      'No se pudieron obtener los datos reales.',
      failed,
    );
  }

  const elevationGrid =
    elevation.status === 'fulfilled'
      ? toFloatGrid(elevation.value)
      : proceduralElevation(extent.elevationBBox, seed);
  const realLandCover = lcDetail.status === 'fulfilled' && lcContext.status === 'fulfilled';
  const landCoverDetail =
    lcDetail.status === 'fulfilled' && realLandCover
      ? toClassGrid(lcDetail.value)
      : proceduralLandCover(extent.landcoverDetailBBox, seed);
  const landCoverContext =
    lcContext.status === 'fulfilled' && realLandCover
      ? toClassGrid(lcContext.value)
      : proceduralLandCover(extent.landcoverContextBBox, seed, 1 / 1200);
  const featureData: GeoFeatures | null = features.status === 'fulfilled' ? features.value : null;
  const contextData: GeoFeatures | null =
    contextFeatures.status === 'fulfilled' ? contextFeatures.value : null;
  // Un mosaico sin ningún mosaico descargado no aporta color (p. ej. sin conexión).
  const usable = (result: PromiseSettledResult<ImageryMosaic>): ImageryMosaic | null =>
    result.status === 'fulfilled' && result.value.tilesLoaded > 0 ? result.value : null;
  const imageryDetail = usable(satD);
  const imageryContext = usable(satC);

  // Bioma de la región: altitud mediana del área de detalle, latitud y cobertura del contexto.
  const classification = classifyBiome({
    latitudeDeg: region.center.latitude,
    elevationM: medianElevation(elevationGrid, extent.featuresBBox),
    shares: coverShares(landCoverContext.data),
  });
  const profile = classification.profile;
  const { species, missing: missingModels } = speciesForBiome(profile.vegetation, catalog);
  const layers = terrainLayerUrls(catalog, quality.materialResolution, biomeLayerIds(profile));

  const imageryFailure =
    imageryDetail !== null
      ? null
      : satD.status === 'rejected'
        ? describeFailure(satD.reason)
        : 'No se pudo descargar ningún mosaico de la imagen satelital';
  const sources: WorldSources = {
    datasets: datasets.status === 'fulfilled' ? datasets.value : null,
    elevation: {
      origin: elevation.status === 'fulfilled' ? 'real' : 'procedural',
      tiles: elevation.status === 'fulfilled' ? elevation.value.tiles : [],
      voidFraction: elevation.status === 'fulfilled' ? elevation.value.stats.voidFraction : 0,
      failure: elevation.status === 'rejected' ? describeFailure(elevation.reason) : null,
    },
    landCover: {
      origin: realLandCover ? 'real' : 'procedural',
      failure: realLandCover ? null : (failed.find((f) => f.startsWith('Cobertura')) ?? null),
    },
    features: {
      available: featureData !== null,
      reason: features.status === 'rejected' ? describeFailure(features.reason) : null,
      origin: featureData?.origin ?? null,
      snapshotId: featureData?.snapshotId ?? null,
      osmTimestamp: featureData?.osmTimestamp ?? null,
      count: featureData?.features.length ?? 0,
      contextCount: contextData?.features.length ?? 0,
    },
    imagery: {
      available: imageryDetail !== null,
      tilesLoaded: (imageryDetail?.tilesLoaded ?? 0) + (imageryContext?.tilesLoaded ?? 0),
      tilesMissing: (imageryDetail?.tilesMissing ?? 0) + (imageryContext?.tilesMissing ?? 0),
      failure: imageryFailure,
    },
    biome: {
      ...classification,
      fromProceduralData: elevation.status === 'rejected' || !realLandCover,
      missingModels,
    },
  };
  onStage({
    stage: 'elevation',
    status: 'done',
    durationMs: performance.now() - start,
    detail:
      sources.elevation.origin === 'real'
        ? `NASADEM ${String(elevationGrid.width)} × ${String(elevationGrid.height)} px (${sources.elevation.tiles.join(', ')}); ${String(sources.features.count)} elementos OSM; ${String(sources.imagery.tilesLoaded)} mosaicos satelitales; bioma ${profile.label}`
        : 'Relieve PROCEDURAL de demostración (fuente real no disponible)',
  });

  const data: WorldSourceData = {
    elevation: elevationGrid,
    elevationOrigin: sources.elevation.origin,
    landCoverDetail,
    landCoverContext,
    landCoverOrigin: sources.landCover.origin,
    features: featureData === null ? null : featureData.features,
    contextFeatures: contextData === null ? null : contextData.features,
    imageryDetail,
    imageryContext,
  };

  // 2–6 · Etapas pesadas en el worker.
  const worker = (options.createWorker ?? defaultWorker)();
  const order: StageId[] = ['normalize', 'mesh', 'materials', 'features', 'vegetation'];
  onStage({ stage: 'normalize', status: 'running' });
  try {
    const { build, textures } = await new Promise<{
      build: WorldBuild;
      textures: TerrainTextureSet;
    }>((resolve, reject) => {
      const abort = (): void => {
        reject(new WorldGenerationError('aborted', 'Generación cancelada.'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === 'stage') {
          onStage({
            stage: message.stage,
            status: 'done',
            durationMs: message.durationMs,
            detail: message.detail,
          });
          const next = order[order.indexOf(message.stage) + 1];
          if (next !== undefined) onStage({ stage: next, status: 'running' });
        } else if (message.type === 'done') {
          signal?.removeEventListener('abort', abort);
          resolve({ build: message.build, textures: message.textures });
        } else {
          signal?.removeEventListener('abort', abort);
          reject(new WorldGenerationError('worker', message.message));
        }
      };
      worker.onerror = (event) => {
        reject(
          new WorldGenerationError('worker', event.message || 'Error en el generador del mundo'),
        );
      };
      const request: BuildRequest = {
        type: 'build',
        input: { region, extent, quality, seed, data, biome: profile.id, species },
        textures: { layers, resolution: quality.materialResolution },
      };
      const transfer = [
        elevationGrid.data.buffer as ArrayBuffer,
        landCoverDetail.data.buffer as ArrayBuffer,
        landCoverContext.data.buffer as ArrayBuffer,
      ];
      if (imageryDetail !== null) transfer.push(imageryDetail.rgba.buffer as ArrayBuffer);
      if (imageryContext !== null) transfer.push(imageryContext.rgba.buffer as ArrayBuffer);
      worker.postMessage(request, transfer);
    });
    return { region, extent, quality, seed, build, textures, sources, species };
  } finally {
    worker.terminate();
  }
}
