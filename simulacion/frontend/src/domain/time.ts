/**
 * Fechas del calendario simulado.
 *
 * La simulación trabaja con fechas civiles sin hora ni zona horaria (paso diario,
 * ver ADR-003), representadas como cadenas ISO 8601 `YYYY-MM-DD`. Se usa una marca
 * de tipo para distinguirlas de cadenas arbitrarias.
 */

declare const isoDateBrand: unique symbol;

export type IsoDate = string & { readonly [isoDateBrand]: true };

/** Marca temporal ISO 8601 completa en UTC, p. ej. `2026-11-14T10:30:00Z`. */
declare const isoDateTimeBrand: unique symbol;
export type IsoDateTime = string & { readonly [isoDateTimeBrand]: true };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function parseIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new RangeError(`Fecha ISO 8601 inválida (se esperaba YYYY-MM-DD): "${value}"`);
  }
  return value;
}
