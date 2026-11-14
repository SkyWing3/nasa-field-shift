/**
 * Mosaico **procedural** de campos para las zonas que ESA WorldCover clasifica como cultivo.
 *
 * WorldCover no distingue parcelas ni cultivos y OpenStreetMap tampoco los registra en la zona,
 * así que la variación entre campos (suelo arado, surcos, barbecho con hierba, suelo seco) es una
 * ambientación visual generada a partir de una semilla. Las franjas se orientan según la
 * orientación dominante de las vías reales. No representa el estado real de ningún campo.
 */
import { hashCoords, unit, valueNoise } from './random.ts';

export const FIELD_TYPES = ['tilled', 'furrows', 'fallow', 'dry'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const TYPE_WEIGHTS: readonly [FieldType, number][] = [
  ['tilled', 0.58],
  ['furrows', 0.1],
  ['fallow', 0.2],
  ['dry', 0.12],
];

export interface FieldMosaic {
  readonly seed: number;
  readonly angleRad: number;
  /** Profundidad de las franjas (m). */
  readonly rowDepthM: number;
}

export interface FieldSample {
  readonly row: number;
  readonly column: number;
  readonly type: FieldType;
  /** Distancia al borde del campo (m): las lindes tienen hierba y maleza. */
  readonly edgeDistanceM: number;
  /** Dirección de los surcos de este campo, en radianes respecto al eje x. */
  readonly furrowAngleRad: number;
}

export function createFieldMosaic(seed: number, orientationDeg: number | null): FieldMosaic {
  return { seed, angleRad: ((orientationDeg ?? 0) * Math.PI) / 180, rowDepthM: 90 };
}

function pickType(hash: number): FieldType {
  let r = unit(hash);
  for (const [type, weight] of TYPE_WEIGHTS) {
    if (r < weight) return type;
    r -= weight;
  }
  return 'tilled';
}

/**
 * Parcelas en franjas largas y estrechas orientadas como las vías: cada franja base de 90 m se
 * divide en 2–4 franjas de 15–45 m de ancho y cada franja en campos de 70–220 m de largo. Los
 * bordes se desplazan unos metros con ruido para que no sean rectas perfectas.
 */
export function sampleField(mosaic: FieldMosaic, x: number, z: number): FieldSample {
  const cos = Math.cos(mosaic.angleRad);
  const sin = Math.sin(mosaic.angleRad);
  const wobbleU = (valueNoise(mosaic.seed + 41, x / 37, z / 37) - 0.5) * 5;
  const wobbleV = (valueNoise(mosaic.seed + 43, x / 31, z / 31) - 0.5) * 3;
  // Coordenadas a lo largo (u) y a través (v) de las franjas.
  const u = x * cos + z * sin + wobbleU;
  const v = -x * sin + z * cos + wobbleV;
  const band = Math.floor(v / mosaic.rowDepthM);
  const bandV = v - band * mosaic.rowDepthM;
  // División de la franja base en 2–4 franjas de ancho variable.
  const splits = 2 + Math.floor(unit(hashCoords(mosaic.seed, band, 1)) * 3);
  let edge0 = 0;
  let strip = 0;
  let edge1 = mosaic.rowDepthM;
  for (let k = 1; k < splits; k++) {
    const cut =
      (mosaic.rowDepthM * (k + (unit(hashCoords(mosaic.seed, band, 20 + k)) - 0.5) * 0.6)) / splits;
    if (bandV < cut) {
      edge1 = cut;
      break;
    }
    edge0 = cut;
    strip = k;
  }
  const row = band * 4 + strip;
  const length = 70 + unit(hashCoords(mosaic.seed, row, 7)) * 150;
  const shifted = u + unit(hashCoords(mosaic.seed, row, 11)) * length;
  const column = Math.floor(shifted / length);
  const fu = shifted - column * length;
  const edgeDistanceM = Math.min(fu, length - fu, bandV - edge0, edge1 - bandV);
  const cellHash = hashCoords(mosaic.seed, row, column);
  // Surcos a lo largo de la franja salvo en algunos campos, que van en perpendicular.
  const across = unit(hashCoords(mosaic.seed, row, column, 3)) < 0.25;
  return {
    row,
    column,
    type: pickType(cellHash),
    edgeDistanceM,
    furrowAngleRad: mosaic.angleRad + (across ? Math.PI / 2 : 0),
  };
}
