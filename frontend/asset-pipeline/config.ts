import path from 'node:path';

import type { AssetLicense } from '../src/assets/catalogSchema.ts';

export const PIPELINE_VERSION = '0.1.0';

export const FRONTEND_ROOT = path.resolve(import.meta.dirname, '..');
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');

/** Descargas originales (no versionadas). */
export const CACHE_DIR = path.join(FRONTEND_ROOT, '.asset-cache');
/** Biblioteca procesada para la web (no versionada; se regenera con `make assets`). */
export const LIBRARY_DIR = path.join(FRONTEND_ROOT, 'asset-library');
export const CATALOG_FILE = path.join(LIBRARY_DIR, 'catalog.json');
/** Huellas SHA-256 de cada archivo descargado (versionado). */
export const LOCK_FILE = path.join(import.meta.dirname, 'sources.lock.json');
export const ASSETS_DOC = path.join(REPO_ROOT, 'docs', 'ASSETS.md');

/**
 * Las condiciones de la API de Poly Haven (cláusula 2.4) piden un User-Agent propio del software.
 * Por privacidad se usa un nombre genérico; puede sustituirse con `ASSET_PIPELINE_USER_AGENT`.
 */
export const USER_AGENT = process.env.ASSET_PIPELINE_USER_AGENT ?? 'farm-asset-pipeline/0.1';

export const DOWNLOAD_CONCURRENCY = 3;

const CC0 = {
  id: 'CC0-1.0',
  name: 'Creative Commons CC0 1.0 Universal',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attributionRequired: false,
  verifiedAt: '2026-11-14',
} as const;

export const POLY_HAVEN_LICENSE: AssetLicense = {
  ...CC0,
  verificationUrl: 'https://polyhaven.com/license',
};

export const AMBIENTCG_LICENSE: AssetLicense = {
  ...CC0,
  verificationUrl: 'https://docs.ambientcg.com/license/',
};
