import { describe, expect, it } from 'vitest';

import { acesFilmic, bandRadiance, equirectDirection, findSun } from './hdrAnalysis';

function sky(width: number, height: number, sun: [number, number]): Float32Array {
  const data = new Float32Array(width * height * 4).fill(0.5);
  const [col, row] = sun;
  for (let k = 0; k < 3; k++) data[(row * width + col) * 4 + k] = 5000;
  return data;
}

describe('análisis del HDRI', () => {
  it('sigue la convención equirrectangular de Three.js', () => {
    // Centro de la imagen (u = ½, v = ½): dirección +X en el horizonte.
    const [x, y, z] = equirectDirection(49.5, 24.5, 100, 50);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
    // u = ¾ → φ = π/2 → +Z (sur en la escena).
    expect(equirectDirection(74.5, 24.5, 100, 50)[2]).toBeCloseTo(1, 6);
    // Fila superior → cerca del cenit.
    expect(equirectDirection(0, 0, 100, 50)[1]).toBeGreaterThan(0.99);
  });

  it('encuentra el sol y su azimut desde el norte', () => {
    // Columna 24.5/100 → φ = −π/2 → −Z (norte); fila 12.5/50 → elevación 45°.
    const estimate = findSun({ width: 100, height: 50, data: sky(100, 50, [24, 12]), channels: 4 });
    expect(estimate.elevationDeg).toBeCloseTo(45, 0);
    expect(Math.min(estimate.azimuthDeg, 360 - estimate.azimuthDeg)).toBeLessThan(4);
    expect(estimate.peakRatio).toBeGreaterThan(1000);
  });

  it('promedia la franja del horizonte y aplica el tone mapping ACES de Three.js', () => {
    const data = new Float32Array(10 * 10 * 4).fill(0.25);
    const band = bandRadiance({ width: 10, height: 10, data, channels: 4 }, 0, 20);
    expect(band[0]).toBeCloseTo(0.25, 6);
    // Valores de referencia de la curva: negro → 0 y blanco muy intenso → 1.
    expect(acesFilmic([0, 0, 0], 1)[0]).toBeCloseTo(0, 2);
    expect(acesFilmic([1000, 1000, 1000], 1)[1]).toBe(1);
    const mid = acesFilmic([0.18, 0.18, 0.18], 1);
    expect(mid[0]).toBeGreaterThan(0.1);
    expect(mid[0]).toBeLessThan(0.3);
  });
});
