import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Une `base` con una ruta relativa procedente de datos externos, impidiendo salir de `base`
 * (rutas absolutas, `..`, unidades de Windows).
 */
export function safeJoin(base: string, relative: string): string {
  if (relative.length === 0 || path.isAbsolute(relative) || /^[a-zA-Z]:/.test(relative)) {
    throw new Error(`Ruta no permitida: "${relative}"`);
  }
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, relative);
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Ruta fuera del directorio permitido: "${relative}"`);
  }
  return target;
}

/** Ruta relativa con separadores `/`, apta para URLs y para el catálogo. */
export function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

export async function hashFile(
  filePath: string,
  algorithm: 'sha256' | 'md5' = 'sha256',
): Promise<string> {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function hashBytes(bytes: Uint8Array, algorithm: 'sha256' | 'md5' = 'sha256'): string {
  return createHash(algorithm).update(bytes).digest('hex');
}

/** Escritura atómica: escribe en un temporal y lo renombra. */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${String(process.pid)}`;
  await writeFile(temporary, data);
  await rename(temporary, filePath);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit: (typeof units)[number] = units[0];
  for (const next of units.slice(1)) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${unit}`;
}
