/**
 * Procesado de materiales PBR de terreno: albedo, normal (convención OpenGL, +Y), ORM empaquetado
 * (R = oclusión, G = rugosidad, B = metalicidad, igual que glTF y three.js) y altura.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { unzipSync } from 'fflate';
import sharp, { type Sharp, type Stats } from 'sharp';

import type { AssetFile, MaterialInfo, ValidationCheck } from '../../src/assets/catalogSchema.ts';
import type { MaterialSelection } from '../selection.ts';
import { hashBytes, safeJoin, toPosixRelative, writeFileAtomic } from './files.ts';
import { estimateGpuTextureBytes } from './model.ts';
import type { SourceMetadata } from './sources.ts';
import { WEBP_COLOR, WEBP_DATA, WEBP_HEIGHT } from './webp.ts';

export type OrmInput =
  | { readonly kind: 'packed'; readonly path: string }
  | {
      readonly kind: 'channels';
      readonly ambientOcclusion: string | null;
      readonly roughness: string;
    };

export interface MaterialInputs {
  readonly albedo: string;
  readonly normal: string;
  readonly orm: OrmInput;
  readonly height: string;
}

const ZIP_MAPS = {
  albedo: /_Color\.jpe?g$/i,
  normal: /_NormalGL\.jpe?g$/i,
  roughness: /_Roughness\.jpe?g$/i,
  ambientOcclusion: /_AmbientOcclusion\.jpe?g$/i,
  height: /_Displacement\.jpe?g$/i,
} as const;

/** Extrae del ZIP de ambientCG solo los mapas necesarios. */
export async function extractAmbientCgZip(
  zipPath: string,
  outDir: string,
): Promise<MaterialInputs> {
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)), {
    filter: (file) => Object.values(ZIP_MAPS).some((pattern) => pattern.test(file.name)),
  });
  const found: Partial<Record<keyof typeof ZIP_MAPS, string>> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    const key = (Object.keys(ZIP_MAPS) as (keyof typeof ZIP_MAPS)[]).find((map) =>
      ZIP_MAPS[map].test(name),
    );
    if (key === undefined) continue;
    const target = safeJoin(outDir, path.posix.basename(name));
    await writeFileAtomic(target, bytes);
    found[key] = target;
  }
  const { albedo, normal, roughness, height } = found;
  if (
    albedo === undefined ||
    normal === undefined ||
    roughness === undefined ||
    height === undefined
  ) {
    throw new Error(
      `El ZIP no contiene todos los mapas necesarios: ${Object.keys(found).join(', ')}`,
    );
  }
  return {
    albedo,
    normal,
    height,
    orm: { kind: 'channels', ambientOcclusion: found.ambientOcclusion ?? null, roughness },
  };
}

async function singleChannel(file: string, size: number): Promise<Buffer> {
  return sharp(file).resize(size, size, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
}

async function buildOrm(input: OrmInput, size: number): Promise<Sharp> {
  if (input.kind === 'packed') {
    return sharp(input.path).resize(size, size, { fit: 'fill' }).removeAlpha();
  }
  const roughness = await singleChannel(input.roughness, size);
  const occlusion =
    input.ambientOcclusion === null
      ? Buffer.alloc(size * size, 255)
      : await singleChannel(input.ambientOcclusion, size);
  const packed = Buffer.alloc(size * size * 3);
  for (let pixel = 0; pixel < size * size; pixel++) {
    packed[pixel * 3] = occlusion[pixel] ?? 255;
    packed[pixel * 3 + 1] = roughness[pixel] ?? 255;
    packed[pixel * 3 + 2] = 0; // terreno: no metálico
  }
  return sharp(packed, { raw: { width: size, height: size, channels: 3 } });
}

type MapRole = 'albedo' | 'normal' | 'orm' | 'height';

async function encodeMap(inputs: MaterialInputs, role: MapRole, size: number): Promise<Buffer> {
  switch (role) {
    case 'albedo':
      return sharp(inputs.albedo)
        .resize(size, size, { fit: 'fill' })
        .removeAlpha()
        .webp(WEBP_COLOR)
        .toBuffer();
    case 'normal':
      return sharp(inputs.normal)
        .resize(size, size, { fit: 'fill' })
        .removeAlpha()
        .webp(WEBP_DATA)
        .toBuffer();
    case 'orm':
      return (await buildOrm(inputs.orm, size)).webp(WEBP_DATA).toBuffer();
    case 'height':
      return sharp(inputs.height)
        .resize(size, size, { fit: 'fill' })
        .greyscale()
        .webp(WEBP_HEIGHT)
        .toBuffer();
  }
}

const ROLES: readonly MapRole[] = ['albedo', 'normal', 'orm', 'height'];

export interface ProcessedMaterial {
  readonly files: readonly AssetFile[];
  readonly info: MaterialInfo;
  readonly checks: readonly ValidationCheck[];
}

export async function processMaterial(
  selection: MaterialSelection,
  inputs: MaterialInputs,
  metadata: SourceMetadata,
  libraryDir: string,
): Promise<ProcessedMaterial> {
  const files: AssetFile[] = [];
  const dimensionErrors: string[] = [];
  const statsByRole = new Map<MapRole, Stats>();
  const largest = Math.max(...selection.resolutions);

  for (const size of selection.resolutions) {
    for (const role of ROLES) {
      const bytes = await encodeMap(inputs, role, size);
      const meta = await sharp(bytes).metadata();
      if (meta.width !== size || meta.height !== size) {
        dimensionErrors.push(`${role} ${size}: ${String(meta.width)}×${String(meta.height)}`);
      }
      if (size === largest) statsByRole.set(role, await sharp(bytes).stats());
      const outputPath = safeJoin(
        libraryDir,
        path.join('materials', selection.id, `${selection.id}_${role}_${size}.webp`),
      );
      await writeFileAtomic(outputPath, bytes);
      files.push({
        path: toPosixRelative(libraryDir, outputPath),
        role,
        format: 'webp',
        bytes: bytes.byteLength,
        sha256: hashBytes(bytes),
        width: size,
        height: size,
      });
    }
  }

  const mean = (role: MapRole, channel: number): number =>
    statsByRole.get(role)?.channels[channel]?.mean ?? Number.NaN;
  const [normalR, normalG, normalB] = [mean('normal', 0), mean('normal', 1), mean('normal', 2)];
  const metalness = mean('orm', 2);
  const tile = metadata.dimensionsMm;
  const tileSizeM: readonly [number, number] | null =
    tile !== null && tile.length >= 2 && (tile[0] ?? 0) > 0 && (tile[1] ?? 0) > 0
      ? [Number(((tile[0] ?? 0) / 1000).toFixed(3)), Number(((tile[1] ?? 0) / 1000).toFixed(3))]
      : null;

  const checks: ValidationCheck[] = [
    {
      name: 'Resoluciones exactas y decodificables',
      passed: dimensionErrors.length === 0,
      detail:
        dimensionErrors.length === 0
          ? `${selection.resolutions.join(' y ')} px en los 4 mapas`
          : dimensionErrors.join('; '),
    },
    {
      name: 'Mapa normal plausible (espacio tangente)',
      passed: Math.abs(normalR - 128) < 30 && Math.abs(normalG - 128) < 30 && normalB > 180,
      detail: `Medias RGB ${normalR.toFixed(0)}, ${normalG.toFixed(0)}, ${normalB.toFixed(0)} (esperado ≈128, ≈128, >180)`,
    },
    {
      name: 'Metalicidad ≈ 0 (terreno no metálico)',
      passed: metalness < 25,
      detail: `Media del canal B del ORM: ${metalness.toFixed(1)} / 255`,
    },
  ];

  return {
    files,
    info: {
      tileSizeM,
      resolutions: selection.resolutions,
      gpuTextureBytes: estimateGpuTextureBytes(ROLES.map(() => [largest, largest] as const)),
    },
    checks,
  };
}
