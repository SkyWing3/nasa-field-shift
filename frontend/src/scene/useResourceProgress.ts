import { useProgress } from '@react-three/drei';

export interface ResourceProgress {
  /** Hay recursos (texturas, modelos, HDRI) cargándose. */
  readonly active: boolean;
  /** Porcentaje 0–100 de los recursos registrados en el gestor de carga de Three.js. */
  readonly progress: number;
  readonly loaded: number;
  readonly total: number;
  /** URLs de recursos que fallaron al cargar. */
  readonly failed: readonly string[];
}

/** Progreso de carga de recursos 3D a través del `DefaultLoadingManager` de Three.js. */
export function useResourceProgress(): ResourceProgress {
  const { active, progress, loaded, total, errors } = useProgress();
  return { active, progress, loaded, total, failed: errors };
}
