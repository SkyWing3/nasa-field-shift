import { quantity, type Quantity } from '../domain';

/**
 * Parámetros *visuales* del cielo y la iluminación.
 *
 * Importante: estos valores controlan solo la apariencia de la escena. No proceden
 * de datos meteorológicos ni de un cálculo de posición solar; esa conexión
 * (fecha, latitud y nubosidad reales → cielo) se implementará en fases posteriores.
 */
export interface VisualSkyConditions {
  readonly sunElevation: Quantity<'deg'>;
  readonly sunAzimuth: Quantity<'deg'>;
  /** Turbidez atmosférica del modelo de cielo de Preetham (≈2 muy limpio, ≈10 calima). */
  readonly turbidity: number;
  /** Factor de dispersión de Rayleigh del shader de cielo. */
  readonly rayleigh: number;
  readonly mieCoefficient: number;
  readonly mieDirectionalG: number;
  /** Intensidad de la luz direccional del Sol (unidades de Three.js). */
  readonly sunIntensity: number;
  /** Intensidad de la luz hemisférica de relleno (cielo/suelo). */
  readonly skyFillIntensity: number;
  readonly skyFillColor: string;
  readonly groundFillColor: string;
  /** Color de la niebla de distancia; aproxima el color del horizonte. */
  readonly hazeColor: string;
  readonly hazeNear: number;
  readonly hazeFar: number;
}

/** Cielo despejado de media mañana. Provisional hasta la fase de entorno (HDRI). */
export const PROVISIONAL_CLEAR_MORNING: VisualSkyConditions = {
  sunElevation: quantity(32, 'deg'),
  sunAzimuth: quantity(130, 'deg'),
  turbidity: 4,
  rayleigh: 1.2,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.82,
  sunIntensity: 3.4,
  skyFillIntensity: 0.8,
  skyFillColor: '#cfe0f2',
  groundFillColor: '#5a4c3a',
  hazeColor: '#c9d6df',
  hazeNear: 120,
  hazeFar: 900,
};
