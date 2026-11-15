import { describe, expect, it } from 'vitest';

import {
  aggregateCase,
  climateByPeriod,
  coverCalendar,
  KPI_KEYS,
  parseCampaigns,
  rankCases,
  resultId,
  sampleStatus,
  summarize,
  waterByPosition,
  windowsFor,
} from './analysis';
import type { Catalog, Climate, PeriodId, Phase, Results } from './types';

// Paquete real publicado (mismo build_id que sirve la web); se lee sin tipar el JSON completo.
const files = import.meta.glob('../../public/raiz/data/{catalog,climate,results}.json', {
  eager: true,
  import: 'default',
});
const pick = (name: string): unknown => {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}.json`));
  if (!entry) throw new Error(`Falta ${name}.json`);
  return entry[1];
};
const catalog = pick('catalog') as Catalog;
const climate = pick('climate') as Climate;
const results = pick('results') as Results;
const budgets = catalog.water_budgets.map((b) => b.id);
// Los valores publicados se redondean a 0,01: la media de valores redondeados difiere < 0,01.
const TOLERANCE_DIGITS = 1;

describe('paquete publicado', () => {
  it('comparte un build_id y trae nueve casos × 40 ventanas × presupuestos', () => {
    expect(climate.build_id).toBe(catalog.build_id);
    expect(results.build_id).toBe(catalog.build_id);
    expect(catalog.cases).toHaveLength(9);
    expect(climate.windows).toHaveLength(40);
    expect(budgets[0]).toBe('requerimiento');
    expect(budgets).toContain('secano');
    expect(results.records).toHaveLength(9 * 40 * budgets.length);
  });

  it('el balance cierra en todas las corridas', () => {
    const worst = Math.max(...results.records.map((r) => Math.abs(r.balance.closure_mm)));
    expect(worst).toBeLessThan(0.01);
  });
});

describe('aggregateCase', () => {
  it('reproduce todos los agregados publicados por Dev 1, por presupuesto', () => {
    expect(results.aggregates).toHaveLength(9 * 3 * 3 * budgets.length);
    for (const published of results.aggregates) {
      const windows = windowsFor(climate, published.phase, published.period_id);
      const ours = aggregateCase(results.records, published.case_id, windows, published.water_budget_id);
      expect(ours.nWindows).toBe(published.n_windows);
      expect(ours.nUniqueCampaigns).toBe(published.n_unique_campaigns);
      expect(ours.pass.numerator).toBe(published.constraint_pass.numerator);
      expect(ours.pass.denominator).toBe(published.constraint_pass.denominator);
      for (const key of KPI_KEYS) {
        for (const level of ['decision', 'cycle'] as const) {
          const theirs = published[level === 'decision' ? 'decision_kpis' : 'cycle_kpis'][key];
          const mine = ours[level][key];
          expect(mine.n).toBe(theirs.n);
          if (theirs.mean === null) expect(mine.mean).toBeNull();
          else expect(mine.mean).toBeCloseTo(theirs.mean, TOLERANCE_DIGITS);
        }
      }
      const range = published.assumption_range.net_irrigation_required_mm;
      const mineRange = ours.assumptionRange.net_irrigation_required_mm;
      if (range === null) expect(mineRange).toBeNull();
      else {
        expect(mineRange?.[0]).toBeCloseTo(range[0], TOLERANCE_DIGITS);
        expect(mineRange?.[1]).toBeCloseTo(range[1], TOLERANCE_DIGITS);
      }
    }
  });

  it('recalcula Niño fuerte con su propio n y declara muestra insuficiente', () => {
    const all = windowsFor(climate, 'Niño fuerte', 'all');
    expect(all.map((w) => w.window_id)).toEqual(['1997', '2009', '2015', '2023']);
    expect(sampleStatus(all.length)).toBe('ok');
    const historical = windowsFor(climate, 'Niño fuerte', 'historical');
    expect(historical).toHaveLength(1);
    expect(sampleStatus(historical.length)).toBe('insufficient');
  });

  it('las ventanas que cruzan periodos solo cuentan en «todas»', () => {
    for (const phase of ['Normal', 'Niño', 'Niña'] as Phase[]) {
      const count = (p: PeriodId) => windowsFor(climate, phase, p).length;
      const cross = climate.windows.filter((w) => w.phase === phase && w.period_id === 'cross_period');
      expect(count('all')).toBe(count('historical') + count('recent') + cross.length);
    }
  });

  it('menos agua disponible nunca reduce el estrés', () => {
    const windows = windowsFor(climate, 'Niño', 'all');
    for (const kase of catalog.cases) {
      const stress = budgets.map(
        (b) => aggregateCase(results.records, kase.case_id, windows, b).cycle.water_stress_days.mean ?? 0,
      );
      // Orden del catálogo: requerimiento, cupo 200, cupo 100, secano.
      for (let i = 1; i < stress.length; i++) expect(stress[i]).toBeGreaterThanOrEqual(stress[i - 1] ?? 0);
    }
  });
});

describe('clima por periodo', () => {
  const campaigns = parseCampaigns(climate.campaigns);

  it('lee 45 campañas nov–mar con lluvia numérica', () => {
    expect(campaigns).toHaveLength(45);
    expect(campaigns.every((c) => typeof c.rainMm === 'number')).toBe(true);
  });

  it('separa 20 campañas históricas y 25 recientes sin sumar totales de distinta longitud', () => {
    const [historical, recent] = climateByPeriod(campaigns, 'Niño');
    expect(historical?.rain.n).toBe(20);
    expect(recent?.rain.n).toBe(25);
    expect(historical?.firstYear).toBe(1981);
    expect(recent?.lastYear).toBe(2025);
  });

  it('coincide con el «4 de 5» confirmado por P6', () => {
    const ref = climate.four_of_five.normal_reference_mm;
    const strong = campaigns.filter((c) => c.strong && c.included);
    expect(strong).toHaveLength(5);
    expect(strong.filter((c) => (c.rainMm ?? Infinity) < ref)).toHaveLength(4);
    const normals = campaigns.filter((c) => c.phase === 'Normal' && c.included);
    expect(summarize(normals.map((c) => c.rainMm)).mean).toBeCloseTo(ref, 6);
  });
});

describe('waterByPosition', () => {
  const a0 = catalog.cases.find((c) => c.case_id === 'A-0');
  if (!a0) throw new Error('Falta A-0');
  const windows = windowsFor(climate, 'Niño', 'all');

  it('riego para papa, déficit para quinua y nada calculado para descanso', () => {
    const water = waterByPosition(results.records, a0, windows, catalog.crops, 'requerimiento');
    expect(water.map((w) => w.kind)).toEqual(['riego', 'secano', 'descanso']);
    expect(water[0]?.water.n).toBe(14);
    expect(water[0]?.stressDays.mean).toBe(0);
    expect(water[2]?.water.mean).toBeNull();
    const agg = aggregateCase(results.records, 'A-0', windows, 'requerimiento');
    expect(water[0]?.applied.mean).toBeCloseTo(agg.cycle.net_irrigation_applied_mm.mean ?? NaN, TOLERANCE_DIGITS);
    expect(water[1]?.deficit.mean).toBeCloseTo(agg.cycle.water_deficit_mm.mean ?? NaN, TOLERANCE_DIGITS);
  });

  it('en secano la papa no recibe riego y sufre estrés', () => {
    const water = waterByPosition(results.records, a0, windows, catalog.crops, 'secano');
    expect(water[0]?.applied.mean).toBe(0);
    expect(water[0]?.stressDays.mean ?? 0).toBeGreaterThan(0);
  });

  it('sin ventanas mantiene el tipo de manejo y no inventa valores', () => {
    const b2 = catalog.cases.find((c) => c.case_id === 'B-2');
    if (!b2) throw new Error('Falta B-2');
    const water = waterByPosition(results.records, b2, [], catalog.crops, 'requerimiento');
    expect(water.map((w) => w.kind)).toEqual(['riego', 'riego', 'secano']);
    expect(water.every((w) => w.water.n === 0 && w.water.mean === null)).toBe(true);
  });
});

describe('rankCases', () => {
  const zero = { riego: 0, estres: 0, descubierto: 0, helada: 0 };
  const input = [
    { caseId: 'A-0', values: { riego: 394, estres: 129, descubierto: 336, helada: 4 } },
    { caseId: 'B-0', values: { riego: 646, estres: 129, descubierto: 504, helada: 11 } },
    { caseId: 'C-0', values: { riego: 635, estres: 0, descubierto: 336, helada: null } },
  ];

  it('sin pesos no ordena', () => {
    expect(rankCases(input, zero).status).toBe('no_weights');
  });

  it('normaliza mín–máx y ordena de mejor a peor', () => {
    const r = rankCases(input, { ...zero, riego: 1 });
    expect(r.ranked.map((x) => [x.caseId, x.score, x.rank])).toEqual([
      ['A-0', 100, 1],
      ['C-0', 4, 2],
      ['B-0', 0, 3],
    ]);
  });

  it('declara empates por puntaje igual', () => {
    const r = rankCases(input, { ...zero, descubierto: 1 });
    expect(r.ranked.filter((x) => x.tied).map((x) => x.caseId)).toEqual(['A-0', 'C-0']);
  });

  it('excluye al caso sin dato en vez de premiarlo', () => {
    const r = rankCases(input, { ...zero, helada: 2 });
    expect(r.excluded).toEqual([{ caseId: 'C-0', missing: ['helada'] }]);
    expect(r.ranked.map((x) => x.caseId)).toEqual(['A-0', 'B-0']);
  });

  it('nada comparable si todos carecen del KPI pedido', () => {
    const r = rankCases([{ caseId: 'C-1', values: { riego: 1, estres: 1, descubierto: 1, helada: null } }], {
      ...zero,
      helada: 1,
    });
    expect(r.status).toBe('nothing_comparable');
  });
});

describe('coverCalendar', () => {
  it('describe 36 meses con siembra, cultivo, cosecha, descanso y meses sin cultivo', () => {
    const a0 = catalog.cases.find((c) => c.case_id === 'A-0');
    if (!a0) throw new Error('Falta A-0');
    const cells = coverCalendar(a0, catalog.crops);
    expect(cells).toHaveLength(36);
    const papa = cells.filter((c) => c.campaign === 0);
    // Julio–agosto sin cultivo; siembra sep–oct; cultivo nov–mar; cosecha abril; mayo–junio sin cultivo.
    expect(papa.map((c) => c.state)).toEqual([
      'sin_cultivo', 'sin_cultivo', 'siembra', 'siembra', 'cultivo', 'cultivo',
      'cultivo', 'cultivo', 'cultivo', 'cosecha', 'sin_cultivo', 'sin_cultivo',
    ]);
    expect(cells.filter((c) => c.campaign === 2).every((c) => c.state === 'descanso')).toBe(true);
  });
});

describe('resultId', () => {
  it('es estable, legible e incluye el presupuesto', () => {
    expect(resultId('b1', 'B-0', 'cupo_200', 'Niño fuerte', 'recent', 'mean')).toBe(
      'b1/B-0/cupo_200/nino-fuerte/recent/promedio',
    );
    expect(resultId('b1', 'A-1', 'secano', 'Niña', 'all', '2020')).toBe('b1/A-1/secano/nina/all/2020');
  });
});
