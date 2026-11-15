/** Ruta pública de la biblioteca procesada (servida por el plugin de Vite en desarrollo). */
export const ASSET_LIBRARY_BASE = '/asset-library/';

export function assetFileUrl(path: string, base: string = ASSET_LIBRARY_BASE): string {
  return `${base}${path}`;
}
