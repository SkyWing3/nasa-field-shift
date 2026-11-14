import { readFile } from 'node:fs/promises';

import { asNumber, asRecord, asString, stableStringify } from './json.ts';
import { writeFileAtomic } from './files.ts';

export interface LockEntry {
  readonly bytes: number;
  readonly sha256: string;
}

export interface LockFile {
  readonly lockVersion: 1;
  readonly files: Readonly<Record<string, LockEntry>>;
}

export const EMPTY_LOCK: LockFile = { lockVersion: 1, files: {} };

export function parseLock(text: string): LockFile {
  const root = asRecord(JSON.parse(text) as unknown, 'sources.lock.json');
  if (root.lockVersion !== 1) throw new Error('sources.lock.json: versión no soportada');
  const files: Record<string, LockEntry> = {};
  for (const [url, value] of Object.entries(asRecord(root.files, 'files'))) {
    const entry = asRecord(value, url);
    const sha256 = asString(entry.sha256, `${url}.sha256`);
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${url}: sha256 no válido`);
    files[url] = { bytes: asNumber(entry.bytes, `${url}.bytes`), sha256 };
  }
  return { lockVersion: 1, files };
}

export async function readLock(filePath: string): Promise<LockFile> {
  try {
    return parseLock(await readFile(filePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_LOCK;
    throw error;
  }
}

export async function writeLock(filePath: string, lock: LockFile): Promise<void> {
  await writeFileAtomic(filePath, stableStringify(lock));
}

export type LockCheck = 'match' | 'unknown' | 'mismatch';

/** Compara una descarga con su huella registrada. */
export function checkAgainstLock(lock: LockFile, url: string, actual: LockEntry): LockCheck {
  const expected = lock.files[url];
  if (expected === undefined) return 'unknown';
  return expected.sha256 === actual.sha256 && expected.bytes === actual.bytes
    ? 'match'
    : 'mismatch';
}

export function withEntry(lock: LockFile, url: string, entry: LockEntry): LockFile {
  return { lockVersion: 1, files: { ...lock.files, [url]: entry } };
}
