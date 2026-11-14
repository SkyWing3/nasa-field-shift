import { readFile } from 'node:fs/promises';

import {
  ASSET_CATALOG_SCHEMA_VERSION,
  type AssetCatalog,
  type AssetEntry,
  type AssetFile,
  type AssetLicense,
  type AssetValidation,
} from '../../src/assets/catalogSchema.ts';
import { AMBIENTCG_LICENSE, PIPELINE_VERSION, POLY_HAVEN_LICENSE } from '../config.ts';
import type { AssetSelection, DownloadSelection, MissingSelection } from '../selection.ts';
import { writeFileAtomic } from './files.ts';
import type { ResolvedSource } from './sources.ts';

const NO_VALIDATION: AssetValidation = { checks: [], gltfValidator: null };

function baseEntry(
  selection: AssetSelection,
): Pick<AssetEntry, 'id' | 'name' | 'description' | 'kind' | 'category' | 'group'> {
  return {
    id: selection.id,
    name: selection.name,
    description: selection.description,
    kind: selection.kind,
    category: selection.category,
    group: selection.group,
  };
}

export function licenseFor(selection: DownloadSelection): AssetLicense {
  return selection.source.provider === 'polyhaven' ? POLY_HAVEN_LICENSE : AMBIENTCG_LICENSE;
}

export function missingEntry(selection: MissingSelection): AssetEntry {
  return {
    ...baseEntry(selection),
    status: 'missing',
    source: null,
    authors: [],
    license: null,
    files: [],
    sizeBytes: 0,
    model: null,
    material: null,
    hdri: null,
    missing: selection.missing,
    error: null,
    validation: NO_VALIDATION,
  };
}

export function errorEntry(
  selection: DownloadSelection,
  source: ResolvedSource | null,
  message: string,
): AssetEntry {
  return {
    ...baseEntry(selection),
    status: 'error',
    source:
      source === null
        ? null
        : {
            provider: source.provider,
            providerAssetId: source.providerAssetId,
            pageUrl: source.pageUrl,
          },
    authors: source?.metadata.authors ?? [],
    license: licenseFor(selection),
    files: [],
    sizeBytes: 0,
    model: null,
    material: null,
    hdri: null,
    missing: null,
    error: message,
    validation: NO_VALIDATION,
  };
}

export function availableEntry(
  selection: DownloadSelection,
  source: ResolvedSource,
  result: {
    readonly files: readonly AssetFile[];
    readonly validation: AssetValidation;
    readonly model?: AssetEntry['model'];
    readonly material?: AssetEntry['material'];
    readonly hdri?: AssetEntry['hdri'];
  },
): AssetEntry {
  const failed = result.validation.checks.filter((check) => !check.passed);
  return {
    ...baseEntry(selection),
    // Un asset que no supera sus comprobaciones no se ofrece como disponible.
    status: failed.length === 0 ? 'available' : 'error',
    source: {
      provider: source.provider,
      providerAssetId: source.providerAssetId,
      pageUrl: source.pageUrl,
    },
    authors: source.metadata.authors,
    license: licenseFor(selection),
    files: result.files,
    sizeBytes: result.files.reduce((sum, file) => sum + file.bytes, 0),
    model: result.model ?? null,
    material: result.material ?? null,
    hdri: result.hdri ?? null,
    missing: null,
    error:
      failed.length === 0
        ? null
        : `Comprobaciones fallidas: ${failed.map((check) => check.name).join('; ')}`,
    validation: result.validation,
  };
}

export async function readCatalog(filePath: string): Promise<AssetCatalog | null> {
  try {
    const catalog = JSON.parse(await readFile(filePath, 'utf8')) as AssetCatalog;
    return catalog.schemaVersion === ASSET_CATALOG_SCHEMA_VERSION ? catalog : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function createCatalog(assets: readonly AssetEntry[], generatedAt: Date): AssetCatalog {
  return {
    schemaVersion: ASSET_CATALOG_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    assets,
  };
}

export async function writeCatalog(filePath: string, catalog: AssetCatalog): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
}
