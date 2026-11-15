import {
  type GeocodingInfo,
  type GeocodingResults,
  type GeoFeatures,
  type HealthResponse,
  isGeocodingInfo,
  isGeocodingResults,
  isGeoFeatures,
  isHealthResponse,
  isRasterGrid,
  isWorldDatasets,
  type RasterGrid,
  type WorldDatasets,
} from './contracts';
import { ApiError } from './errors';

export interface SimulationClientOptions {
  /** URL base de la API, sin barra final. */
  readonly baseUrl: string;
  /** Tiempo máximo por petición. */
  readonly timeoutMs?: number;
  /** Implementación de fetch inyectable (pruebas). */
  readonly fetchFn?: typeof fetch;
}

/** Rectángulo geográfico en grados. */
export interface BBoxQuery {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export interface SimulationClient {
  getHealth(signal?: AbortSignal): Promise<HealthResponse>;
  getGeocodingInfo(signal?: AbortSignal): Promise<GeocodingInfo>;
  searchPlaces(query: string, limit: number, signal?: AbortSignal): Promise<GeocodingResults>;
  getWorldDatasets(signal?: AbortSignal): Promise<WorldDatasets>;
  getElevation(bbox: BBoxQuery, maxSize: number, signal?: AbortSignal): Promise<RasterGrid>;
  getLandCover(bbox: BBoxQuery, maxSize: number, signal?: AbortSignal): Promise<RasterGrid>;
  /** Elementos de OSM; `zoom` de las teselas vectoriales (14 = detalle, 11 = contexto). */
  getWorldFeatures(bbox: BBoxQuery, zoom: number, signal?: AbortSignal): Promise<GeoFeatures>;
  /** Mosaico JPEG de la imagen satelital; `null` si no existe (p. ej. océano). */
  getImageryTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Blob | null>;
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const { detail } = body;
      return typeof detail === 'string' ? detail : null;
    }
  } catch {
    // Cuerpo vacío o no JSON: el código HTTP basta.
  }
  return null;
}

const DEFAULT_TIMEOUT_MS = 5_000;
/** Los datos geográficos pueden tardar si no están en la caché del backend (lectura de COG). */
const WORLD_DATA_TIMEOUT_MS = 60_000;

function bboxParams(bbox: BBoxQuery, extra: Record<string, string> = {}): string {
  return new URLSearchParams({
    south: bbox.south.toFixed(6),
    west: bbox.west.toFixed(6),
    north: bbox.north.toFixed(6),
    east: bbox.east.toFixed(6),
    ...extra,
  }).toString();
}

/**
 * Cliente HTTP de la API de simulación. No conoce React ni el estado global:
 * devuelve datos comprobados o lanza `ApiError`.
 */
export function createSimulationClient(options: SimulationClientOptions): SimulationClient {
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function getJson<T>(
    path: string,
    guard: (value: unknown) => value is T,
    signal?: AbortSignal,
    requestTimeoutMs: number = timeoutMs,
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await fetchFn(`${options.baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: combined,
      });
    } catch (cause) {
      if (signal?.aborted) {
        throw new ApiError('aborted', `Petición cancelada: ${path}`, { cause });
      }
      if (timeoutSignal.aborted) {
        throw new ApiError('timeout', `Tiempo agotado (${String(requestTimeoutMs)} ms): ${path}`, {
          cause,
        });
      }
      throw new ApiError('network', `Error de red: ${path}`, { cause });
    }

    if (!response.ok) {
      throw new ApiError('http', `HTTP ${String(response.status)}: ${path}`, {
        status: response.status,
        detail: await readErrorDetail(response),
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new ApiError('invalid-response', `Respuesta no JSON: ${path}`, { cause });
    }
    if (!guard(body)) {
      throw new ApiError('invalid-response', `Respuesta fuera de contrato: ${path}`);
    }
    return body;
  }

  return {
    getHealth: (signal) => getJson('/api/health', isHealthResponse, signal),
    getGeocodingInfo: (signal) => getJson('/api/geocoding/info', isGeocodingInfo, signal),
    searchPlaces: (query, limit, signal) => {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      return getJson(`/api/geocoding/search?${params.toString()}`, isGeocodingResults, signal);
    },
    getWorldDatasets: (signal) => getJson('/api/world/datasets', isWorldDatasets, signal),
    getElevation: (bbox, maxSize, signal) =>
      getJson(
        `/api/world/elevation?${bboxParams(bbox, { maxSize: String(maxSize) })}`,
        isRasterGrid,
        signal,
        WORLD_DATA_TIMEOUT_MS,
      ),
    getLandCover: (bbox, maxSize, signal) =>
      getJson(
        `/api/world/landcover?${bboxParams(bbox, { maxSize: String(maxSize) })}`,
        isRasterGrid,
        signal,
        WORLD_DATA_TIMEOUT_MS,
      ),
    getWorldFeatures: (bbox, zoom, signal) =>
      getJson(
        `/api/world/features?${bboxParams(bbox, { zoom: String(zoom) })}`,
        isGeoFeatures,
        signal,
        WORLD_DATA_TIMEOUT_MS,
      ),
    getImageryTile: async (z, x, y, signal) => {
      const path = `/api/world/imagery/${String(z)}/${String(x)}/${String(y)}.jpg`;
      const timeoutSignal = AbortSignal.timeout(WORLD_DATA_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      let response: Response;
      try {
        response = await fetchFn(`${options.baseUrl}${path}`, {
          method: 'GET',
          headers: { Accept: 'image/jpeg' },
          signal: combined,
        });
      } catch (cause) {
        throw new ApiError('network', `Error de red: ${path}`, { cause });
      }
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new ApiError('http', `HTTP ${String(response.status)}: ${path}`, {
          status: response.status,
          detail: await readErrorDetail(response),
        });
      }
      return response.blob();
    },
  };
}
