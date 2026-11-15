import { type AssetEntry, assetFileUrl } from '../../assets';

/** Lado de la superficie de muestra de materiales, en metros. */
export const SAMPLE_SIZE_M = 4;
/** Escala del relieve: parámetro visual, no una medida (las fuentes no publican la altura real). */
export const DISPLACEMENT_SCALE_M = 0.02;
/** Repetición supuesta cuando la fuente no publica el tamaño real de la textura. */
export const FALLBACK_TILE_M = 2;

export const MATERIAL_MAP_ROLES = ['albedo', 'normal', 'orm', 'height'] as const;

export function materialTextureUrls(asset: AssetEntry, resolution: number): string[] {
  return MATERIAL_MAP_ROLES.map((role) => {
    const file = asset.files.find(
      (candidate) => candidate.role === role && candidate.width === resolution,
    );
    if (file === undefined) throw new Error(`Falta el mapa ${role} a ${resolution} px`);
    return assetFileUrl(file.path);
  });
}

export function hdriFileUrl(hdri: AssetEntry, resolution: '1k' | '2k'): string | null {
  const preferred = hdri.files.find((file) => file.path.endsWith(`_${resolution}.hdr`));
  const file = preferred ?? hdri.files[0];
  return file === undefined ? null : assetFileUrl(file.path);
}
