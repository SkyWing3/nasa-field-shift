import type { IsoDate, ProvenanceKind, Quantity, UnitSymbol } from '../domain';
import { UNIT_LABELS } from '../domain';

const LOCALE = 'es-ES';
const NBSP = ' ';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const numberFormatters = new Map<number, Intl.NumberFormat>();

function numberFormatter(fractionDigits: number): Intl.NumberFormat {
  let formatter = numberFormatters.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    numberFormatters.set(fractionDigits, formatter);
  }
  return formatter;
}

/** Fecha civil de la simulación (sin zona horaria) en formato legible. */
export function formatSimulationDate(date: IsoDate): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

/** Magnitud con su unidad, separadas por un espacio duro (norma SI). */
export function formatQuantity<U extends UnitSymbol>(
  value: Quantity<U>,
  unit: U,
  fractionDigits = 1,
): string {
  return `${numberFormatter(fractionDigits).format(value)}${NBSP}${UNIT_LABELS[unit]}`;
}

export const PROVENANCE_LABELS: Readonly<Record<ProvenanceKind, string>> = {
  observed: 'Observado',
  reanalysis: 'Reanálisis / satélite',
  'model-output': 'Modelo',
  literature: 'Literatura',
  'user-assumption': 'Supuesto del usuario',
  synthetic: 'Sintético',
};
