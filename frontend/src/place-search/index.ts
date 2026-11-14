/**
 * Búsqueda de lugares con proveedores intercambiables (ADR-028).
 *
 * La interfaz no sabe qué servicio responde: hoy es la API de TerraLab (que a su vez usa el
 * nomenclátor GeoNames local u otro proveedor configurado en el backend). Las coordenadas escritas
 * por el usuario se resuelven en local, sin red. La búsqueda solo se lanza por acción explícita
 * del usuario: no hay autocompletado (lo prohíbe la política de Nominatim y evita peticiones).
 */
import { type GeoPoint, geoPoint, parseCoordinates } from '../geo';
import {
  ApiError,
  describeApiError,
  type PlaceResult,
  type SimulationClient,
} from '../simulation-client';

export type PlaceSearchResultKind = 'coordinates' | PlaceResult['kind'];

export interface PlaceSearchResult {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly point: GeoPoint;
  readonly kind: PlaceSearchResultKind;
  /** Zoom sugerido para mostrar el resultado en el mapa. */
  readonly zoom: number;
}

export interface PlaceSearchAvailability {
  readonly available: boolean;
  readonly provider: string;
  readonly attribution: string;
  readonly attributionUrl: string;
}

export interface PlaceSearchProvider {
  availability(signal?: AbortSignal): Promise<PlaceSearchAvailability>;
  search(query: string, signal?: AbortSignal): Promise<readonly PlaceSearchResult[]>;
}

/** Error de búsqueda con un mensaje listo para mostrar. */
export class PlaceSearchError extends Error {
  override readonly name = 'PlaceSearchError';
}

const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });

export function countryName(code: string | null): string | null {
  if (code === null) return null;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function zoomFor(place: PlaceResult): number {
  if (place.kind !== 'populated-place') return 11;
  const population = place.population ?? 0;
  if (population > 500_000) return 11;
  if (population > 50_000) return 12;
  return 13;
}

export function fromPlaceResult(place: PlaceResult): PlaceSearchResult {
  return {
    id: place.id,
    name: place.name,
    detail: [place.region, countryName(place.countryCode)].filter(Boolean).join(' · '),
    point: geoPoint(place.latitude, place.longitude),
    kind: place.kind,
    zoom: zoomFor(place),
  };
}

export function coordinateResult(point: GeoPoint): PlaceSearchResult {
  return {
    id: `coordinates:${String(point.latitude)},${String(point.longitude)}`,
    name: 'Coordenadas',
    detail: `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`,
    point,
    kind: 'coordinates',
    zoom: 15,
  };
}

function describeSearchError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http' && error.detail !== null) {
    return error.detail;
  }
  return describeApiError(error);
}

/** Proveedor que consulta el endpoint `/api/geocoding` del backend. */
export function createApiPlaceSearch(client: SimulationClient, limit = 6): PlaceSearchProvider {
  return {
    async availability(signal) {
      try {
        const info = await client.getGeocodingInfo(signal);
        return {
          available: info.available,
          provider: info.provider,
          attribution: info.attribution,
          attributionUrl: info.attributionUrl,
        };
      } catch (error) {
        throw new PlaceSearchError(describeSearchError(error), { cause: error });
      }
    },
    async search(query, signal) {
      try {
        const response = await client.searchPlaces(query, limit, signal);
        return response.results.map(fromPlaceResult);
      } catch (error) {
        throw new PlaceSearchError(describeSearchError(error), { cause: error });
      }
    },
  };
}

/** Resuelve primero coordenadas escritas a mano; si no lo son, pregunta al proveedor. */
export async function searchPlaces(
  query: string,
  provider: PlaceSearchProvider,
  signal?: AbortSignal,
): Promise<readonly PlaceSearchResult[]> {
  const trimmed = query.trim();
  const coordinates = parseCoordinates(trimmed);
  if (coordinates !== null) return [coordinateResult(coordinates)];
  if (trimmed.length < 2) throw new PlaceSearchError('Escribe al menos 2 caracteres.');
  return provider.search(trimmed, signal);
}
