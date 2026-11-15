/**
 * Números pseudoaleatorios deterministas para la generación procedural.
 *
 * Toda decisión procedural (posición de una planta, tipo de un campo) depende solo de una semilla
 * y de coordenadas enteras, nunca del orden de ejecución: la misma región genera siempre el mismo
 * mundo, en cualquier navegador y aunque se regeneren solo algunas partes.
 */

/** Hash entero de 32 bits (variante de lowbias32 de Chris Wellons). */
export function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Combina una semilla con coordenadas enteras en un hash. */
export function hashCoords(seed: number, ...coords: readonly number[]): number {
  let h = hash32(seed ^ 0x9e3779b9);
  for (const c of coords) h = hash32(h ^ (Math.imul(c | 0, 0x85ebca6b) >>> 0));
  return h;
}

/** Valor uniforme en [0, 1) a partir de un hash. */
export function unit(hash: number): number {
  return hash / 4294967296;
}

/** Generador secuencial mulberry32 para bucles locales con semilla derivada de un hash. */
export function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla estable a partir de un texto (p. ej. el identificador de la región). */
export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return hash32(h);
}

/** Ruido de valor 2D suave en [0, 1] (interpolación quíntica), con semilla. */
export function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = unit(hashCoords(seed, xi, yi));
  const b = unit(hashCoords(seed, xi + 1, yi));
  const c = unit(hashCoords(seed, xi, yi + 1));
  const d = unit(hashCoords(seed, xi + 1, yi + 1));
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Ruido fractal (fBm) en [0, 1] aprox. */
export function fbm(seed: number, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(seed + o * 1013, x * frequency, y * frequency);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
}
