/**
 * Niveles de calidad del mundo 3D. Cada uno fija la resolución de la malla, el tamaño de las
 * texturas, las sombras y la densidad y el alcance de la vegetación. Los valores se ajustaron
 * midiendo la escena de la región demostrativa (ver docs/PROGRESS.md, fase 04).
 */
export type WorldQualityId = 'low' | 'medium' | 'high';

export interface WorldQuality {
  readonly id: WorldQualityId;
  readonly label: string;
  /** Segmentos por lado de cada fragmento de terreno en su nivel de detalle más fino. */
  readonly chunkSegments: number;
  /** Resolución de las texturas de los materiales de terreno (px). */
  readonly materialResolution: 512 | 1024;
  /** Metros por texel de los mapas de mezcla de materiales y de elementos geográficos. */
  readonly splatTexelM: number;
  readonly shadowMapSize: number;
  /** Semilado del área cubierta por la sombra del sol alrededor del punto de mira (m). */
  readonly shadowExtentM: number;
  /** Multiplicador de densidad de árboles, arbustos y rocas. */
  readonly vegetationDensity: number;
  /** Densidad de matas de pasto por m² en pastizal (se reduce en otras clases). */
  readonly grassDensity: number;
  /** Alcance de pasto y maleza alrededor de la cámara (m). */
  readonly groundCoverRadiusM: number;
  /** Factor sobre las distancias de cambio de nivel de detalle. */
  readonly lodScale: number;
  readonly maxPixelRatio: number;
}

export const WORLD_QUALITIES: Readonly<Record<WorldQualityId, WorldQuality>> = {
  low: {
    id: 'low',
    label: 'Baja',
    chunkSegments: 32,
    materialResolution: 512,
    splatTexelM: 4,
    shadowMapSize: 1024,
    shadowExtentM: 120,
    vegetationDensity: 0.45,
    grassDensity: 0.6,
    groundCoverRadiusM: 22,
    lodScale: 0.6,
    maxPixelRatio: 1,
  },
  medium: {
    id: 'medium',
    label: 'Media',
    chunkSegments: 48,
    materialResolution: 1024,
    splatTexelM: 3,
    shadowMapSize: 2048,
    shadowExtentM: 200,
    vegetationDensity: 0.75,
    grassDensity: 1.2,
    groundCoverRadiusM: 36,
    lodScale: 0.85,
    maxPixelRatio: 1.5,
  },
  high: {
    id: 'high',
    label: 'Alta',
    chunkSegments: 64,
    materialResolution: 1024,
    splatTexelM: 2,
    shadowMapSize: 4096,
    shadowExtentM: 300,
    vegetationDensity: 1,
    grassDensity: 2,
    groundCoverRadiusM: 55,
    lodScale: 1,
    maxPixelRatio: 2,
  },
};

export const DEFAULT_WORLD_QUALITY: WorldQualityId = 'medium';

export function isWorldQualityId(value: unknown): value is WorldQualityId {
  return value === 'low' || value === 'medium' || value === 'high';
}
