import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  BBCH_PRINCIPAL_STAGE_NAMES,
  cropGrowthStageFromBbch,
  isIsoDate,
  parseIsoDate,
  quantity,
  unitLabel,
  type Quantity,
} from './index';

describe('quantity', () => {
  it('conserva el valor numérico sin coste en tiempo de ejecución', () => {
    const t = quantity(21.5, 'degC');
    expect(t).toBe(21.5);
    expect(t + 1).toBe(22.5);
  });

  it('rechaza valores no finitos', () => {
    expect(() => quantity(Number.NaN, 'mm')).toThrow(RangeError);
    expect(() => quantity(Number.POSITIVE_INFINITY, 'm/s')).toThrow(RangeError);
  });

  it('impide mezclar unidades en tiempo de compilación', () => {
    expectTypeOf(quantity(3, 'mm/d')).toEqualTypeOf<Quantity<'mm/d'>>();
    expectTypeOf<Quantity<'mm/d'>>().not.toEqualTypeOf<Quantity<'degC'>>();
    expectTypeOf<number>().not.toExtend<Quantity<'degC'>>();
  });

  it('expone etiquetas legibles de unidad', () => {
    expect(unitLabel('MJ/m2/d')).toBe('MJ/m²/d');
    expect(unitLabel('m3/m3')).toBe('m³/m³');
  });
});

describe('fechas ISO', () => {
  it.each(['2026-11-14', '2024-02-29', '1999-12-31'])('acepta %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
    expect(parseIsoDate(value)).toBe(value);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '14/11/2026', '2026-11-14T00:00:00Z', ''])(
    'rechaza %s',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
      expect(() => parseIsoDate(value)).toThrow(RangeError);
    },
  );
});

describe('estadios BBCH', () => {
  it('deriva el estadio principal del código de dos dígitos', () => {
    expect(cropGrowthStageFromBbch(0)).toEqual({ scale: 'BBCH', code: 0, principal: 0 });
    expect(cropGrowthStageFromBbch(65)).toEqual({ scale: 'BBCH', code: 65, principal: 6 });
    expect(cropGrowthStageFromBbch(99).principal).toBe(9);
  });

  it.each([-1, 100, 12.5, Number.NaN])('rechaza el código %s', (code) => {
    expect(() => cropGrowthStageFromBbch(code)).toThrow(RangeError);
  });

  it('nombra los diez estadios principales', () => {
    expect(Object.keys(BBCH_PRINCIPAL_STAGE_NAMES)).toHaveLength(10);
  });
});
