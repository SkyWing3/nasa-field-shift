import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { USER_AGENT } from '../config.ts';
import { writeFileAtomic } from './files.ts';

const RETRIES = 3;

async function withRetries<T>(label: string, task: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw new Error(`${label}: falló tras ${RETRIES} intentos`, { cause: lastError });
}

/**
 * Obtiene JSON de una API pública y lo guarda en caché local para no repetir consultas
 * (las condiciones de uso de las API piden no sobrecargar sus servidores).
 */
export async function fetchJsonCached(
  url: string,
  cacheFile: string,
  refresh: boolean,
): Promise<unknown> {
  if (!refresh) {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8')) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const data = await withRetries(url, async () => {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
    return response.json();
  });
  await writeFileAtomic(cacheFile, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

export interface DownloadResult {
  readonly bytes: number;
  readonly sha256: string;
  readonly md5: string;
}

export interface DownloadExpectation {
  readonly bytes: number | null;
  readonly md5: string | null;
}

/** Descarga a disco verificando tamaño y MD5 publicados por la fuente. */
export async function downloadFile(
  url: string,
  destination: string,
  expected: DownloadExpectation,
): Promise<DownloadResult> {
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  return withRetries(url, async () => {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!response.ok || response.body === null) {
      throw new Error(`HTTP ${response.status} al descargar ${url}`);
    }
    const sha256 = createHash('sha256');
    const md5 = createHash('md5');
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sha256.update(chunk);
        md5.update(chunk);
        bytes += chunk.length;
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial));
      const result: DownloadResult = {
        bytes,
        sha256: sha256.digest('hex'),
        md5: md5.digest('hex'),
      };
      if (expected.bytes !== null && expected.bytes !== result.bytes) {
        throw new Error(`Tamaño inesperado (${result.bytes} B, se esperaban ${expected.bytes} B)`);
      }
      if (expected.md5 !== null && expected.md5 !== result.md5) {
        throw new Error('El MD5 no coincide con el publicado por la fuente');
      }
      await rename(partial, destination);
      return result;
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
  });
}

/** Ejecuta tareas con concurrencia limitada, devolviendo resultados en orden. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
