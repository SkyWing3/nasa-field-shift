import type { Vector3Tuple } from '../weather-visual';

/** Parámetros de la cámara de inspección de la granja. Distancias en metros. */
export const CAMERA_CONFIG = {
  fov: 42,
  near: 0.1,
  far: 5000,
  initialPosition: [46, 11, 60] as Vector3Tuple,
  target: [0, 3, 0] as Vector3Tuple,
  minDistance: 6,
  maxDistance: 240,
  /** Impide que la cámara baje por debajo del horizonte del terreno (radianes). */
  maxPolarAngle: Math.PI * 0.47,
  dampingFactor: 0.08,
} as const;
