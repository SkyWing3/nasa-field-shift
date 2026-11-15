/**
 * Persistencia de la ubicación y la región de trabajo confirmadas.
 *
 * Por ahora en `localStorage` del navegador (ADR-006 y ADR-030), detrás de una interfaz para poder
 * pasar a la API/SQLite en la fase de persistencia sin tocar la interfaz de usuario. El contenido
 * se valida al leerlo: un registro corrupto o de otra versión se descarta e informa.
 */
import {
  createRegion,
  type GeoPoint,
  geoPoint,
  type RectangularRegion,
  validateRegion,
} from '../geo';

export const SITE_STORAGE_KEY = 'terralab.site';
export const SITE_SCHEMA_VERSION = 1;

export type SiteSource = 'preset' | 'search' | 'map' | 'drawn' | 'coordinates';

export interface SavedSite {
  readonly name: string;
  readonly source: SiteSource;
  readonly presetId: string | null;
  readonly region: RectangularRegion;
  /**
   * Origen fijo del sistema de coordenadas local de la escena (ENU). Se guarda aparte del centro
   * para que las coordenadas de la escena no cambien aunque se recalcule la región.
   */
  readonly frameOrigin: GeoPoint;
  /** Fecha de confirmación (ISO 8601). */
  readonly confirmedAt: string;
}

export type SiteLoadResult =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly site: SavedSite }
  | { readonly status: 'invalid'; readonly reason: string };

export interface SiteRepository {
  load(): SiteLoadResult;
  /** Lanza `SitePersistenceError` si el almacenamiento no está disponible o está lleno. */
  save(site: SavedSite): void;
  clear(): void;
}

export class SitePersistenceError extends Error {
  override readonly name = 'SitePersistenceError';
}

const SOURCES: readonly SiteSource[] = ['preset', 'search', 'map', 'drawn', 'coordinates'];

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readPoint(value: unknown): GeoPoint | null {
  if (!isRecord(value) || !isNumber(value.latitude) || !isNumber(value.longitude)) return null;
  if (Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null;
  return geoPoint(value.latitude, value.longitude);
}

/** Valida y reconstruye un sitio guardado; devuelve el motivo si no es válido. */
export function parseSavedSite(raw: unknown): SavedSite | string {
  if (!isRecord(raw) || raw.schemaVersion !== SITE_SCHEMA_VERSION) return 'versión desconocida';
  const site = raw.site;
  if (!isRecord(site)) return 'falta el sitio';
  if (typeof site.name !== 'string' || site.name.trim().length === 0) return 'nombre no válido';
  if (!SOURCES.includes(site.source as SiteSource)) return 'origen no válido';
  if (site.presetId !== null && typeof site.presetId !== 'string') return 'preset no válido';
  if (typeof site.confirmedAt !== 'string' || Number.isNaN(Date.parse(site.confirmedAt))) {
    return 'fecha no válida';
  }
  const region = site.region;
  if (!isRecord(region)) return 'falta la región';
  const center = readPoint(region.center);
  const origin = readPoint(site.frameOrigin);
  if (center === null || origin === null) return 'coordenadas no válidas';
  if (!isNumber(region.widthM) || !isNumber(region.lengthM) || !isNumber(region.orientationDeg)) {
    return 'dimensiones no válidas';
  }
  const rebuilt = createRegion(center, region.widthM, region.lengthM, region.orientationDeg);
  if (validateRegion(rebuilt).length > 0) return 'región fuera de límites';
  return {
    name: site.name.trim(),
    source: site.source as SiteSource,
    presetId: site.presetId,
    region: rebuilt,
    frameOrigin: origin,
    confirmedAt: site.confirmedAt,
  };
}

/** `localStorage` puede no existir o lanzar (modo privado, cookies bloqueadas). */
function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createLocalSiteRepository(
  storage: Storage | null = browserStorage(),
): SiteRepository {
  return {
    load() {
      if (storage === null) return { status: 'empty' };
      let text: string | null;
      try {
        text = storage.getItem(SITE_STORAGE_KEY);
      } catch {
        return { status: 'empty' };
      }
      if (text === null) return { status: 'empty' };
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { status: 'invalid', reason: 'JSON no válido' };
      }
      const parsed = parseSavedSite(raw);
      return typeof parsed === 'string'
        ? { status: 'invalid', reason: parsed }
        : { status: 'ok', site: parsed };
    },
    save(site) {
      if (storage === null) {
        throw new SitePersistenceError('El almacenamiento local del navegador no está disponible.');
      }
      try {
        storage.setItem(
          SITE_STORAGE_KEY,
          JSON.stringify({ schemaVersion: SITE_SCHEMA_VERSION, site }),
        );
      } catch (cause) {
        throw new SitePersistenceError('No se pudo guardar la ubicación en este navegador.', {
          cause,
        });
      }
    },
    clear() {
      try {
        storage?.removeItem(SITE_STORAGE_KEY);
      } catch {
        // Nada que limpiar si el almacenamiento no está accesible.
      }
    },
  };
}
