/**
 * Lógica pura de Raíz: todo lo que la interfaz muestra se deriva aquí de los JSON
 * publicados, sin consultar proveedores ni inventar valores. Cada función es
 * determinista y está cubierta por analysis.test.ts.
 */
import type {
  AssumptionKey,
  Case,
  Climate,
  ClimateWindow,
  Crop,
  CropId,
  KpiKey,
  KpiSummary,
  Level,
  MetricSummary,
  PeriodId,
  Phase,
  RawCampaign,
  RecordRow,
  Scenario,
} from './types';

export const KPI_KEYS: readonly KpiKey[] = [
  'net_irrigation_required_mm',
  'net_irrigation_applied_mm',
  'water_deficit_mm',
  'water_stress_days',
  'crop_demand_mm',
  'effective_rain_mm',
  'thermal_exposure_days',
  'coverage_pct',
  'partial_cover_pct',
  'bare_days',
  'bare_rain_exposure_days',
  'bare_wind_exposure_days',
];
const ASSUMPTION_KEYS: readonly AssumptionKey[] = [
  'net_irrigation_required_mm',
  'net_irrigation_applied_mm',
  'water_stress_days',
];

/** Umbral NOAA para «Niño fuerte» (ONI NDJ). */
export const STRONG_NINO_ONI = 1.5;
/** Con menos ventanas no se extrae una conclusión (plan v3.1, punto 2). */
export const MIN_SAMPLE = 3;
/** 1 mm de lámina sobre una hectárea equivale a 10 m³. */
export const M3_PER_HA_PER_MM = 10;

// ---------------------------------------------------------------- estadística

export function summarize(values: readonly (number | null | undefined)[]): MetricSummary {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return { mean: null, min: null, max: null, n: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of valid) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { mean: sum / valid.length, min, max, n: valid.length };
}

export type SampleStatus = 'empty' | 'insufficient' | 'ok';

export function sampleStatus(n: number): SampleStatus {
  if (n === 0) return 'empty';
  return n < MIN_SAMPLE ? 'insufficient' : 'ok';
}

// ---------------------------------------------------------------- clima

export interface Campaign {
  id: string;
  startYear: number;
  rainMm: number | null;
  oni: number | null;
  phase: Phase | null;
  strong: boolean;
  included: boolean;
  belowNormal: boolean;
  anomalyPct: number | null;
  validDays: number | null;
  expectedDays: number | null;
  exclusion: string;
}

const toNumber = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const toBool = (s: string | undefined) => s === 'True' || s === 'true';
const toPhase = (s: string | undefined): Phase | null =>
  s === 'Normal' || s === 'Niño' || s === 'Niña' ? s : null;

/** Convierte las filas textuales de campañas en valores tipados. */
export function parseCampaigns(raw: readonly RawCampaign[]): Campaign[] {
  return raw.map((r) => ({
    id: r.campania,
    startYear: Number(r.anio_inicio),
    rainMm: toNumber(r.lluvia_campania_mm),
    oni: toNumber(r.oni_ndj_c),
    phase: toPhase(r.fase_enso),
    strong: toBool(r.nino_fuerte),
    included: toBool(r.incluida_analisis) && toBool(r.completa),
    belowNormal: toBool(r.menor_normal),
    anomalyPct: toNumber(r.anomalia_pct),
    validDays: toNumber(r.dias_validos_lluvia),
    expectedDays: toNumber(r.dias_esperados),
    exclusion: r.causa_exclusion,
  }));
}

/** Periodos de comparación del contrato: 1981–2000 y 2001–2025 (año inicial de campaña). */
export function periodOfYear(startYear: number): Exclude<PeriodId, 'all'> | null {
  if (startYear >= 1981 && startYear <= 2000) return 'historical';
  if (startYear >= 2001 && startYear <= 2025) return 'recent';
  return null;
}

export function matchesScenario(
  phase: Phase | null,
  oni: number | null,
  scenario: Scenario,
): boolean {
  if (scenario === 'Niño fuerte') return phase === 'Niño' && oni !== null && oni >= STRONG_NINO_ONI;
  return phase === scenario;
}

export interface PeriodClimate {
  period: Exclude<PeriodId, 'all'>;
  rain: MetricSummary;
  /** Campañas del escenario elegido dentro del periodo. */
  scenario: MetricSummary;
  firstYear: number | null;
  lastYear: number | null;
}

export function climateByPeriod(
  campaigns: readonly Campaign[],
  scenario: Scenario,
): PeriodClimate[] {
  return (['historical', 'recent'] as const).map((period) => {
    const inPeriod = campaigns.filter((c) => c.included && periodOfYear(c.startYear) === period);
    const years = inPeriod.map((c) => c.startYear);
    return {
      period,
      rain: summarize(inPeriod.map((c) => c.rainMm)),
      scenario: summarize(
        inPeriod.filter((c) => matchesScenario(c.phase, c.oni, scenario)).map((c) => c.rainMm),
      ),
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
    };
  });
}

// ---------------------------------------------------------------- ventanas y KPI

export function windowsFor(
  climate: Climate,
  scenario: Scenario,
  period: PeriodId,
): ClimateWindow[] {
  return climate.windows.filter(
    (w) =>
      matchesScenario(w.phase, w.oni_ndj, scenario) &&
      (period === 'all' || w.period_id === period),
  );
}

export interface CaseAggregate {
  caseId: string;
  budgetId: string;
  nWindows: number;
  nUniqueCampaigns: number;
  decision: KpiSummary;
  cycle: KpiSummary;
  /** Ventanas sin estrés hídrico en los cultivos con riego: numerador / denominador. */
  pass: { numerator: number; denominator: number };
  /** Mínimo y máximo de la media entre la corrida central y los extremos de suelo. */
  assumptionRange: Record<AssumptionKey, [number, number] | null>;
}

function summarizeLevel(rows: readonly RecordRow[], level: Level): KpiSummary {
  const out = {} as KpiSummary;
  for (const key of KPI_KEYS) out[key] = summarize(rows.map((r) => r[level][key]));
  return out;
}

/**
 * Agrega los registros de un caso sobre un conjunto de ventanas. Reproduce el método
 * de `results.aggregates` (media, mínimo, máximo y n por KPI) y lo extiende a
 * subconjuntos que el paquete no trae agregados, como Niño fuerte o un solo año.
 */
export function aggregateCase(
  records: readonly RecordRow[],
  caseId: string,
  windows: readonly ClimateWindow[],
  budgetId: string,
): CaseAggregate {
  const ids = new Set(windows.map((w) => w.window_id));
  const rows = records.filter(
    (r) => r.case_id === caseId && r.water_budget_id === budgetId && ids.has(r.window_id),
  );
  const unique = new Set(windows.filter((w) => rows.some((r) => r.window_id === w.window_id)).flatMap((w) => w.campaigns));
  const cycle = summarizeLevel(rows, 'cycle_kpis');
  const assumptionRange = {} as CaseAggregate['assumptionRange'];
  for (const key of ASSUMPTION_KEYS) {
    const means = [
      cycle[key].mean,
      summarize(rows.map((r) => r.assumption_runs.suelo_bajo[key])).mean,
      summarize(rows.map((r) => r.assumption_runs.suelo_alto[key])).mean,
    ].filter((v): v is number => v !== null);
    assumptionRange[key] = means.length ? [Math.min(...means), Math.max(...means)] : null;
  }
  return {
    caseId,
    budgetId,
    nWindows: rows.length,
    nUniqueCampaigns: unique.size,
    decision: summarizeLevel(rows, 'decision_kpis'),
    cycle,
    pass: { numerator: rows.filter((r) => r.constraint_pass).length, denominator: rows.length },
    assumptionRange,
  };
}

export type WaterKind = 'riego' | 'secano' | 'descanso';

export interface PositionWater {
  position: number;
  crop: CropId;
  kind: WaterKind;
  /** Riego aplicado (cultivos con pozo) o déficit de agua (cultivos de secano). */
  water: MetricSummary;
  applied: MetricSummary;
  deficit: MetricSummary;
  stressDays: MetricSummary;
}

/** Manejo de agua declarado en el calendario del productor. */
export function waterKind(cropId: CropId, crops: readonly Crop[]): WaterKind {
  if (cropId === 'descanso') return 'descanso';
  const irrigation = crops.find((c) => c.id === cropId)?.calendar.irrigation ?? '';
  return /secano/i.test(irrigation) ? 'secano' : 'riego';
}

/** Agua por posición de la secuencia (campaña 1, 2 y 3) con el presupuesto elegido. */
export function waterByPosition(
  records: readonly RecordRow[],
  kase: Case,
  windows: readonly ClimateWindow[],
  crops: readonly Crop[],
  budgetId: string,
): PositionWater[] {
  const ids = new Set(windows.map((w) => w.window_id));
  const rows = records.filter(
    (r) => r.case_id === kase.case_id && r.water_budget_id === budgetId && ids.has(r.window_id),
  );
  return kase.crops.map((crop, position) => {
    const cells = rows.map((r) => r.campaigns[position]).filter((c) => c !== undefined);
    const kind = waterKind(crop, crops);
    const applied = summarize(cells.map((c) => c.net_irrigation_applied_mm));
    const deficit = summarize(cells.map((c) => c.water_deficit_mm));
    return {
      position,
      crop,
      kind,
      water: kind === 'riego' ? applied : kind === 'secano' ? deficit : summarize([]),
      applied,
      deficit,
      stressDays: summarize(cells.map((c) => c.water_stress_days)),
    };
  });
}

// ---------------------------------------------------------------- prioridades

export type CriterionId = 'riego' | 'estres' | 'descubierto' | 'helada';

export interface Criterion {
  id: CriterionId;
  label: string;
  /** KPI del ciclo de tres campañas. Todas las prioridades prefieren el valor menor. */
  kpi: KpiKey;
  direction: 'lower';
}

export const CRITERIA: readonly Criterion[] = [
  { id: 'riego', label: 'Menos agua de pozo', kpi: 'net_irrigation_applied_mm', direction: 'lower' },
  { id: 'estres', label: 'Menos días de estrés hídrico', kpi: 'water_stress_days', direction: 'lower' },
  { id: 'descubierto', label: 'Menos días sin cultivo', kpi: 'bare_days', direction: 'lower' },
  { id: 'helada', label: 'Menos días de helada', kpi: 'thermal_exposure_days', direction: 'lower' },
];

export type Weights = Record<CriterionId, number>;

export interface RankInput {
  caseId: string;
  values: Record<CriterionId, number | null>;
}

export interface RankedCase {
  caseId: string;
  /** Puntaje entero 0–100; 100 = mejor valor en todas las prioridades con peso. */
  score: number;
  rank: number;
  tied: boolean;
}

export interface Ranking {
  status: 'no_weights' | 'ranked' | 'nothing_comparable';
  active: CriterionId[];
  ranked: RankedCase[];
  excluded: { caseId: string; missing: CriterionId[] }[];
  ranges: Partial<Record<CriterionId, { min: number; max: number }>>;
}

/**
 * Ordena casos por prioridades ponderadas.
 * - Normalización mín–máx entre los casos comparados; si todos son iguales, cada
 *   caso recibe el máximo en esa prioridad (no hay diferencia que premiar).
 * - Puntaje = Σ peso · normalizado / Σ pesos, redondeado a entero de 0 a 100.
 * - Un caso sin valor en una prioridad con peso queda fuera: omitir un KPI no mejora
 *   un puntaje.
 * - Puntajes enteros iguales comparten puesto (empate); se conserva el orden del catálogo.
 */
export function rankCases(inputs: readonly RankInput[], weights: Weights): Ranking {
  const active = CRITERIA.filter((c) => weights[c.id] > 0).map((c) => c.id);
  if (active.length === 0) return { status: 'no_weights', active, ranked: [], excluded: [], ranges: {} };

  const excluded: Ranking['excluded'] = [];
  const comparable: RankInput[] = [];
  for (const input of inputs) {
    const missing = active.filter((id) => input.values[id] === null);
    if (missing.length) excluded.push({ caseId: input.caseId, missing });
    else comparable.push(input);
  }
  if (comparable.length === 0) return { status: 'nothing_comparable', active, ranked: [], excluded, ranges: {} };

  const ranges: Ranking['ranges'] = {};
  for (const id of active) {
    const vals = comparable.map((c) => c.values[id]).filter((v): v is number => v !== null);
    ranges[id] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  const totalWeight = active.reduce((sum, id) => sum + weights[id], 0);
  const scored = comparable.map((c, order) => {
    let acc = 0;
    for (const id of active) {
      const range = ranges[id];
      const v = c.values[id];
      if (v === null || range === undefined) continue; // imposible: excluidos arriba
      const normalized = range.max === range.min ? 1 : (range.max - v) / (range.max - range.min);
      acc += weights[id] * normalized;
    }
    return { caseId: c.caseId, score: Math.round((acc / totalWeight) * 100), order };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  const ranked: RankedCase[] = [];
  scored.forEach((s, i) => {
    const prev = ranked[i - 1];
    const rank = prev?.score === s.score ? prev.rank : i + 1;
    ranked.push({ caseId: s.caseId, score: s.score, rank, tied: false });
  });
  for (const r of ranked) r.tied = ranked.filter((o) => o.rank === r.rank).length > 1;
  return { status: 'ranked', active, ranked, excluded, ranges };
}

// ---------------------------------------------------------------- calendario de cobertura

export type CoverState = 'siembra' | 'cultivo' | 'cosecha' | 'descanso' | 'sin_cultivo';

export interface CoverCell {
  campaign: number;
  /** Mes calendario 1–12. */
  month: number;
  crop: CropId | null;
  state: CoverState;
}

/** Año agrícola de julio a junio: julio = 0, junio = 11. */
const agIndex = (month: number) => (month - 7 + 12) % 12;
export const AG_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6] as const;

/**
 * Cobertura planificada por mes (36 meses) a partir del calendario del productor.
 * No es una medición: describe dónde hay cultivo, descanso o ningún cultivo planificado.
 */
export function coverCalendar(kase: Case, crops: readonly Crop[]): CoverCell[] {
  const cells: CoverCell[] = [];
  kase.crops.forEach((cropId, campaign) => {
    const crop = crops.find((c) => c.id === cropId);
    const sow = (crop?.calendar.sowing_months ?? []).map(agIndex);
    const harvest = (crop?.calendar.harvest_months ?? []).map(agIndex);
    AG_MONTHS.forEach((month, i) => {
      let state: CoverState;
      if (cropId === 'descanso') state = 'descanso';
      else if (sow.length === 0 || harvest.length === 0) state = 'sin_cultivo';
      else if (i >= Math.min(...sow) && i <= Math.max(...sow)) state = 'siembra';
      else if (i > Math.max(...sow) && i < Math.min(...harvest)) state = 'cultivo';
      else if (i >= Math.min(...harvest) && i <= Math.max(...harvest)) state = 'cosecha';
      else state = 'sin_cultivo';
      cells.push({ campaign, month, crop: state === 'sin_cultivo' ? null : cropId, state });
    });
  });
  return cells;
}

// ---------------------------------------------------------------- identificadores

const SCENARIO_SLUG: Record<Scenario, string> = {
  Normal: 'normal',
  Niño: 'nino',
  Niña: 'nina',
  'Niño fuerte': 'nino-fuerte',
};

/** Identificador estable de un resultado; el mismo aparece en la vista y en la ficha. */
export function resultId(
  buildId: string,
  caseId: string,
  budgetId: string,
  scenario: Scenario,
  period: PeriodId,
  windowId: string,
): string {
  return [buildId, caseId, budgetId, SCENARIO_SLUG[scenario], period, windowId === 'mean' ? 'promedio' : windowId].join('/');
}
