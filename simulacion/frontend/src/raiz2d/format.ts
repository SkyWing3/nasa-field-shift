import { M3_PER_HA_PER_MM } from './analysis';
import type { CropId, PeriodId, Scenario } from './types';

const one = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const zero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const twoDec = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const SIN_DATO = 'sin dato';

export const fmt = (v: number | null | undefined) => (v == null ? SIN_DATO : one.format(v));
export const fmt0 = (v: number | null | undefined) => (v == null ? SIN_DATO : zero.format(v));
/** Dos decimales: para magnitudes pequeñas como el agua disponible (0,14–0,16 m/m). */
export const fmt2 = (v: number | null | undefined) => (v == null ? SIN_DATO : twoDec.format(v));
export const fmtOni = (v: number | null | undefined) => (v == null ? SIN_DATO : twoDec.format(v));
export const mm = (v: number | null | undefined) => (v == null ? SIN_DATO : `${zero.format(v)} mm`);
export const m3ha = (v: number | null | undefined) =>
  v == null ? SIN_DATO : `${zero.format(Math.round((v * M3_PER_HA_PER_MM) / 10) * 10)} m³/ha`;
export const signedMm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${zero.format(Math.abs(v))} mm`;

export const CROP_NAME: Record<CropId, string> = {
  papa: 'Papa',
  quinua: 'Quinua',
  haba: 'Haba',
  descanso: 'Descanso',
};

export const SCENARIOS: readonly Scenario[] = ['Normal', 'Niño', 'Niña', 'Niño fuerte'];

export const SCENARIO_HINT: Record<Scenario, string> = {
  Normal: 'ONI entre −0,5 y 0,5',
  Niño: 'ONI ≥ 0,5',
  Niña: 'ONI ≤ −0,5',
  'Niño fuerte': 'ONI ≥ 1,5',
};

export const PERIOD_LABEL: Record<PeriodId, string> = {
  all: 'Todas las campañas',
  historical: '1981–2000',
  recent: '2001–2025',
};

export const SEQUENCE_NOTE: Record<string, string> = {
  A: 'Base candidata',
  B: 'Alternativa con haba',
  C: 'Alternativa sin quinua',
};

export const cropList = (crops: readonly CropId[]) => crops.map((c) => CROP_NAME[c]).join(', ');

export const caseLabel = (crops: readonly CropId[]) => crops.map((c) => CROP_NAME[c]).join(' → ');
