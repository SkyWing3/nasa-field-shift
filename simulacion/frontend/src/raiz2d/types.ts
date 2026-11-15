/**
 * Contrato de los archivos publicados en /raiz/data/ (schema 3.1-d1).
 * Solo se tipan los campos que la interfaz lee; el resto del JSON se conserva intacto.
 */

export type Phase = 'Normal' | 'Niño' | 'Niña';
/** Escenario de la campaña de decisión. «Niño fuerte» es un subconjunto de Niño (ONI ≥ 1,5). */
export type Scenario = Phase | 'Niño fuerte';
export type PeriodId = 'all' | 'historical' | 'recent';
export type WindowPeriod = 'historical' | 'recent' | 'cross_period';
export type CropId = 'papa' | 'quinua' | 'haba' | 'descanso';
export type Level = 'decision_kpis' | 'cycle_kpis';

export type KpiKey =
  | 'net_irrigation_required_mm'
  | 'net_irrigation_applied_mm'
  | 'water_deficit_mm'
  | 'water_stress_days'
  | 'crop_demand_mm'
  | 'effective_rain_mm'
  | 'thermal_exposure_days'
  | 'coverage_pct'
  | 'partial_cover_pct'
  | 'bare_days'
  | 'bare_rain_exposure_days'
  | 'bare_wind_exposure_days';

export type BudgetKind = 'requirement' | 'hypothetical_cap' | 'rainfed';

export interface WaterBudget {
  id: string;
  label: string;
  per_campaign_mm: number | null;
  kind: BudgetKind;
  note: string;
}

export interface KpiDefinition {
  key: KpiKey;
  unit: string;
  direction: 'lower' | 'higher' | 'neutral';
  definition: string;
}

export type KpiValues = Record<KpiKey, number | null>;

export interface MetricSummary {
  mean: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

export type KpiSummary = Record<KpiKey, MetricSummary>;

interface Envelope {
  schema_version: string;
  build_id: string;
  data_as_of: string | null;
  model_version: string | null;
  generated_at: string | null;
}

export interface CropCalendar {
  sowing_months?: number[];
  harvest_months?: number[];
  irrigation?: string;
  period?: string;
  note?: string;
  sources: string[];
}

export interface Crop {
  id: CropId;
  name: string;
  calendar: CropCalendar;
  depletion_p?: number | null;
}

export interface SoilProfile {
  id: string;
  farmer_description: string;
  texture_interpreted: string;
  effective_depth_cm: number | null;
  available_water_m_per_m: [number, number];
  note: string;
}

export interface Point {
  lat: number;
  lon: number;
  comunidad: string;
  municipio: string;
  departamento: string;
  elevation_m: { value: number; source: string; doi: string };
  representativeness: string;
  coordinate_precision_deg: number;
}

export interface Case {
  case_id: string;
  sequence_id: string;
  start_position: number;
  crops: CropId[];
  baseline_status: string;
}

export interface Assumption {
  source: string;
  value: unknown;
  unit?: string;
  measured?: boolean;
  note?: string;
  reference?: string;
}

export interface Catalog extends Envelope {
  mode: string;
  point: Point;
  crops: Crop[];
  soils: { profiles: SoilProfile[] };
  cases: Case[];
  water_budgets: WaterBudget[];
  kpis: KpiDefinition[];
  null_reasons: Partial<Record<KpiKey, string>>;
  assumptions: Assumption[];
  model_limits: string[];
  periods: { id: PeriodId; label: string }[];
  sensitivity_status: string;
  chirps_status: string;
}

/** Fila de campaña tal como llega (valores textuales, derivados de CSV). */
export interface RawCampaign {
  campania: string;
  anio_inicio: string;
  completa: string;
  incluida_analisis: string;
  oni_ndj_c: string;
  fase_enso: string;
  nino_fuerte: string;
  lluvia_campania_mm: string;
  normal_referencia_mm: string;
  anomalia_pct: string;
  menor_normal: string;
  causa_exclusion: string;
  dias_validos_lluvia: string;
  dias_esperados: string;
}

export interface StrongCampaign {
  campania: string;
  anio_inicio: number;
  oni_ndj_c: number;
  lluvia_campania_mm: number;
}

export interface FourOfFive {
  interpretation: string;
  normal_reference_mm: number;
  normal_campaign_count: number;
  normal_campaigns: string[];
  strong_campaign_count: number;
  strong_campaigns_below_normal: number;
  strong_campaigns: StrongCampaign[];
  method: string;
  p6_verification: { status: string; source: string };
}

export interface ClimateWindow {
  window_id: string;
  year: number;
  campaigns: string[];
  phase: Phase;
  oni_ndj: number;
  period_id: WindowPeriod;
  phase_source: string;
}

export interface Climate extends Envelope {
  mode: string;
  four_of_five: FourOfFive;
  campaigns: RawCampaign[];
  windows: ClimateWindow[];
  exclusions: { year: number; reason: string }[];
  phase_rule: string;
  campaign_rule: string;
  water_model_first_year: number;
}

export type CampaignResult = { crop: CropId; campaign: string } & KpiValues;

export interface WaterBalance {
  rain_mm: number;
  runoff_mm: number;
  irrigation_mm: number;
  et_mm: number;
  drainage_mm: number;
  storage_start_mm: number;
  storage_end_mm: number;
  closure_mm: number;
}

export type AssumptionRunId = 'suelo_bajo' | 'suelo_alto';
export type AssumptionKey = 'net_irrigation_required_mm' | 'net_irrigation_applied_mm' | 'water_stress_days';

export interface RecordRow {
  result_id: string;
  case_id: string;
  window_id: string;
  water_budget_id: string;
  phase: Phase;
  enso_initial_phase: Phase;
  period_id: WindowPeriod;
  decision_kpis: KpiValues;
  cycle_kpis: KpiValues;
  campaigns: CampaignResult[];
  balance: WaterBalance;
  /** Sin días de estrés hídrico en los cultivos con riego. */
  constraint_pass: boolean;
  assumption_runs: Record<AssumptionRunId, Record<AssumptionKey, number | null>>;
}

export interface Aggregate {
  result_id: string;
  case_id: string;
  water_budget_id: string;
  phase: Phase;
  period_id: PeriodId;
  n_windows: number;
  n_unique_campaigns: number;
  decision_kpis: KpiSummary;
  cycle_kpis: KpiSummary;
  constraint_pass: { rule: string; numerator: number; denominator: number; frequency: number | null };
  assumption_range: Record<AssumptionKey, [number, number] | null>;
}

export interface Results extends Envelope {
  mode: string;
  kpi_units: Record<KpiKey, string>;
  records: RecordRow[];
  aggregates: Aggregate[];
  limits: string[];
  nine_cases_approved: boolean;
}

export interface Credits extends Envelope {
  sections: { title: string; markdown: string }[];
  framework: string;
  library: string;
  backend: string;
}

export interface AudioData extends Envelope {
  quechua_text: string;
  spanish_text: string;
  quechua_mp3: string | null;
  spanish_mp3: string | null;
  distribution_status: string;
}

export interface Manifest extends Envelope {
  files: { path: string; sha256: string; bytes: number }[];
  n_cases: number;
  n_windows: number;
  n_records: number;
}

export interface Bundle {
  catalog: Catalog;
  results: Results;
  climate: Climate;
  credits: Credits;
  audio: AudioData;
  manifest: Manifest;
}
