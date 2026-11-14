import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AssetFile, HdriInfo, ValidationCheck } from '../../src/assets/catalogSchema.ts';
import type { HdriSelection } from '../selection.ts';
import { hashBytes, safeJoin, toPosixRelative, writeFileAtomic } from './files.ts';
import { parseRadianceHeader } from './radiance.ts';
import type { SourceMetadata } from './sources.ts';

const EXPECTED_WIDTH: Readonly<Record<'1k' | '2k', number>> = { '1k': 1024, '2k': 2048 };

export interface ProcessedHdri {
  readonly files: readonly AssetFile[];
  readonly info: HdriInfo;
  readonly checks: readonly ValidationCheck[];
}

/** Los HDR de Poly Haven ya son RGBE comprimido con RLE: se validan y se copian sin recodificar. */
export async function processHdri(
  selection: HdriSelection,
  sources: readonly { readonly resolution: '1k' | '2k'; readonly path: string }[],
  metadata: SourceMetadata,
  libraryDir: string,
): Promise<ProcessedHdri> {
  const files: AssetFile[] = [];
  const problems: string[] = [];
  for (const source of sources) {
    const bytes = await readFile(source.path);
    const header = parseRadianceHeader(bytes);
    const expectedWidth = EXPECTED_WIDTH[source.resolution];
    if (header.width !== expectedWidth || header.height * 2 !== header.width) {
      problems.push(`${source.resolution}: ${header.width}×${header.height}`);
    }
    const outputPath = safeJoin(
      libraryDir,
      path.join('hdri', selection.id, `${selection.id}_${source.resolution}.hdr`),
    );
    await writeFileAtomic(outputPath, bytes);
    files.push({
      path: toPosixRelative(libraryDir, outputPath),
      role: 'environment',
      format: 'hdr',
      bytes: bytes.byteLength,
      sha256: hashBytes(bytes),
      width: header.width,
      height: header.height,
    });
  }
  return {
    files,
    info: {
      resolutions: files.map((file) => file.width ?? 0),
      capturedAt:
        metadata.capturedAtUnix === null
          ? null
          : new Date(metadata.capturedAtUnix * 1000).toISOString(),
      latitude: metadata.coordinates?.[0] ?? null,
      longitude: metadata.coordinates?.[1] ?? null,
      whiteBalanceK: metadata.whiteBalanceK,
      timeOfDay: metadata.timeOfDay,
      weather: metadata.weather,
    },
    checks: [
      {
        name: 'Cabecera Radiance válida y proyección equirectangular 2:1',
        passed: problems.length === 0,
        detail:
          problems.length === 0
            ? files.map((file) => `${String(file.width)}×${String(file.height)}`).join(', ')
            : problems.join('; '),
      },
    ],
  };
}
