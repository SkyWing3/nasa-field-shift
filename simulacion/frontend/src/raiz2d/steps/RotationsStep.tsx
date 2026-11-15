import { useId, useState } from 'react';

import {
  aggregateCase,
  CRITERIA,
  rankCases,
  sampleStatus,
  waterByPosition,
  waterKind,
  windowsFor,
  type CaseAggregate,
  type CriterionId,
  type PositionWater,
  type Ranking,
} from '../analysis';
import { Choice, CropTag, Faja, Mark, NextStep, Notice, StepHeading } from '../components';
import { caseLabel, CROP_NAME, fmt0, fmtOni, m3ha, mm, PERIOD_LABEL, SEQUENCE_NOTE, signedMm } from '../format';
import { ScenarioControls } from '../ScenarioControls';
import type { CropChoice, Selection, Step } from '../state';
import type { Bundle, Case, CropId, Level, WaterBudget } from '../types';

interface Props {
  data: Bundle;
  selection: Selection;
  update: (patch: Partial<Selection>) => void;
  onStep: (step: Step) => void;
}

interface Row {
  kase: Case;
  agg: CaseAggregate;
  water: PositionWater[];
}

const CROP_ORDER: readonly CropId[] = ['papa', 'quinua', 'haba', 'descanso'];
const days = (v: number | null | undefined) => (v == null ? 'sin dato' : `${fmt0(v)} ${Math.round(v) === 1 ? 'día' : 'días'}`);

export function RotationsStep({ data, selection, update, onStep }: Props) {
  const { catalog, climate, results } = data;
  const windows = windowsFor(climate, selection.scenario, selection.period);
  const yearMode = selection.windowId !== 'mean';
  const active = yearMode ? windows.filter((w) => w.window_id === selection.windowId) : windows;
  const status = sampleStatus(windows.length);
  const budget = catalog.water_budgets.find((b) => b.id === selection.budget) ?? catalog.water_budgets[0];
  const budgetId = budget?.id ?? 'requerimiento';
  const shown = catalog.cases.filter((c) => selection.crop === 'todos' || c.crops[0] === selection.crop);
  const rows: Row[] = shown.map((kase) => ({
    kase,
    agg: aggregateCase(results.records, kase.case_id, active, budgetId),
    water: waterByPosition(results.records, kase, active, catalog.crops, budgetId),
  }));
  const canRank = !yearMode && status === 'ok';
  const ranking = canRank
    ? rankCases(
        rows.map((r) => ({
          caseId: r.kase.case_id,
          values: Object.fromEntries(CRITERIA.map((c) => [c.id, r.agg.cycle[c.kpi].mean])) as Record<
            CriterionId,
            number | null
          >,
        })),
        selection.weights,
      )
    : null;
  const ordered = orderRows(rows, ranking);
  const scaleMax = Math.max(0, ...rows.flatMap((r) => r.water.map((p) => p.water.mean ?? 0)));
  const uniqueCampaigns = new Set(windows.flatMap((w) => w.campaigns)).size;
  const requiredOf = (caseId: string) =>
    aggregateCase(results.records, caseId, active, budgetId).cycle.net_irrigation_required_mm.mean;

  return (
    <>
      <StepHeading
        id="paso-rotaciones"
        title="Tres secuencias, nueve posiciones"
        lead="Elija qué va a sembrar en la campaña de decisión y cuánta agua de pozo hay. Raíz muestra esa campaña y, debajo, el ciclo completo de tres campañas para cada secuencia que empieza así."
      />

      <div className="rot-layout">
        <div className="rot-panel">
          <Choice<CropChoice>
            legend="Cultivo en la campaña de decisión"
            name="cultivo"
            variant="chips"
            value={selection.crop}
            onChange={(crop) => {
              update({ crop, windowId: 'mean' });
            }}
            options={[
              ...CROP_ORDER.map((c) => ({
                value: c,
                label: CROP_NAME[c],
                hint: `${catalog.cases.filter((k) => k.crops[0] === c).length} casos`,
                crop: c,
              })),
              { value: 'todos' as const, label: 'Los nueve casos', hint: '3 secuencias' },
            ]}
          />
          <ScenarioControls selection={selection} update={update} />
          <BudgetChoice budgets={catalog.water_budgets} value={budgetId} update={update} />
          <YearSelect data={data} selection={selection} update={update} />
          <Priorities selection={selection} update={update} ranking={ranking} canRank={canRank} />
        </div>

        <div className="rot-results" aria-live="polite">
          <SampleLine
            nWindows={windows.length}
            uniqueCampaigns={uniqueCampaigns}
            scenario={selection.scenario}
            periodLabel={PERIOD_LABEL[selection.period]}
            yearWindow={yearMode ? active[0] : undefined}
            status={status}
          />

          {selection.crop !== 'todos' && rows[0] ? (
            <DecisionSummary crop={selection.crop} rows={rows} data={data} budget={budget} />
          ) : null}

          <h2 className="results-title">
            {ranking?.status === 'ranked' ? 'Ciclo completo, ordenado por sus prioridades' : 'Ciclo completo de tres campañas'}
          </h2>
          <ol className="rot-list">
            {ordered.map(({ row, rank }) => {
              const base = catalog.cases.find((c) => c.sequence_id === 'A' && c.crops[0] === row.kase.crops[0]);
              const required = row.agg.cycle.net_irrigation_required_mm.mean;
              const applied = row.agg.cycle.net_irrigation_applied_mm.mean;
              const baseRequired = base ? requiredOf(base.case_id) : null;
              const range = row.agg.assumptionRange.net_irrigation_required_mm;
              const selected = row.kase.case_id === selection.caseId;
              return (
                <li key={row.kase.case_id} className="rot-row" data-selected={selected || undefined}>
                  <div className="rot-head">
                    <RankBadge rank={rank} />
                    <h3>
                      <span className="case-id">{row.kase.case_id}</span>
                      <span className="case-seq">{caseLabel(row.kase.crops)}</span>
                    </h3>
                    <p className="case-note">
                      {SEQUENCE_NOTE[row.kase.sequence_id]}
                      {row.kase.baseline_status === 'scenario_not_producer_practice'
                        ? ' (escenario, no es la práctica del productor)'
                        : ' (escenario)'}
                    </p>
                  </div>
                  <Faja positions={row.water} scaleMax={scaleMax} />
                  <dl className="rot-kpis">
                    <div>
                      <dt>Agua de pozo</dt>
                      <dd>
                        {mm(applied)}
                        {applied ? <span> unos {m3ha(applied)}</span> : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Estrés hídrico</dt>
                      <dd>{days(row.agg.cycle.water_stress_days.mean)}</dd>
                    </div>
                    <div>
                      <dt>Sin cultivo</dt>
                      <dd>{days(row.agg.cycle.bare_days.mean)}</dd>
                    </div>
                    <div>
                      <dt>Helada</dt>
                      <dd>{days(row.agg.cycle.thermal_exposure_days.mean)}</dd>
                    </div>
                  </dl>
                  <p className="rot-cycle">
                    Requerimiento en tres campañas: {mm(required)}
                    {range ? ` (entre ${mm(range[0])} y ${mm(range[1])} con otros supuestos de suelo)` : ''}.{' '}
                    {base && base.case_id !== row.kase.case_id && required !== null && baseRequired != null
                      ? `Frente a la base candidata ${base.case_id}: ${signedMm(required - baseRequired)}. `
                      : base
                        ? ''
                        : 'Sin base candidata comparable: la secuencia A no incluye haba. '}
                    {row.agg.pass.denominator > 0
                      ? `Sin estrés en los cultivos con riego en ${row.agg.pass.numerator} de ${row.agg.pass.denominator} ${row.agg.pass.denominator === 1 ? 'ventana' : 'ventanas'}.`
                      : ''}
                  </p>
                  <button
                    type="button"
                    className="button-quiet"
                    aria-pressed={selected}
                    onClick={() => {
                      update({ caseId: row.kase.case_id });
                    }}
                  >
                    {selected ? `${row.kase.case_id} va en la ficha` : `Usar ${row.kase.case_id} en la ficha`}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <NineCaseTable data={data} selection={selection} update={update} budgetId={budgetId} />

      <NextStep to="suelo" onStep={onStep} />
    </>
  );
}

type RankInfo = { rank: number; score: number; tied: boolean } | { excluded: CriterionId[] };

function orderRows(rows: Row[], ranking: Ranking | null): { row: Row; rank: RankInfo | null }[] {
  if (!ranking || ranking.status === 'no_weights') return rows.map((row) => ({ row, rank: null }));
  const byId = new Map(rows.map((r) => [r.kase.case_id, r]));
  const ranked = ranking.ranked.flatMap((r) => {
    const row = byId.get(r.caseId);
    return row ? [{ row, rank: r }] : [];
  });
  const excluded = ranking.excluded.flatMap((e) => {
    const row = byId.get(e.caseId);
    return row ? [{ row, rank: { excluded: e.missing } }] : [];
  });
  return [...ranked, ...excluded];
}

function RankBadge({ rank }: { rank: RankInfo | null }) {
  if (!rank) return null;
  if ('excluded' in rank) {
    const labels = rank.excluded.map((id) => CRITERIA.find((c) => c.id === id)?.label ?? id);
    return (
      <p className="rank rank-out">
        Sin puntaje: no tiene dato para «{labels.join('», «')}», así que no se compara en esa prioridad
      </p>
    );
  }
  return (
    <p className="rank">
      <span className="rank-pos">{rank.rank}.º</span>
      <span>
        {rank.score} de 100{rank.tied ? ', empate' : ''}
      </span>
    </p>
  );
}

function SampleLine({
  nWindows,
  uniqueCampaigns,
  scenario,
  periodLabel,
  yearWindow,
  status,
}: {
  nWindows: number;
  uniqueCampaigns: number;
  scenario: string;
  periodLabel: string;
  yearWindow: { campaigns: string[]; oni_ndj: number } | undefined;
  status: ReturnType<typeof sampleStatus>;
}) {
  return (
    <div className="sample">
      {yearWindow ? (
        <p>
          Un año concreto: campañas {yearWindow.campaigns.join(', ')} (ONI {fmtOni(yearWindow.oni_ndj)}). Es un
          ejemplo; para comparar se usa el promedio de ventanas.
        </p>
      ) : (
        <p>
          <strong>
            n = {nWindows} {nWindows === 1 ? 'ventana' : 'ventanas'}
          </strong>{' '}
          de tres campañas con fase {scenario} en la primera ({periodLabel}), {uniqueCampaigns} campañas únicas. Las
          ventanas se solapan: no son observaciones independientes.
        </p>
      )}
      {status === 'empty' ? (
        <Notice tone="warn">
          No hay ventanas completas para esta combinación. Los valores quedan sin dato y no se ordena.
        </Notice>
      ) : status === 'insufficient' && !yearWindow ? (
        <Notice tone="warn">
          <Mark kind="insuficiente" /> con n = {nWindows}: los valores se muestran, pero sin conclusión ni orden.
          Pruebe «Todas las campañas».
        </Notice>
      ) : null}
    </div>
  );
}

function DecisionSummary({
  crop,
  rows,
  data,
  budget,
}: {
  crop: CropId;
  rows: Row[];
  data: Bundle;
  budget: WaterBudget | undefined;
}) {
  const first = rows[0];
  if (!first) return null;
  const d = first.agg.decision;
  const kind = waterKind(crop, data.catalog.crops);
  const same = rows.every((r) => {
    const a = r.agg.decision.water_stress_days.mean;
    const b = d.water_stress_days.mean;
    return a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-9);
  });
  const calendar = data.catalog.crops.find((c) => c.id === crop)?.calendar;
  const main = kind === 'riego' ? d.net_irrigation_required_mm : d.water_deficit_mm;
  return (
    <section className="decision" aria-labelledby="decision-titulo" data-crop={crop}>
      <h2 id="decision-titulo">
        Campaña de decisión: <CropTag crop={crop} />
      </h2>
      {kind === 'descanso' ? (
        <p>
          El descanso no tiene cultivo que regar: el suelo guarda parte de la lluvia para la campaña siguiente (solo
          se resta la evaporación; la maleza no está calculada).
        </p>
      ) : (
        <dl className="decision-figures">
          <div>
            <dt>{kind === 'riego' ? 'Riego neto requerido' : 'Déficit en secano'}</dt>
            <dd>
              <span className="figure-value">{mm(main.mean)}</span>
              {kind === 'riego' && main.mean !== null ? <span> unos {m3ha(main.mean)}</span> : null}
            </dd>
            <dd className="figure-range">
              Entre {mm(main.min)} y {mm(main.max)}, n = {main.n}
            </dd>
          </div>
          {kind === 'riego' ? (
            <div>
              <dt>Agua de pozo con el presupuesto</dt>
              <dd>
                {mm(d.net_irrigation_applied_mm.mean)} y {days(d.water_stress_days.mean)} de estrés
              </dd>
              <dd className="figure-range">{budget?.label}</dd>
            </div>
          ) : (
            <div>
              <dt>Estrés hídrico</dt>
              <dd>{days(d.water_stress_days.mean)}</dd>
            </div>
          )}
          <div>
            <dt>Lluvia aprovechable</dt>
            <dd>{mm(d.effective_rain_mm.mean)}</dd>
          </div>
          <div>
            <dt>Demanda del cultivo</dt>
            <dd>{mm(d.crop_demand_mm.mean)}</dd>
          </div>
          <div>
            <dt>Helada en el ciclo</dt>
            <dd>{days(d.thermal_exposure_days.mean)}</dd>
          </div>
        </dl>
      )}
      {calendar?.irrigation ? <p className="decision-note">Manejo según el productor: {calendar.irrigation}.</p> : null}
      {same && rows.length > 1 ? (
        <p className="insight">
          Los {rows.length} casos que empiezan con {CROP_NAME[crop].toLowerCase()} comparten esta campaña: mismo clima y
          mismo cálculo. Se diferencian en las campañas 2 y 3.
        </p>
      ) : null}
    </section>
  );
}

function BudgetChoice({
  budgets,
  value,
  update,
}: {
  budgets: WaterBudget[];
  value: string;
  update: (patch: Partial<Selection>) => void;
}) {
  const current = budgets.find((b) => b.id === value);
  return (
    <div className="budget">
      <Choice<string>
        legend="Agua de pozo por campaña (papa y haba)"
        name="presupuesto"
        value={value}
        onChange={(budget) => {
          update({ budget });
        }}
        options={budgets.map((b) => ({
          value: b.id,
          label: b.kind === 'requirement' ? 'Sin límite' : b.kind === 'rainfed' ? 'Secano' : `${b.per_campaign_mm ?? 0} mm`,
          hint: b.kind === 'requirement' ? 'requerimiento' : b.kind === 'rainfed' ? 'sin riego' : 'cupo hipotético',
        }))}
      />
      {current ? <p className="hint">{current.note} La quinua es de secano en todos los casos.</p> : null}
    </div>
  );
}

function YearSelect({ data, selection, update }: Omit<Props, 'onStep'>) {
  const id = useId();
  const windows = windowsFor(data.climate, selection.scenario, selection.period);
  return (
    <div className="field">
      <label htmlFor={id}>Año de referencia</label>
      <select
        id={id}
        value={selection.windowId}
        onChange={(e) => {
          update({ windowId: e.target.value });
        }}
      >
        <option value="mean">Promedio de {windows.length} ventanas</option>
        {windows.map((w) => (
          <option key={w.window_id} value={w.window_id}>
            {w.campaigns[0]} a {w.campaigns[2]}, ONI {fmtOni(w.oni_ndj)}
          </option>
        ))}
      </select>
    </div>
  );
}

const UNAVAILABLE = [
  { label: 'Helada en floración', reason: 'faltan fechas de floración; se usa todo el ciclo' },
  { label: 'Cobertura del descanso en porcentaje', reason: 'P6 no aporta un factor numérico' },
];

function Priorities({
  selection,
  update,
  ranking,
  canRank,
}: {
  selection: Selection;
  update: (patch: Partial<Selection>) => void;
  ranking: Ranking | null;
  canRank: boolean;
}) {
  const baseId = useId();
  return (
    <section className="priorities" aria-labelledby={`${baseId}-t`}>
      <h3 id={`${baseId}-t`}>Prioridades</h3>
      <p className="hint">De 0 (no importa) a 3 (muy importante). Reordenan el ciclo completo.</p>
      {CRITERIA.map((c) => (
        <div className="slider" key={c.id}>
          <label htmlFor={`${baseId}-${c.id}`}>
            {c.label}
            <output htmlFor={`${baseId}-${c.id}`}>{selection.weights[c.id]}</output>
          </label>
          <input
            id={`${baseId}-${c.id}`}
            type="range"
            min={0}
            max={3}
            step={1}
            value={selection.weights[c.id]}
            aria-valuetext={`${selection.weights[c.id]} de 3`}
            onChange={(e) => {
              update({ weights: { ...selection.weights, [c.id]: Number(e.target.value) } });
            }}
          />
        </div>
      ))}
      <ul className="unavailable">
        {UNAVAILABLE.map((u) => (
          <li key={u.label}>
            <span>{u.label}</span>
            <Mark kind="sin_dato">Sin dato: {u.reason}</Mark>
          </li>
        ))}
      </ul>
      <details className="method">
        <summary>Cómo se ordena</summary>
        <p>
          Cada prioridad usa el promedio del ciclo de tres campañas con el presupuesto elegido. Se normaliza entre el
          mejor y el peor caso mostrado (0 a 1; menos es mejor). El puntaje es el promedio ponderado por los pesos, de
          0 a 100. Si todos los casos tienen el mismo valor, ninguno gana puntos por esa prioridad. Un caso sin dato en
          una prioridad con peso queda sin puntaje: omitir un dato no lo mejora. Puntajes iguales comparten puesto; un
          empate es un resultado válido.
        </p>
      </details>
      {!canRank ? (
        <p className="hint">Sin orden: se necesita el promedio de al menos 3 ventanas.</p>
      ) : ranking?.status === 'no_weights' ? (
        <p className="hint">Todas las prioridades en 0: se muestra el orden del catálogo.</p>
      ) : ranking?.status === 'nothing_comparable' ? (
        <p className="hint">Ningún caso tiene datos para todas las prioridades elegidas.</p>
      ) : null}
    </section>
  );
}

const LEVEL_LABEL: Record<Level, string> = {
  decision_kpis: 'Campaña de decisión',
  cycle_kpis: 'Ciclo de tres campañas',
};

function NineCaseTable({ data, selection, update, budgetId }: Omit<Props, 'onStep'> & { budgetId: string }) {
  const [level, setLevel] = useState<Level>('decision_kpis');
  const windows = windowsFor(data.climate, selection.scenario, selection.period);
  const active = selection.windowId === 'mean' ? windows : windows.filter((w) => w.window_id === selection.windowId);
  const budgetLabel = data.catalog.water_budgets.find((b) => b.id === budgetId)?.label.toLowerCase() ?? budgetId;
  return (
    <section className="block" aria-labelledby="nueve-titulo">
      <h2 id="nueve-titulo">Los nueve casos en una tabla</h2>
      <Choice<Level>
        legend="Qué comparar"
        name="nivel"
        value={level}
        onChange={setLevel}
        options={[
          { value: 'decision_kpis', label: LEVEL_LABEL.decision_kpis },
          { value: 'cycle_kpis', label: LEVEL_LABEL.cycle_kpis },
        ]}
      />
      <div className="table-scroll">
        <table className="data-table" data-testid="nine-cases">
          <caption>
            {LEVEL_LABEL[level]}, fase {selection.scenario}, {PERIOD_LABEL[selection.period].toLowerCase()}, {budgetLabel}
            {selection.windowId !== 'mean' ? `, ventana ${selection.windowId}` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Caso</th>
              <th scope="col">Cultivo de decisión</th>
              <th scope="col">Riego requerido</th>
              <th scope="col">Agua de pozo</th>
              <th scope="col">Estrés hídrico</th>
              <th scope="col">Déficit</th>
              <th scope="col">Helada</th>
              <th scope="col">Muestra</th>
            </tr>
          </thead>
          <tbody>
            {data.catalog.cases.map((c) => {
              const agg = aggregateCase(data.results.records, c.case_id, active, budgetId);
              const k = level === 'decision_kpis' ? agg.decision : agg.cycle;
              const crop = c.crops[0];
              return (
                <tr key={c.case_id} data-selected={c.case_id === selection.caseId || undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="case-button"
                      aria-pressed={c.case_id === selection.caseId}
                      onClick={() => {
                        update({ caseId: c.case_id, crop: selection.crop === 'todos' ? 'todos' : (crop ?? 'papa') });
                      }}
                    >
                      {c.case_id}
                      <span>{caseLabel(c.crops)}</span>
                    </button>
                  </th>
                  <td>{crop ? CROP_NAME[crop] : 'sin dato'}</td>
                  <td className="num">{mm(k.net_irrigation_required_mm.mean)}</td>
                  <td className="num">{mm(k.net_irrigation_applied_mm.mean)}</td>
                  <td className="num">{days(k.water_stress_days.mean)}</td>
                  <td className="num">{mm(k.water_deficit_mm.mean)}</td>
                  <td className="num">{days(k.thermal_exposure_days.mean)}</td>
                  <td className="num">
                    {agg.nWindows} {agg.nWindows === 1 ? 'ventana' : 'ventanas'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="figure-note">
        «Sin dato» significa que el KPI no aplica a ese cultivo (por ejemplo, riego de la quinua de secano o agua del
        descanso). No equivale a cero. Balance diario FAO-56 simulado con datos NASA POWER; supuestos en Créditos.
      </p>
    </section>
  );
}
