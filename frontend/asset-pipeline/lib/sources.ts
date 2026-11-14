/**
 * Adaptadores de las fuentes. Traducen las respuestas de las API públicas a una lista de archivos
 * que descargar, con su tamaño y MD5 publicados. No se construyen URLs a mano: todas proceden de
 * las propias API.
 */
import path from 'node:path';

import type { AssetProvider } from '../../src/assets/catalogSchema.ts';
import { CACHE_DIR } from '../config.ts';
import type { DownloadSelection } from '../selection.ts';
import { safeJoin } from './files.ts';
import { fetchJsonCached } from './http.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type JsonRecord,
  optionalNumber,
  optionalString,
} from './json.ts';

export type RemoteFileRole =
  'gltf' | 'gltf-resource' | 'albedo' | 'normal' | 'arm' | 'height' | 'zip' | 'hdri-1k' | 'hdri-2k';

export interface RemoteFile {
  readonly url: string;
  /** Ruta relativa dentro de la carpeta de caché del asset. */
  readonly cachePath: string;
  readonly bytes: number | null;
  readonly md5: string | null;
  readonly role: RemoteFileRole;
}

export interface SourceMetadata {
  readonly title: string;
  readonly authors: readonly string[];
  /** Dimensiones publicadas por la fuente, en milímetros y ejes de origen. */
  readonly dimensionsMm: readonly number[] | null;
  readonly polycount: number | null;
  readonly capturedAtUnix: number | null;
  readonly coordinates: readonly [number, number] | null;
  readonly whiteBalanceK: number | null;
  readonly timeOfDay: string | null;
  readonly weather: string | null;
}

export interface ResolvedSource {
  readonly provider: AssetProvider;
  readonly providerAssetId: string;
  readonly pageUrl: string;
  /** Carpeta absoluta de la caché de descargas de este asset. */
  readonly cacheDir: string;
  readonly metadata: SourceMetadata;
  readonly files: readonly RemoteFile[];
}

// ── Poly Haven ───────────────────────────────────────────────────────────────────────────────

const POLY_HAVEN_API = 'https://api.polyhaven.com';

export function parsePolyHavenInfo(json: unknown): SourceMetadata {
  const info = asRecord(json, 'Poly Haven info');
  const authors = Object.entries(asRecord(info.authors, 'authors')).map(([name, role]) =>
    typeof role === 'string' && role !== 'All' ? `${name} (${role})` : name,
  );
  const attributes = typeof info.attributes === 'object' ? (info.attributes as JsonRecord) : {};
  const coords = Array.isArray(info.coords) ? info.coords : null;
  return {
    title: asString(info.name, 'name'),
    authors,
    dimensionsMm: Array.isArray(info.dimensions)
      ? info.dimensions.map((value, index) => asNumber(value, `dimensions[${index}]`))
      : null,
    polycount: optionalNumber(info.polycount),
    capturedAtUnix: optionalNumber(info.date_taken),
    coordinates:
      coords?.length === 2
        ? [asNumber(coords[0], 'coords[0]'), asNumber(coords[1], 'coords[1]')]
        : null,
    whiteBalanceK: optionalNumber(info.whitebalance),
    timeOfDay: optionalString(attributes.time_of_day),
    weather: optionalString(attributes.weather),
  };
}

interface PolyHavenFileRef {
  readonly url: string;
  readonly md5: string;
  readonly size: number;
}

function polyHavenFileRef(value: unknown, context: string): PolyHavenFileRef {
  const ref = asRecord(value, context);
  return {
    url: asString(ref.url, `${context}.url`),
    md5: asString(ref.md5, `${context}.md5`),
    size: asNumber(ref.size, `${context}.size`),
  };
}

function remote(ref: PolyHavenFileRef, cachePath: string, role: RemoteFileRole): RemoteFile {
  return { url: ref.url, cachePath, bytes: ref.size, md5: ref.md5, role };
}

function basenameOf(url: string): string {
  return path.posix.basename(new URL(url).pathname);
}

export function polyHavenModelFiles(json: unknown, resolution: string): RemoteFile[] {
  const files = asRecord(json, 'Poly Haven files');
  const gltf = asRecord(
    asRecord(asRecord(files.gltf, 'gltf')[resolution], resolution).gltf,
    'gltf.gltf',
  );
  const main = polyHavenFileRef(gltf, 'gltf');
  const result = [remote(main, basenameOf(main.url), 'gltf')];
  for (const [relativePath, value] of Object.entries(asRecord(gltf.include, 'include'))) {
    result.push(remote(polyHavenFileRef(value, relativePath), relativePath, 'gltf-resource'));
  }
  return result;
}

const POLY_HAVEN_MAPS: readonly (readonly [string, RemoteFileRole])[] = [
  ['Diffuse', 'albedo'],
  ['nor_gl', 'normal'],
  ['arm', 'arm'],
  ['Displacement', 'height'],
];

export function polyHavenMaterialFiles(json: unknown, resolution: string): RemoteFile[] {
  const files = asRecord(json, 'Poly Haven files');
  return POLY_HAVEN_MAPS.map(([map, role]) => {
    const byFormat = asRecord(asRecord(files[map], map)[resolution], `${map}.${resolution}`);
    const format = 'jpg' in byFormat ? 'jpg' : 'png';
    const ref = polyHavenFileRef(byFormat[format], `${map}.${resolution}.${format}`);
    return remote(ref, basenameOf(ref.url), role);
  });
}

export function polyHavenHdriFiles(json: unknown, resolutions: readonly string[]): RemoteFile[] {
  const hdri = asRecord(asRecord(json, 'Poly Haven files').hdri, 'hdri');
  return resolutions.map((resolution) => {
    const ref = polyHavenFileRef(
      asRecord(hdri[resolution], `hdri.${resolution}`).hdr,
      `hdri.${resolution}.hdr`,
    );
    return remote(ref, basenameOf(ref.url), resolution === '1k' ? 'hdri-1k' : 'hdri-2k');
  });
}

async function resolvePolyHaven(
  selection: DownloadSelection,
  refresh: boolean,
): Promise<ResolvedSource> {
  const id = selection.source.id;
  const apiCache = path.join(CACHE_DIR, 'api', 'polyhaven');
  const [info, files] = await Promise.all([
    fetchJsonCached(
      `${POLY_HAVEN_API}/info/${encodeURIComponent(id)}`,
      path.join(apiCache, `${id}.info.json`),
      refresh,
    ),
    fetchJsonCached(
      `${POLY_HAVEN_API}/files/${encodeURIComponent(id)}`,
      path.join(apiCache, `${id}.files.json`),
      refresh,
    ),
  ]);
  let remoteFiles: RemoteFile[];
  switch (selection.kind) {
    case 'model':
      remoteFiles = polyHavenModelFiles(files, selection.sourceResolution);
      break;
    case 'material':
      remoteFiles = polyHavenMaterialFiles(files, '2k');
      break;
    case 'hdri':
      remoteFiles = polyHavenHdriFiles(files, selection.resolutions);
      break;
  }
  return {
    provider: 'Poly Haven',
    providerAssetId: id,
    pageUrl: `https://polyhaven.com/a/${encodeURIComponent(id)}`,
    cacheDir: safeJoin(path.join(CACHE_DIR, 'polyhaven'), id),
    metadata: parsePolyHavenInfo(info),
    files: remoteFiles,
  };
}

// ── ambientCG ────────────────────────────────────────────────────────────────────────────────

const AMBIENTCG_API = 'https://ambientcg.com/api/v2/full_json';

export function ambientCgZipFile(json: unknown, assetId: string, attribute: string): RemoteFile {
  const found = asArray(asRecord(json, 'ambientCG').foundAssets, 'foundAssets')
    .map((value) => asRecord(value, 'asset'))
    .find((asset) => asset.assetId === assetId);
  if (found === undefined) throw new Error(`ambientCG no devolvió el asset ${assetId}`);
  const zip = asRecord(
    asRecord(
      asRecord(asRecord(found.downloadFolders, 'downloadFolders').default, 'default')
        .downloadFiletypeCategories,
      'downloadFiletypeCategories',
    ).zip,
    'zip',
  );
  const download = asArray(zip.downloads, 'downloads')
    .map((value) => asRecord(value, 'download'))
    .find((entry) => entry.attribute === attribute);
  if (download === undefined) throw new Error(`ambientCG: ${assetId} no ofrece ${attribute}`);
  return {
    url: asString(download.downloadLink, 'downloadLink'),
    cachePath: asString(download.fileName, 'fileName'),
    bytes: asNumber(download.size, 'size'),
    md5: null,
    role: 'zip',
  };
}

async function resolveAmbientCg(
  selection: DownloadSelection,
  refresh: boolean,
): Promise<ResolvedSource> {
  const id = selection.source.id;
  const json = await fetchJsonCached(
    `${AMBIENTCG_API}?id=${encodeURIComponent(id)}&include=downloadData,displayData`,
    path.join(CACHE_DIR, 'api', 'ambientcg', `${id}.json`),
    refresh,
  );
  return {
    provider: 'ambientCG',
    providerAssetId: id,
    pageUrl: `https://ambientcg.com/a/${encodeURIComponent(id)}`,
    cacheDir: safeJoin(path.join(CACHE_DIR, 'ambientcg'), id),
    // La API de ambientCG no publica autor individual ni dimensiones físicas.
    metadata: {
      title: id,
      authors: [],
      dimensionsMm: null,
      polycount: null,
      capturedAtUnix: null,
      coordinates: null,
      whiteBalanceK: null,
      timeOfDay: null,
      weather: null,
    },
    files: [ambientCgZipFile(json, id, '2K-JPG')],
  };
}

export function resolveSource(
  selection: DownloadSelection,
  refresh: boolean,
): Promise<ResolvedSource> {
  return selection.source.provider === 'polyhaven'
    ? resolvePolyHaven(selection, refresh)
    : resolveAmbientCg(selection, refresh);
}

export function localPath(source: ResolvedSource, file: RemoteFile): string {
  return safeJoin(source.cacheDir, file.cachePath);
}
