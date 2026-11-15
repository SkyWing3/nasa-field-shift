/**
 * Pipeline de assets de TerraLab 3D.
 *
 *   node asset-pipeline/cli.ts fetch    Descarga los originales y verifica MD5/SHA-256.
 *   node asset-pipeline/cli.ts process  Procesa, valida y genera catalog.json y docs/ASSETS.md.
 *   node asset-pipeline/cli.ts all      fetch + process.
 *   node asset-pipeline/cli.ts verify   Comprueba la integridad de la biblioteca procesada.
 *   node asset-pipeline/cli.ts docs     Regenera la tabla de docs/ASSETS.md desde catalog.json.
 *
 * Opciones: --only=id1,id2 (subconjunto) · --refresh (vuelve a consultar las API).
 */
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { AssetEntry, AssetValidation } from '../src/assets/catalogSchema.ts';
import {
  ASSETS_DOC,
  CATALOG_FILE,
  DOWNLOAD_CONCURRENCY,
  LIBRARY_DIR,
  LOCK_FILE,
} from './config.ts';
import {
  availableEntry,
  createCatalog,
  errorEntry,
  missingEntry,
  readCatalog,
  writeCatalog,
} from './lib/catalog.ts';
import { renderCatalogMarkdown, replaceBetweenMarkers } from './lib/docs.ts';
import { formatBytes, hashFile, safeJoin, writeFileAtomic } from './lib/files.ts';
import { processHdri } from './lib/hdri.ts';
import { downloadFile, mapWithConcurrency } from './lib/http.ts';
import { checkAgainstLock, type LockFile, readLock, withEntry, writeLock } from './lib/lockfile.ts';
import { extractAmbientCgZip, type MaterialInputs, processMaterial } from './lib/material.ts';
import { processModel } from './lib/model.ts';
import {
  localPath,
  type RemoteFile,
  type RemoteFileRole,
  type ResolvedSource,
  resolveSource,
} from './lib/sources.ts';
import { ASSET_SELECTION, type AssetSelection, type DownloadSelection } from './selection.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    refresh: { type: 'boolean', default: false },
  },
});

const command = positionals[0] ?? 'all';
const onlyIds = values.only === undefined ? null : new Set(values.only.split(','));
const selected = (selection: AssetSelection): boolean =>
  onlyIds === null || onlyIds.has(selection.id);
const downloads = ASSET_SELECTION.filter(
  (selection): selection is DownloadSelection => selection.acquisition === 'download',
).filter(selected);

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

// ── fetch ────────────────────────────────────────────────────────────────────────────────────

async function fetchAll(): Promise<boolean> {
  let lock = await readLock(LOCK_FILE);
  const tasks: { source: ResolvedSource; file: RemoteFile }[] = [];
  for (const selection of downloads) {
    const source = await resolveSource(selection, values.refresh);
    for (const file of source.files) tasks.push({ source, file });
  }
  const expectedBytes = tasks.reduce((sum, task) => sum + (task.file.bytes ?? 0), 0);
  log(`Archivos: ${tasks.length} (${formatBytes(expectedBytes)}) de ${downloads.length} assets`);

  let downloaded = 0;
  let reused = 0;
  const failures: string[] = [];
  await mapWithConcurrency(tasks, DOWNLOAD_CONCURRENCY, async ({ source, file }) => {
    const destination = localPath(source, file);
    const label = `${source.providerAssetId}/${file.cachePath}`;
    try {
      if (await fileExists(destination)) {
        const cached = {
          bytes: (await stat(destination)).size,
          sha256: await hashFile(destination),
        };
        const check = checkAgainstLock(lock, file.url, cached);
        const md5Ok = file.md5 === null || file.md5 === (await hashFile(destination, 'md5'));
        const sizeOk = file.bytes === null || file.bytes === cached.bytes;
        if (check === 'match' || (check === 'unknown' && md5Ok && sizeOk)) {
          lock = withEntry(lock, file.url, cached);
          reused++;
          return;
        }
        await rm(destination);
      }
      const result = await downloadFile(file.url, destination, {
        bytes: file.bytes,
        md5: file.md5,
      });
      const entry = { bytes: result.bytes, sha256: result.sha256 };
      if (checkAgainstLock(lock, file.url, entry) === 'mismatch') {
        await rm(destination);
        throw new Error(
          'El SHA-256 no coincide con sources.lock.json (el archivo cambió en origen)',
        );
      }
      lock = withEntry(lock, file.url, entry);
      downloaded++;
      log(`  ↓ ${label} (${formatBytes(result.bytes)})`);
    } catch (error) {
      failures.push(`${label}: ${describe(error)}`);
    }
  });
  await writeLock(LOCK_FILE, lock);
  log(`Descargados ${downloaded}, verificados en caché ${reused}, fallidos ${failures.length}`);
  for (const failure of failures) log(`  ✗ ${failure}`);
  return failures.length === 0;
}

// ── process ──────────────────────────────────────────────────────────────────────────────────

async function verifiedInputs(
  source: ResolvedSource,
  lock: LockFile,
): Promise<Map<RemoteFileRole, string[]>> {
  const byRole = new Map<RemoteFileRole, string[]>();
  for (const file of source.files) {
    const filePath = localPath(source, file);
    if (!(await fileExists(filePath))) {
      throw new Error(`Falta ${file.cachePath} en la caché: ejecuta primero "fetch"`);
    }
    const actual = { bytes: (await stat(filePath)).size, sha256: await hashFile(filePath) };
    if (checkAgainstLock(lock, file.url, actual) !== 'match') {
      throw new Error(`${file.cachePath} no coincide con sources.lock.json`);
    }
    byRole.set(file.role, [...(byRole.get(file.role) ?? []), filePath]);
  }
  return byRole;
}

function single(inputs: Map<RemoteFileRole, string[]>, role: RemoteFileRole): string {
  const [first] = inputs.get(role) ?? [];
  if (first === undefined) throw new Error(`Falta el archivo de origen "${role}"`);
  return first;
}

async function processSelection(selection: DownloadSelection, lock: LockFile): Promise<AssetEntry> {
  let source: ResolvedSource | null = null;
  try {
    source = await resolveSource(selection, false);
    const inputs = await verifiedInputs(source, lock);
    const outputFolder = { model: 'models', material: 'materials', hdri: 'hdri' }[selection.kind];
    await rm(safeJoin(LIBRARY_DIR, path.join(outputFolder, selection.id)), {
      recursive: true,
      force: true,
    });
    switch (selection.kind) {
      case 'model': {
        const result = await processModel(
          selection,
          single(inputs, 'gltf'),
          source.metadata,
          LIBRARY_DIR,
        );
        const validation: AssetValidation = {
          checks: result.checks,
          gltfValidator: result.gltfValidator,
        };
        return availableEntry(selection, source, {
          files: [result.file],
          validation,
          model: result.info,
        });
      }
      case 'material': {
        const materialInputs: MaterialInputs =
          selection.source.provider === 'ambientcg'
            ? await extractAmbientCgZip(
                single(inputs, 'zip'),
                path.join(source.cacheDir, 'extracted'),
              )
            : {
                albedo: single(inputs, 'albedo'),
                normal: single(inputs, 'normal'),
                orm: { kind: 'packed', path: single(inputs, 'arm') },
                height: single(inputs, 'height'),
              };
        const result = await processMaterial(
          selection,
          materialInputs,
          source.metadata,
          LIBRARY_DIR,
        );
        return availableEntry(selection, source, {
          files: result.files,
          validation: { checks: result.checks, gltfValidator: null },
          material: result.info,
        });
      }
      case 'hdri': {
        const sources = selection.resolutions.map((resolution) => ({
          resolution,
          path: single(inputs, resolution === '1k' ? 'hdri-1k' : 'hdri-2k'),
        }));
        const result = await processHdri(selection, sources, source.metadata, LIBRARY_DIR);
        return availableEntry(selection, source, {
          files: result.files,
          validation: { checks: result.checks, gltfValidator: null },
          hdri: result.info,
        });
      }
    }
  } catch (error) {
    return errorEntry(selection, source, describe(error));
  }
}

async function processAll(): Promise<boolean> {
  const lock = await readLock(LOCK_FILE);
  const previous = new Map((await readCatalog(CATALOG_FILE))?.assets.map((a) => [a.id, a]) ?? []);
  const entries: AssetEntry[] = [];
  for (const selection of ASSET_SELECTION) {
    if (!selected(selection)) {
      const kept = previous.get(selection.id);
      if (kept !== undefined) entries.push(kept);
      continue;
    }
    if (selection.acquisition === 'missing') {
      entries.push(missingEntry(selection));
      continue;
    }
    const started = performance.now();
    const entry = await processSelection(selection, lock);
    entries.push(entry);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const symbol = entry.status === 'available' ? '✓' : '✗';
    log(
      `  ${symbol} ${selection.id} · ${formatBytes(entry.sizeBytes)} · ${seconds} s${entry.error === null ? '' : ` · ${entry.error}`}`,
    );
  }
  const catalog = createCatalog(entries, new Date());
  await writeCatalog(CATALOG_FILE, catalog);
  await updateDocs();
  const failed = entries.filter((entry) => entry.status === 'error');
  log(
    `Catálogo: ${entries.length} entradas, ${failed.length} con errores → ${path.relative(process.cwd(), CATALOG_FILE)}`,
  );
  return failed.length === 0;
}

// ── verify / docs ────────────────────────────────────────────────────────────────────────────

async function verifyLibrary(): Promise<boolean> {
  const catalog = await readCatalog(CATALOG_FILE);
  if (catalog === null) {
    log('No existe asset-library/catalog.json: ejecuta "make assets"');
    return false;
  }
  const problems: string[] = [];
  let checked = 0;
  for (const asset of catalog.assets) {
    for (const file of asset.files) {
      const filePath = safeJoin(LIBRARY_DIR, file.path);
      if (!(await fileExists(filePath))) {
        problems.push(`${file.path}: no existe`);
        continue;
      }
      const { size } = await stat(filePath);
      const sha256 = await hashFile(filePath);
      if (size !== file.bytes || sha256 !== file.sha256) {
        problems.push(`${file.path}: tamaño o SHA-256 distintos del catálogo`);
      }
      checked++;
    }
  }
  log(`Archivos verificados: ${checked}; problemas: ${problems.length}`);
  for (const problem of problems) log(`  ✗ ${problem}`);
  return problems.length === 0;
}

async function updateDocs(): Promise<void> {
  const catalog = await readCatalog(CATALOG_FILE);
  if (catalog === null) throw new Error('No existe catalog.json');
  const document = await readFile(ASSETS_DOC, 'utf8');
  await writeFileAtomic(
    ASSETS_DOC,
    replaceBetweenMarkers(document, renderCatalogMarkdown(catalog)),
  );
  log(`Actualizado ${path.relative(process.cwd(), ASSETS_DOC)}`);
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.message}${cause}`;
}

const commands: Readonly<Record<string, () => Promise<boolean>>> = {
  fetch: fetchAll,
  process: processAll,
  all: async () => (await fetchAll()) && (await processAll()),
  verify: verifyLibrary,
  docs: async () => {
    await updateDocs();
    return true;
  },
};

const run = commands[command];
if (run === undefined) {
  log(`Comando desconocido "${command}". Usa: ${Object.keys(commands).join(', ')}`);
  process.exitCode = 2;
} else {
  process.exitCode = (await run()) ? 0 : 1;
}
