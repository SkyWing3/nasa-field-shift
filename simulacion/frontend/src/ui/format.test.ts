import { describe, expect, it } from 'vitest';

import { parseIsoDate, quantity } from '../domain';
import { formatQuantity, formatSimulationDate, PROVENANCE_LABELS } from './format';

const NBSP = ' ';

describe('formatSimulationDate', () => {
  it('formatea fechas civiles en español sin desplazamiento por zona horaria', () => {
    expect(formatSimulationDate(parseIsoDate('2026-01-01'))).toBe('1 ene 2026');
    expect(formatSimulationDate(parseIsoDate('2026-12-31'))).toBe('31 dic 2026');
  });
});

describe('formatQuantity', () => {
  it('usa coma decimal y espacio duro antes de la unidad', () => {
    expect(formatQuantity(quantity(23.456, 'degC'), 'degC')).toBe(`23,5${NBSP}°C`);
    expect(formatQuantity(quantity(12, 'MJ/m2/d'), 'MJ/m2/d', 2)).toBe(`12,00${NBSP}MJ/m²/d`);
    expect(formatQuantity(quantity(64.6, '%'), '%', 0)).toBe(`65${NBSP}%`);
  });
});

describe('PROVENANCE_LABELS', () => {
  it('distingue los datos sintéticos', () => {
    expect(PROVENANCE_LABELS.synthetic).toBe('Sintético');
  });
});
