import { describe, expect, it } from 'vitest';

import { createRegion } from '../geo/region.ts';
import { geoPoint } from '../geo/wgs84.ts';
import {
  clampTarget,
  easeInOutCubic,
  enforceClearance,
  nearPlaneFor,
  viewPose,
} from './worldCamera';

const region = createRegion(geoPoint(-17.55, -65.86), 400, 300, 0);
const flat = (): number => 10;
const hill = (x: number): number => (Math.abs(x - 50) < 10 ? 60 : 0);

describe('cámara del mundo', () => {
  it('genera vistas sobre el terreno que miran a la granja', () => {
    for (const view of ['aerial', 'farm', 'ground'] as const) {
      const pose = viewPose(view, region, flat);
      expect(pose.position[1]).toBeGreaterThan(10);
      expect(pose.target[0]).toBe(0);
    }
    const ground = viewPose('ground', region, flat);
    expect(ground.position[1]).toBeCloseTo(11.7, 6);
    expect(viewPose('aerial', region, flat).position[1]).toBeGreaterThan(600);
  });

  it('limita el punto de mira al área de detalle', () => {
    expect(clampTarget([5000, 3, -5000], 1500)).toEqual([1440, 3, -1440]);
  });

  it('no deja que la cámara ni su línea de visión atraviesen el terreno', () => {
    expect(enforceClearance([0, 5, 0], [10, 10, 0], flat, 1.6)).toBeCloseTo(11.6, 6);
    // Una colina de 60 m entre la cámara (x = 0) y el punto de mira (x = 100).
    const y = enforceClearance([0, 20, 0], [100, 0, 0], hill, 1.6);
    expect(y).toBeGreaterThan(60);
    expect(enforceClearance([0, 300, 0], [100, 0, 0], hill, 1.6)).toBe(300);
  });

  it('suaviza las transiciones y ajusta el plano cercano', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(nearPlaneFor(1.7)).toBeLessThan(0.1);
    expect(nearPlaneFor(1000)).toBe(4);
  });
});
