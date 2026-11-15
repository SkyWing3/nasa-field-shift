/**
 * Análisis de un HDRI equirrectangular para alinear la escena con él:
 *
 * - **Sol**: dirección del píxel más luminoso del hemisferio superior. La luz direccional (que da
 *   las sombras nítidas) se coloca ahí, de modo que sombras y cielo coinciden.
 * - **Horizonte**: radiancia media de la franja de 0° a 4° de elevación. Tras el mismo tone mapping
 *   que aplica Three.js, da el color de la niebla: el terreno lejano se funde con el cielo real.
 *
 * Convención de Three.js para mapas equirrectangulares: u = atan2(z, x)/2π + ½, v = asin(y)/π + ½,
 * con la primera fila de la imagen arriba (v = 1).
 */

export interface EquirectImage {
  readonly width: number;
  readonly height: number;
  /** Radiancia lineal, `channels` valores por píxel, primera fila arriba. */
  readonly data: Float32Array;
  readonly channels: 3 | 4;
}

export type Rgb = readonly [number, number, number];

export interface SunEstimate {
  readonly direction: readonly [number, number, number];
  readonly elevationDeg: number;
  /** Desde el norte (−Z) en sentido horario hacia el este (+X). */
  readonly azimuthDeg: number;
  /** Luminancia del pico respecto a la mediana del cielo (un sol nítido supera 100). */
  readonly peakRatio: number;
}

export function equirectDirection(
  col: number,
  row: number,
  width: number,
  height: number,
): [number, number, number] {
  const u = (col + 0.5) / width;
  const v = 1 - (row + 0.5) / height;
  const phi = (u - 0.5) * 2 * Math.PI;
  const theta = (v - 0.5) * Math.PI;
  return [Math.cos(phi) * Math.cos(theta), Math.sin(theta), Math.sin(phi) * Math.cos(theta)];
}

function luminance(data: Float32Array, index: number): number {
  return (
    0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0)
  );
}

export function findSun(image: EquirectImage): SunEstimate {
  const { width, height, data, channels } = image;
  let best = -1;
  let bestCol = 0;
  let bestRow = 0;
  const sample: number[] = [];
  for (let row = 0; row < height / 2; row++) {
    for (let col = 0; col < width; col++) {
      const l = luminance(data, (row * width + col) * channels);
      if ((row * width + col) % 97 === 0) sample.push(l);
      if (l > best) {
        best = l;
        bestCol = col;
        bestRow = row;
      }
    }
  }
  sample.sort((a, b) => a - b);
  const median = sample[Math.floor(sample.length / 2)] ?? 1;
  const direction = equirectDirection(bestCol, bestRow, width, height);
  const [x, y, z] = direction;
  return {
    direction,
    elevationDeg: (Math.asin(Math.min(1, Math.max(-1, y))) * 180) / Math.PI,
    azimuthDeg: ((((Math.atan2(x, -z) * 180) / Math.PI) % 360) + 360) % 360,
    peakRatio: median > 0 ? best / median : Infinity,
  };
}

/** Radiancia media entre dos elevaciones (grados), ponderada por el área de cada fila. */
export function bandRadiance(image: EquirectImage, minDeg: number, maxDeg: number): Rgb {
  const { width, height, data, channels } = image;
  const sum = [0, 0, 0];
  let weight = 0;
  for (let row = 0; row < height; row++) {
    const elevation = (0.5 - (row + 0.5) / height) * 180;
    if (elevation < minDeg || elevation > maxDeg) continue;
    const w = Math.cos((elevation * Math.PI) / 180);
    for (let col = 0; col < width; col++) {
      const index = (row * width + col) * channels;
      sum[0] = (sum[0] ?? 0) + (data[index] ?? 0) * w;
      sum[1] = (sum[1] ?? 0) + (data[index + 1] ?? 0) * w;
      sum[2] = (sum[2] ?? 0) + (data[index + 2] ?? 0) * w;
      weight += w;
    }
  }
  return weight === 0
    ? [0, 0, 0]
    : [(sum[0] ?? 0) / weight, (sum[1] ?? 0) / weight, (sum[2] ?? 0) / weight];
}

function rrtAndOdtFit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

/** Copia exacta del `ACESFilmicToneMapping` de Three.js (salida lineal en [0, 1]). */
export function acesFilmic(rgb: Rgb, exposure: number): Rgb {
  const scale = exposure / 0.6;
  const [r, g, b] = [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
  // Matrices de Three.js (mat3 por columnas).
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fr = rrtAndOdtFit(ir);
  const fg = rrtAndOdtFit(ig);
  const fb = rrtAndOdtFit(ib);
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return [
    clamp(1.60475 * fr - 0.53108 * fg - 0.07367 * fb),
    clamp(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb),
    clamp(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb),
  ];
}
