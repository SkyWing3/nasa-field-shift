/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BASEMAP_STYLE_URL?: string;
  readonly VITE_SATELLITE_TILES_URL?: string;
  readonly VITE_RAIZ_COMPARADOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versión de la aplicación, inyectada por Vite desde package.json. */
declare const __APP_VERSION__: string;
