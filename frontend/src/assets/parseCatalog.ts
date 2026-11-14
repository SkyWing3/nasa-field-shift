import {
  ASSET_CATALOG_SCHEMA_VERSION,
  type AssetCatalog,
  type AssetCategory,
  type AssetFile,
  type AssetKind,
  type AssetStatus,
} from './catalogSchema';

export class CatalogFormatError extends Error {
  override readonly name = 'CatalogFormatError';
}

const KINDS: readonly AssetKind[] = ['model', 'material', 'hdri'];
const CATEGORIES: readonly AssetCategory[] = [
  'terrain',
  'vegetation',
  'crop',
  'environment',
  'lighting',
];
const STATUSES: readonly AssetStatus[] = ['available', 'missing', 'error'];
const FILE_FORMATS: readonly AssetFile['format'][] = ['glb', 'webp', 'hdr'];
const FILE_ROLES: readonly AssetFile['role'][] = [
  'model',
  'albedo',
  'normal',
  'orm',
  'height',
  'environment',
];

/** Rutas relativas seguras: sin `..`, sin barra inicial y con caracteres de nombre de archivo. */
const SAFE_PATH = /^(?!.*\.\.)[a-z0-9_-]+(?:\/[a-z0-9_.-]+)*$/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(context: string, message: string): never {
  throw new CatalogFormatError(`${context}: ${message}`);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], context: string): T {
  if (typeof value === 'string' && (options as readonly string[]).includes(value))
    return value as T;
  return fail(context, `valor no reconocido "${String(value)}"`);
}

function checkFile(value: unknown, context: string): void {
  if (!isRecord(value)) fail(context, 'se esperaba un objeto');
  if (typeof value.path !== 'string' || !SAFE_PATH.test(value.path)) {
    fail(context, 'ruta no permitida');
  }
  if (typeof value.bytes !== 'number' || value.bytes < 0) fail(context, 'tamaño no válido');
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    fail(context, 'sha256 no válido');
  }
  oneOf(value.format, FILE_FORMATS, `${context}.format`);
  oneOf(value.role, FILE_ROLES, `${context}.role`);
}

/**
 * Valida la estructura de `catalog.json` antes de usarlo. Comprueba la versión del esquema, los
 * campos que el visualizador usa para decidir qué cargar y que todas las rutas sean seguras.
 */
export function parseAssetCatalog(json: unknown): AssetCatalog {
  if (!isRecord(json)) fail('catalog', 'se esperaba un objeto');
  if (json.schemaVersion !== ASSET_CATALOG_SCHEMA_VERSION) {
    fail(
      'catalog',
      `versión de esquema ${String(json.schemaVersion)} no soportada (se esperaba ${ASSET_CATALOG_SCHEMA_VERSION}); regenera con "make assets"`,
    );
  }
  if (typeof json.generatedAt !== 'string' || Number.isNaN(Date.parse(json.generatedAt))) {
    fail('catalog.generatedAt', 'fecha no válida');
  }
  if (typeof json.pipelineVersion !== 'string') fail('catalog.pipelineVersion', 'falta');
  if (!Array.isArray(json.assets)) fail('catalog.assets', 'se esperaba una lista');

  const ids = new Set<string>();
  json.assets.forEach((asset: unknown, index) => {
    const context = `assets[${index}]`;
    if (!isRecord(asset)) fail(context, 'se esperaba un objeto');
    if (typeof asset.id !== 'string' || !/^[a-z0-9_]+$/.test(asset.id)) {
      fail(context, 'id no válido');
    }
    if (ids.has(asset.id)) fail(context, `id duplicado "${asset.id}"`);
    ids.add(asset.id);
    if (typeof asset.name !== 'string' || asset.name.length === 0) fail(context, 'falta el nombre');
    const kind = oneOf(asset.kind, KINDS, `${context}.kind`);
    oneOf(asset.category, CATEGORIES, `${context}.category`);
    const status = oneOf(asset.status, STATUSES, `${context}.status`);
    if (!Array.isArray(asset.files)) fail(context, 'files debe ser una lista');
    asset.files.forEach((file: unknown, fileIndex) => {
      checkFile(file, `${context}.files[${fileIndex}]`);
    });
    if (!Array.isArray(asset.authors)) fail(context, 'authors debe ser una lista');
    if (!isRecord(asset.validation) || !Array.isArray(asset.validation.checks)) {
      fail(context, 'falta la validación');
    }
    if (status === 'available') {
      if (asset.files.length === 0) fail(context, 'un asset disponible necesita archivos');
      if (!isRecord(asset.license) || !isRecord(asset.source)) {
        fail(context, 'un asset disponible necesita fuente y licencia');
      }
      const details = { model: asset.model, material: asset.material, hdri: asset.hdri }[kind];
      if (!isRecord(details)) fail(context, `faltan los datos de ${kind}`);
      if (kind === 'model' && (!Array.isArray(details.lods) || details.lods.length === 0)) {
        fail(context, 'el modelo no declara niveles de detalle');
      }
    }
    if (status === 'missing' && !isRecord(asset.missing)) {
      fail(context, 'un recurso faltante debe explicar el motivo');
    }
  });
  return json as unknown as AssetCatalog;
}
