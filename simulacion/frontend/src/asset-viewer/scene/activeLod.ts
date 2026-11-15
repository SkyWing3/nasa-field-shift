import { type BuiltLod, currentLodLevel, type LodMode } from './lod';

/** LOD del modelo visible, consultado por el bucle de render para informar del nivel activo. */
let active: { readonly built: BuiltLod; readonly mode: LodMode } | null = null;

export function setActiveLod(built: BuiltLod | null, mode: LodMode = 'auto'): void {
  active = built === null ? null : { built, mode };
}

export function activeLodLevel(): number | null {
  return active === null ? null : currentLodLevel(active.built, active.mode);
}
