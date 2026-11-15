import { Box3, LOD, type Object3D, Sphere } from 'three';

/**
 * Distancia de cambio de cada nivel, en múltiplos del radio de la esfera envolvente del LOD0.
 * Valores provisionales para inspección; el presupuesto definitivo se medirá con la escena real.
 */
export const LOD_SWITCH_RADII: readonly number[] = [0, 8, 20, 40];

export function lodSwitchDistances(radius: number, levelCount: number): number[] {
  const last = LOD_SWITCH_RADII[LOD_SWITCH_RADII.length - 1] ?? 40;
  return Array.from({ length: levelCount }, (_, level) =>
    level === 0 ? 0 : radius * (LOD_SWITCH_RADII[level] ?? last * level),
  );
}

export interface BuiltLod {
  readonly lod: LOD;
  readonly levels: readonly Object3D[];
  readonly radius: number;
}

/** Construye un `THREE.LOD` con los nodos `LOD0…LODn` que genera el pipeline. */
export function buildLod(root: Object3D, nodeNames: readonly string[]): BuiltLod {
  const levels = nodeNames.map((name) => {
    const node = root.getObjectByName(name);
    if (node === undefined) throw new Error(`El GLB no contiene el nodo ${name}`);
    return node;
  });
  const first = levels[0];
  if (first === undefined) throw new Error('El modelo no declara niveles de detalle');
  const radius = new Box3().setFromObject(first).getBoundingSphere(new Sphere()).radius;
  const lod = new LOD();
  lod.name = root.name;
  const distances = lodSwitchDistances(radius, levels.length);
  levels.forEach((level, index) => {
    level.removeFromParent();
    level.visible = true;
    lod.addLevel(level, distances[index] ?? 0);
  });
  return { lod, levels, radius };
}

export type LodMode = 'auto' | number;

/** Automático por distancia o un nivel fijo para inspeccionarlo. */
export function applyLodMode(built: BuiltLod, mode: LodMode): void {
  if (mode === 'auto') {
    built.lod.autoUpdate = true;
    return;
  }
  built.lod.autoUpdate = false;
  const forced = Math.min(Math.max(0, mode), built.levels.length - 1);
  built.levels.forEach((level, index) => {
    level.visible = index === forced;
  });
}

export function currentLodLevel(built: BuiltLod, mode: LodMode): number {
  if (mode !== 'auto') return Math.min(Math.max(0, mode), built.levels.length - 1);
  return built.lod.getCurrentLevel();
}
