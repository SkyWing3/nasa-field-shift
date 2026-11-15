/**
 * Sirve `asset-library/` (biblioteca procesada, no versionada) en el servidor de desarrollo bajo
 * `/asset-library/`. No se copia al build de producción: qué assets se publican se decidirá en la
 * fase que los use (ADR-019).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin } from 'vite';

export const ASSET_LIBRARY_ROUTE = '/asset-library';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.hdr': 'image/vnd.radiance',
};

/**
 * Traduce la ruta pedida a un archivo dentro de `root`. Devuelve `null` si intenta salir de la
 * biblioteca, si no se puede decodificar o si la extensión no está permitida.
 */
export function resolveLibraryFile(root: string, requestUrl: string): string | null {
  const pathname = requestUrl.split(/[?#]/, 1)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const relative = decoded.replace(/^\/+/, '');
  if (relative.length === 0) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) return null;
  return path.extname(target).toLowerCase() in CONTENT_TYPES ? target : null;
}

export function assetLibraryPlugin(root: string): Plugin {
  return {
    name: 'terralab:asset-library',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ASSET_LIBRARY_ROUTE, (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }
        const notFound = (): void => {
          response.statusCode = 404;
          response.end();
        };
        const file = resolveLibraryFile(root, request.url ?? '/');
        if (file === null) {
          notFound();
          return;
        }
        stat(file).then((info) => {
          if (!info.isFile()) {
            notFound();
            return;
          }
          response.setHeader(
            'Content-Type',
            CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          );
          response.setHeader('Content-Length', String(info.size));
          response.setHeader('Cache-Control', 'no-cache');
          if (request.method === 'HEAD') {
            response.end();
            return;
          }
          createReadStream(file).on('error', next).pipe(response);
        }, notFound);
      });
    },
  };
}

export interface PublishedAssets {
  /** Materiales de terreno y la resolución que se publica. */
  readonly materials: readonly string[];
  readonly materialResolution: number;
  readonly models: readonly string[];
  readonly hdris: readonly string[];
}

interface CatalogFileJson {
  readonly path: string;
  readonly width?: number | null;
  readonly role?: string;
}

interface CatalogAssetJson {
  readonly id: string;
  readonly kind: string;
  readonly files: readonly CatalogFileJson[];
}

/** Archivos del catálogo que se publican para un asset (o `null` si el asset no se publica). */
export function publishedFiles(
  asset: CatalogAssetJson,
  published: PublishedAssets,
): CatalogFileJson[] | null {
  if (asset.kind === 'material' && published.materials.includes(asset.id)) {
    return asset.files.filter((file) => file.width === published.materialResolution);
  }
  if (asset.kind === 'model' && published.models.includes(asset.id)) return [...asset.files];
  if (asset.kind === 'hdri' && published.hdris.includes(asset.id)) return [...asset.files];
  return null;
}

/**
 * En el build de producción copia a `dist/asset-library/` solo los recursos que usa el mundo 3D
 * (fase 04, ADR-040) y un `catalog.json` reducido a ellos. Si la biblioteca no está generada
 * (`make assets`), avisa y no copia nada: la aplicación muestra entonces el error correspondiente.
 */
export function assetLibraryBuildPlugin(root: string, published: PublishedAssets): Plugin {
  let outDir = 'dist';
  return {
    name: 'terralab:asset-library-build',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const { copyFile, mkdir, readFile, writeFile } = await import('node:fs/promises');
      let catalog: { assets: CatalogAssetJson[] } & Record<string, unknown>;
      try {
        catalog = JSON.parse(
          await readFile(path.join(root, 'catalog.json'), 'utf8'),
        ) as typeof catalog;
      } catch {
        this.warn(
          'asset-library/catalog.json no existe: el mundo 3D no tendrá recursos (ejecuta make assets)',
        );
        return;
      }
      const target = path.join(outDir, 'asset-library');
      const assets: CatalogAssetJson[] = [];
      let bytes = 0;
      for (const asset of catalog.assets) {
        const files = publishedFiles(asset, published);
        if (files === null) continue;
        for (const file of files) {
          const source = resolveLibraryFile(root, file.path);
          if (source === null) continue;
          const destination = path.join(target, file.path);
          await mkdir(path.dirname(destination), { recursive: true });
          await copyFile(source, destination);
          bytes += (await stat(destination)).size;
        }
        assets.push({ ...asset, files });
      }
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'catalog.json'), JSON.stringify({ ...catalog, assets }));
      this.info(
        `asset-library: ${String(assets.length)} recursos publicados (${(bytes / 1_048_576).toFixed(1)} MB)`,
      );
    },
  };
}
