import { describe, expect, it } from 'vitest';

import { quantity } from '../domain';
import { sunDirection } from './sun';

function expectVector(actual: readonly number[], expected: readonly number[]) {
  expected.forEach((value, i) => {
    expect(actual[i]).toBeCloseTo(value, 10);
  });
}

describe('sunDirection', () => {
  it('sigue la convención +X este, +Y arriba, −Z norte', () => {
    expectVector(sunDirection(quantity(90, 'deg'), quantity(0, 'deg')), [0, 1, 0]);
    expectVector(sunDirection(quantity(0, 'deg'), quantity(0, 'deg')), [0, 0, -1]);
    expectVector(sunDirection(quantity(0, 'deg'), quantity(90, 'deg')), [1, 0, 0]);
    expectVector(sunDirection(quantity(0, 'deg'), quantity(180, 'deg')), [0, 0, 1]);
  });

  it('devuelve un vector unitario', () => {
    const [x, y, z] = sunDirection(quantity(32, 'deg'), quantity(130, 'deg'));
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});
