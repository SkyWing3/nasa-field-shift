/**
 * Normalización del modelo de elevación antes de construir el terreno.
 *
 * 1. **Relleno de vacíos**: los píxeles sin dato se rellenan con la media de sus vecinos
 *    válidos, en anillos sucesivos desde el borde del vacío (NASADEM ya trae los vacíos de SRTM
 *    rellenados; esto cubre los que pudieran quedar).
 * 2. **Suavizado gaussiano** de σ ≈ 1 píxel (≈ 36 m): atenúa el ruido del radar (≈ 1 m de
 *    desviación típica medida en el fondo del valle de la región demostrativa) y los escalones de
 *    la cuantización a metros enteros, que con luz rasante se verían como terrazas. Conserva el
 *    relieve de escalas mayores de ~100 m. No añade ni inventa detalle.
 */
import type { GeoGrid } from './grid.ts';

export const DEM_SMOOTHING_SIGMA_PX = 1.2;

export interface DemNormalization {
  readonly grid: GeoGrid<Float32Array>;
  readonly voidsFilled: number;
  readonly smoothingSigmaPx: number;
  readonly minM: number;
  readonly maxM: number;
}

export function fillVoids(grid: GeoGrid<Float32Array>): {
  grid: GeoGrid<Float32Array>;
  filled: number;
} {
  const { width, height } = grid;
  const data = Float32Array.from(grid.data);
  let missing = 0;
  for (const value of data) if (!Number.isFinite(value)) missing++;
  if (missing === 0) return { grid, filled: 0 };
  if (missing === data.length) throw new Error('El modelo de elevación no contiene datos válidos');
  const filled = missing;
  while (missing > 0) {
    const updates: [number, number][] = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const index = r * width + c;
        if (Number.isFinite(data[index])) continue;
        let sum = 0;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
            const v = data[rr * width + cc] ?? Number.NaN;
            if (Number.isFinite(v)) {
              sum += v;
              count++;
            }
          }
        }
        if (count > 0) updates.push([index, sum / count]);
      }
    }
    for (const [index, value] of updates) data[index] = value;
    missing -= updates.length;
  }
  return { grid: { ...grid, data }, filled };
}

function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] = (kernel[i] ?? 0) / sum;
  return kernel;
}

/** Suavizado gaussiano separable con bordes replicados. */
export function gaussianSmooth(
  grid: GeoGrid<Float32Array>,
  sigmaPx: number,
): GeoGrid<Float32Array> {
  if (sigmaPx <= 0) return grid;
  const { width, height } = grid;
  const kernel = gaussianKernel(sigmaPx);
  const radius = (kernel.length - 1) / 2;
  const temp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const cc = Math.min(width - 1, Math.max(0, c + k));
        sum += (grid.data[r * width + cc] ?? 0) * (kernel[k + radius] ?? 0);
      }
      temp[r * width + c] = sum;
    }
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const rr = Math.min(height - 1, Math.max(0, r + k));
        sum += (temp[rr * width + c] ?? 0) * (kernel[k + radius] ?? 0);
      }
      out[r * width + c] = sum;
    }
  }
  return { ...grid, data: out };
}

export function normalizeDem(
  grid: GeoGrid<Float32Array>,
  sigmaPx: number = DEM_SMOOTHING_SIGMA_PX,
): DemNormalization {
  const { grid: filled, filled: voidsFilled } = fillVoids(grid);
  const smooth = gaussianSmooth(filled, sigmaPx);
  let minM = Infinity;
  let maxM = -Infinity;
  for (const v of smooth.data) {
    if (v < minM) minM = v;
    if (v > maxM) maxM = v;
  }
  return { grid: smooth, voidsFilled, smoothingSigmaPx: sigmaPx, minM, maxM };
}
