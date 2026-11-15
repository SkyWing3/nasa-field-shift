/**
 * Configuración de ejecución derivada de variables de entorno de Vite.
 * Se valida una sola vez al arrancar para fallar pronto ante valores incorrectos.
 */

/** Vacío: las peticiones /api usan el mismo origen que la página (proxy de Vite en desarrollo). */
export const DEFAULT_API_BASE_URL = '';
/** Estilo vectorial de OpenFreeMap (datos OpenStreetMap, sin clave ni límites de uso; ADR-027). */
export const DEFAULT_BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Mosaico Sentinel-2 cloudless 2016 de EOX (CC BY 4.0; ADR-027). */
export const DEFAULT_SATELLITE_TILES_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

export interface AppConfig {
  /** URL base de la API, sin barra final; vacío usa el mismo origen que la página. */
  readonly apiBaseUrl: string;
  /** Estilo MapLibre del mapa base; se puede cambiar de proveedor sin tocar el código. */
  readonly basemapStyleUrl: string;
  /** Plantilla XYZ de las teselas de satélite. */
  readonly satelliteTilesUrl: string;
}

export function parseApiBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ? raw.trim() : DEFAULT_API_BASE_URL;
  if (value === '' || value === '/') return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE_URL no es una URL válida: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`VITE_API_BASE_URL debe usar http o https: "${value}"`);
  }
  return url.href.replace(/\/+$/, '');
}

function parseHttpsUrl(name: string, raw: string | undefined, fallback: string): string {
  const value = raw?.trim() ? raw.trim() : fallback;
  if (!/^https:\/\/[^\s]+$/.test(value)) {
    throw new Error(`${name} debe ser una URL https: "${value}"`);
  }
  return value;
}

export function parseSatelliteTilesUrl(raw: string | undefined): string {
  const value = parseHttpsUrl('VITE_SATELLITE_TILES_URL', raw, DEFAULT_SATELLITE_TILES_URL);
  if (!['{z}', '{x}', '{y}'].every((placeholder) => value.includes(placeholder))) {
    throw new Error('VITE_SATELLITE_TILES_URL debe contener {z}, {x} e {y}');
  }
  return value;
}

export function loadAppConfig(env: ImportMetaEnv): AppConfig {
  return {
    apiBaseUrl: parseApiBaseUrl(env.VITE_API_BASE_URL),
    basemapStyleUrl: parseHttpsUrl(
      'VITE_BASEMAP_STYLE_URL',
      env.VITE_BASEMAP_STYLE_URL,
      DEFAULT_BASEMAP_STYLE_URL,
    ),
    satelliteTilesUrl: parseSatelliteTilesUrl(env.VITE_SATELLITE_TILES_URL),
  };
}
