/**
 * Estado fenológico de un cultivo según la escala BBCH extendida.
 *
 * Referencia: Meier, U. (ed.) (2018). *Growth stages of mono- and dicotyledonous
 * plants. BBCH Monograph*. Julius Kühn-Institut, Quedlinburg.
 * DOI: 10.5073/20180906-074619
 *
 * El código BBCH tiene dos dígitos: el primero es el estadio principal (0–9) y el
 * segundo el estadio secundario dentro de él (0–9).
 */

export type BbchPrincipalStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const BBCH_PRINCIPAL_STAGE_NAMES: Readonly<Record<BbchPrincipalStage, string>> = {
  0: 'Germinación / brotación',
  1: 'Desarrollo de las hojas',
  2: 'Formación de brotes laterales / ahijamiento',
  3: 'Elongación del tallo / crecimiento en roseta',
  4: 'Desarrollo de partes vegetativas cosechables / embuchado',
  5: 'Aparición del órgano floral / espigado',
  6: 'Floración',
  7: 'Formación del fruto',
  8: 'Maduración',
  9: 'Senescencia',
};

export interface CropGrowthStage {
  readonly scale: 'BBCH';
  /** Código BBCH completo, entero entre 0 y 99. */
  readonly code: number;
  /** Estadio principal (primer dígito del código). */
  readonly principal: BbchPrincipalStage;
}

export function cropGrowthStageFromBbch(code: number): CropGrowthStage {
  if (!Number.isInteger(code) || code < 0 || code > 99) {
    throw new RangeError(`Código BBCH fuera de rango (0–99): ${String(code)}`);
  }
  return {
    scale: 'BBCH',
    code,
    principal: Math.floor(code / 10) as BbchPrincipalStage,
  };
}
