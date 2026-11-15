import { useCallback, useEffect, useState } from 'react';

import { windowsFor, type Weights } from './analysis';
import type { Bundle, CropId, PeriodId, Scenario } from './types';

export type Step = 'clima' | 'rotaciones' | 'suelo' | 'ficha';
export type CropChoice = CropId | 'todos';

export const STEPS: readonly { id: Step; label: string; short: string }[] = [
  { id: 'clima', label: 'Clima y contexto', short: 'Clima' },
  { id: 'rotaciones', label: 'Rotaciones', short: 'Rotaciones' },
  { id: 'suelo', label: 'Suelo y confianza', short: 'Suelo' },
  { id: 'ficha', label: 'Ficha y radio', short: 'Ficha' },
];

export interface Selection {
  step: Step;
  scenario: Scenario;
  period: PeriodId;
  crop: CropChoice;
  caseId: string;
  windowId: string;
  budget: string;
  weights: Weights;
}

const SCENARIO_SLUGS: Record<string, Scenario> = {
  normal: 'Normal',
  nino: 'Niño',
  nina: 'Niña',
  'nino-fuerte': 'Niño fuerte',
};
const scenarioSlug = (s: Scenario) =>
  Object.entries(SCENARIO_SLUGS).find(([, v]) => v === s)?.[0] ?? 'nino';
const PERIOD_SLUGS: Record<string, PeriodId> = { todas: 'all', historico: 'historical', reciente: 'recent' };
const periodSlug = (p: PeriodId) => Object.entries(PERIOD_SLUGS).find(([, v]) => v === p)?.[0] ?? 'todas';
const CROPS: readonly CropChoice[] = ['papa', 'quinua', 'haba', 'descanso', 'todos'];

const weight = (v: string | null, fallback: number) => {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= 0 && n <= 3 ? n : fallback;
};

export const DEFAULT_SELECTION: Selection = {
  step: 'clima',
  // NOAA CPC (12-nov-2026) considera probable un Niño fuerte para 2026–27: punto de partida útil.
  scenario: 'Niño',
  period: 'all',
  crop: 'papa',
  caseId: 'A-0',
  windowId: 'mean',
  budget: 'requerimiento',
  // Agua de pozo y estrés hídrico pesan igual al inicio; el resto se activa desde los controles.
  weights: { riego: 1, estres: 1, descubierto: 0, helada: 0 },
};

/** Corrige combinaciones imposibles (caso que no empieza con el cultivo, año fuera del filtro). */
export function normalize(sel: Selection, data: Bundle): Selection {
  const cases = data.catalog.cases;
  let { caseId, windowId } = sel;
  const current = cases.find((c) => c.case_id === caseId);
  if (!current || (sel.crop !== 'todos' && current.crops[0] !== sel.crop)) {
    const candidates = cases.filter((c) => sel.crop === 'todos' || c.crops[0] === sel.crop);
    caseId = (candidates[0] ?? cases[0])?.case_id ?? 'A-0';
  }
  if (windowId !== 'mean' && !windowsFor(data.climate, sel.scenario, sel.period).some((w) => w.window_id === windowId)) {
    windowId = 'mean';
  }
  const budget = data.catalog.water_budgets.some((b) => b.id === sel.budget)
    ? sel.budget
    : (data.catalog.water_budgets[0]?.id ?? 'requerimiento');
  return caseId === sel.caseId && windowId === sel.windowId && budget === sel.budget
    ? sel
    : { ...sel, caseId, windowId, budget };
}

export function readUrl(search: string): Selection {
  const q = new URLSearchParams(search);
  const step = q.get('paso');
  const crop = q.get('cultivo');
  return {
    step: step === 'rotaciones' || step === 'suelo' || step === 'ficha' ? step : 'clima',
    scenario: SCENARIO_SLUGS[q.get('escenario') ?? ''] ?? DEFAULT_SELECTION.scenario,
    period: PERIOD_SLUGS[q.get('periodo') ?? ''] ?? DEFAULT_SELECTION.period,
    crop: CROPS.includes(crop as CropChoice) ? (crop as CropChoice) : DEFAULT_SELECTION.crop,
    caseId: q.get('caso') ?? DEFAULT_SELECTION.caseId,
    windowId: q.get('anio') ?? 'mean',
    budget: q.get('presupuesto') ?? DEFAULT_SELECTION.budget,
    weights: {
      riego: weight(q.get('p_riego'), DEFAULT_SELECTION.weights.riego),
      estres: weight(q.get('p_estres'), DEFAULT_SELECTION.weights.estres),
      descubierto: weight(q.get('p_descubierto'), DEFAULT_SELECTION.weights.descubierto),
      helada: weight(q.get('p_helada'), DEFAULT_SELECTION.weights.helada),
    },
  };
}

export function toSearch(sel: Selection): string {
  const q = new URLSearchParams({
    paso: sel.step,
    escenario: scenarioSlug(sel.scenario),
    periodo: periodSlug(sel.period),
    cultivo: sel.crop,
    caso: sel.caseId,
  });
  if (sel.windowId !== 'mean') q.set('anio', sel.windowId);
  q.set('presupuesto', sel.budget);
  for (const [id, value] of Object.entries(sel.weights)) q.set(`p_${id}`, String(value));
  return `?${q.toString()}`;
}

/**
 * Estado de la selección sincronizado con la URL: los cambios de paso crean una entrada
 * en el historial (atrás vuelve al paso anterior); los controles la reemplazan.
 */
export function useSelection(data: Bundle | null) {
  const [selection, setSelection] = useState<Selection>(() => readUrl(location.search));

  useEffect(() => {
    const onPop = () => {
      setSelection(readUrl(location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const effective = data ? normalize(selection, data) : selection;

  const update = useCallback(
    (patch: Partial<Selection>) => {
      const merged = { ...effective, ...patch };
      const next = data ? normalize(merged, data) : merged;
      const stepChanged = patch.step !== undefined && patch.step !== effective.step;
      // Efectos fuera del actualizador de estado: StrictMode lo invoca dos veces.
      if (stepChanged) history.pushState(null, '', toSearch(next));
      else history.replaceState(null, '', toSearch(next) + location.hash);
      setSelection(next);
    },
    [effective, data],
  );

  return [effective, update] as const;
}
