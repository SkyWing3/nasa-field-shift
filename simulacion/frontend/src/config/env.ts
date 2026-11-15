/**
 * Configuración de ejecución derivada de variables de entorno de Vite.
 * Se valida una sola vez al arrancar para fallar pronto ante valores incorrectos.
 */

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
/** Estilo vectorial de OpenFreeMap (datos OpenStreetMap, sin clave ni límites de uso; ADR-027). */
export const DEFAULT_BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Mosaico Sentinel-2 cloudless 2016 de EOX (CC BY 4.0; ADR-027). */
export const DEFAULT_SATELLITE_TILES_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

/** Comparador de rotaciones de Raíz publicado (paquete precalculado; decisión v3.2 del equipo). */
export const DEFAULT_COMPARATOR_URL =
  'https://morning-violet-efd4.mila-eloc.workers.dev/releases/raiz-oruro-power-20261111-v1/';

/** En desarrollo, el comparador de Raíz (beta-frontend) corre en local, en el puerto 5175. */
export const DEV_COMPARATOR_URL = 'http://localhost:5175/';

export interface AppConfig {
  /** URL base de la API, sin barra final. */
  readonly apiBaseUrl: string;
  /** Estilo MapLibre del mapa base; se puede cambiar de proveedor sin tocar el código. */
  readonly basemapStyleUrl: string;
  /** Plantilla XYZ de las teselas de satélite. */
  readonly satelliteTilesUrl: string;
  /** Comparador de rotaciones de Raíz (sitio estático aparte), abierto desde la pantalla inicial. */
  readonly comparatorUrl: string;
}

export function parseApiBaseUrl(raw: string | undefined, origin?: string): string {
  const value = raw?.trim() ? raw.trim() : DEFAULT_API_BASE_URL;
  // «/» = mismo origen que la página (el servidor de Vite reenvía /api al backend).
  if (value === '/') return (origin ?? globalThis.location.origin).replace(/\/+$/, '');
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

/** https, o http solo para un servidor local de desarrollo (localhost / 127.0.0.1). */
export function parseComparatorUrl(raw: string | undefined, dev: boolean): string {
  const value = raw?.trim() ? raw.trim() : dev ? DEV_COMPARATOR_URL : DEFAULT_COMPARATOR_URL;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?$/.test(value)) return value;
  return parseHttpsUrl('VITE_RAIZ_COMPARADOR_URL', value, DEFAULT_COMPARATOR_URL);
}

/** Añade el idioma elegido para que la otra aplicación abra en el mismo idioma. */
export function withLanguage(
  url: string,
  language: string,
  extra: Readonly<Record<string, string>> = {},
): string {
  try {
    const target = new URL(url);
    target.searchParams.set('idioma', language);
    for (const [name, value] of Object.entries(extra)) target.searchParams.set(name, value);
    return target.href;
  } catch {
    return url;
  }
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
    comparatorUrl: parseComparatorUrl(env.VITE_RAIZ_COMPARADOR_URL, env.DEV),
  };
}
