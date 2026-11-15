import {
  aggregateCase,
  coverCalendar,
  sampleStatus,
  windowsFor,
  type CaseAggregate,
  type CoverCell,
  type CoverState,
} from '../analysis';
import { Mark, NextStep, StepHeading, type MarkKind } from '../components';
import { caseLabel, CROP_NAME, fmt, fmt0, fmt2, mm, PERIOD_LABEL } from '../format';
import type { Selection, Step } from '../state';
import type { Assumption, Bundle, Case } from '../types';

interface Props {
  data: Bundle;
  selection: Selection;
  onStep: (step: Step) => void;
}

const MONTH_INITIAL: Record<number, string> = {
  1: 'E', 2: 'F', 3: 'M', 4: 'A', 5: 'M', 6: 'J', 7: 'J', 8: 'A', 9: 'S', 10: 'O', 11: 'N', 12: 'D',
};
const MONTH_NAME: Record<number, string> = {
  1: 'enero', 2: 'febrero', 3: 'marzo', 4: 'abril', 5: 'mayo', 6: 'junio',
  7: 'julio', 8: 'agosto', 9: 'septiembre', 10: 'octubre', 11: 'noviembre', 12: 'diciembre',
};

const STATE_LABEL: Record<CoverState, string> = {
  siembra: 'Ventana de siembra',
  cultivo: 'Cultivo en el campo',
  cosecha: 'Ventana de cosecha',
  descanso: 'Descanso con maleza pastoreada',
  sin_cultivo: 'Sin cultivo planificado',
};

const assumption = (list: readonly Assumption[], source: string) => list.find((a) => a.source === source);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SoilStep({ data, selection, onStep }: Props) {
  const { catalog, climate, results } = data;
  const shown = catalog.cases.filter((c) => selection.crop === 'todos' || c.crops[0] === selection.crop);
  const windows = windowsFor(climate, selection.scenario, selection.period);
  const budgetId = selection.budget;
  const agg = aggregateCase(results.records, selection.caseId, windows, budgetId);
  const status = sampleStatus(agg.nWindows);
  const soil = catalog.soils.profiles[0];
  const [awcLow, awcHigh] = soil?.available_water_m_per_m ?? [null, null];
  const worstClosure = Math.max(...results.records.map((r) => Math.abs(r.balance.closure_mm)));
  const rainThreshold = assumption(catalog.assumptions, 'assumption_heavy_rain_threshold');
  const windThreshold = assumption(catalog.assumptions, 'assumption_wind_threshold');
  const range = agg.assumptionRange.net_irrigation_required_mm;
  const depthValue = assumption(catalog.assumptions, 'assumption_control_depth_common')?.value;
  const controlDepth = typeof depthValue === 'string' ? depthValue : 'Profundidad de control sin dato';
  const waterKind: MarkKind = status === 'ok' ? 'supuesto' : status === 'insufficient' ? 'insuficiente' : 'sin_dato';

  const evidence: { label: string; kind: MarkKind; detail: string }[] = [
    {
      label: 'Balance de agua: riego, estrés y déficit',
      kind: waterKind,
      detail: `Balance diario FAO-56 con datos NASA POWER: ${agg.nWindows} ventanas y ${agg.nUniqueCampaigns} campañas únicas para ${selection.caseId}, fase ${selection.scenario}, ${PERIOD_LABEL[selection.period].toLowerCase()}. El agua cierra en todas las corridas (error máximo ${fmt2(worstClosure)} mm). Simulado, no medido.`,
    },
    {
      label: 'Efecto de los supuestos de suelo',
      kind: range ? 'supuesto' : 'sin_dato',
      detail: range
        ? `Con suelo más somero y seco o más profundo y húmedo, el riego requerido de ${selection.caseId} va de ${mm(range[0])} a ${mm(range[1])} en tres campañas. Es el efecto de esos supuestos, no toda la incertidumbre.`
        : 'Sin ventanas para comparar supuestos.',
    },
    {
      label: 'Fase de cada campaña',
      kind: 'evaluado',
      detail: `NOAA ONI. ${climate.phase_rule}`,
    },
    {
      label: 'Helada en el ciclo',
      kind: 'supuesto',
      detail: 'Días con Tmin del aire a 2 m bajo el umbral de la etapa sensible (P6) en todo el ciclo. Mide exposición, no daño.',
    },
    {
      label: 'Helada en floración',
      kind: 'sin_dato',
      detail: 'Sin fechas de floración aportadas: no se aísla esa etapa.',
    },
    {
      label: 'Suelo descubierto con lluvia intensa o viento',
      kind: 'supuesto',
      detail: `Días sin cultivo planificado con lluvia ≥ ${fmt(rainThreshold?.value as number | undefined)} mm (${rainThreshold?.reference ?? 'sin referencia'}) o viento medio ≥ ${fmt(windThreshold?.value as number | undefined)} m/s (${windThreshold?.reference ?? 'sin referencia'}). Umbrales de la literatura, pendientes de revisión de P6. No son toneladas de erosión.`,
    },
    {
      label: 'Cobertura del descanso en porcentaje',
      kind: 'sin_dato',
      detail: 'P6 no aporta un factor numérico: el descanso se cuenta aparte, como cobertura parcial.',
    },
    {
      label: 'Segunda fuente de lluvia (sensibilidad)',
      kind: 'no_evaluado',
      detail: `CHIRPS se intentó y quedó ${catalog.chirps_status === 'unavailable' ? 'no disponible' : catalog.chirps_status}: serie incompleta. Se muestra una sola fuente.`,
    },
    {
      label: 'Granizo',
      kind: 'no_evaluado',
      detail: 'No se mide con estos datos.',
    },
  ];
  const counts = evidence.reduce<Record<MarkKind, number>>(
    (acc, e) => ({ ...acc, [e.kind]: acc[e.kind] + 1 }),
    { evaluado: 0, supuesto: 0, insuficiente: 0, sin_dato: 0, no_evaluado: 0 },
  );

  return (
    <>
      <StepHeading
        id="paso-suelo"
        title="Suelo y confianza"
        lead="Cuándo queda el suelo con cultivo, en descanso o sin cultivo, cuántos de esos días coinciden con lluvia fuerte o viento, y qué tan sólida es cada parte del análisis."
      />

      <section className="block" aria-labelledby="calendario-titulo">
        <h2 id="calendario-titulo">Calendario de cobertura planificada</h2>
        <p className="measure">
          El calendario por meses viene del productor de {catalog.point.comunidad}. Las cifras de cada fila vienen del
          balance, que usa del 1 de octubre al 15 de abril como ciclo de cultivo (supuesto). Promedio de{' '}
          {agg.nWindows} ventanas, fase {selection.scenario}.
        </p>
        <CoverLegend />
        <div className="cover-grid">
          <div className="cover-head" aria-hidden="true">
            <span>Campaña 1, jul–jun</span>
            <span>Campaña 2</span>
            <span>Campaña 3</span>
          </div>
          {shown.map((c) => (
            <CoverRow
              key={c.case_id}
              kase={c}
              cells={coverCalendar(c, catalog.crops)}
              selected={c.case_id === selection.caseId}
              figures={aggregateCase(results.records, c.case_id, windows, budgetId)}
            />
          ))}
        </div>
        <p className="figure-note">
          Haba: hortalizas sembradas junto quedan solo como contexto. El descanso no se cuenta como suelo descubierto.
        </p>
      </section>

      <section className="block" aria-labelledby="evidencia-titulo">
        <h2 id="evidencia-titulo">Calidad de la evidencia</h2>
        <p className="tally">
          {counts.evaluado ? <Mark kind="evaluado">{plural(counts.evaluado, 'evaluado', 'evaluados')}</Mark> : null}
          {counts.supuesto ? <Mark kind="supuesto">{counts.supuesto} con supuestos</Mark> : null}
          {counts.insuficiente ? <Mark kind="insuficiente">{counts.insuficiente} con muestra insuficiente</Mark> : null}
          {counts.sin_dato ? <Mark kind="sin_dato">{counts.sin_dato} sin dato</Mark> : null}
          {counts.no_evaluado ? (
            <Mark kind="no_evaluado">{plural(counts.no_evaluado, 'no evaluado', 'no evaluados')}</Mark>
          ) : null}
        </p>
        <ul className="evidence-list">
          {evidence.map((e) => (
            <li key={e.label}>
              <h3>{e.label}</h3>
              <Mark kind={e.kind} />
              <p>{e.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="block soil-facts" aria-labelledby="suelo-titulo">
        <h2 id="suelo-titulo">El punto y el suelo</h2>
        <dl className="facts">
          <div>
            <dt>Punto de datos</dt>
            <dd>
              {catalog.point.comunidad}, {catalog.point.municipio}. Coordenadas públicas redondeadas a{' '}
              {catalog.point.coordinate_precision_deg.toLocaleString('es-BO')}°. El clima viene de una celda regional de unos 50 km.
            </dd>
          </div>
          <div>
            <dt>Elevación</dt>
            <dd>{catalog.point.elevation_m.value.toLocaleString('es-BO')} m, NASADEM (NASA JPL).</dd>
          </div>
          <div>
            <dt>Textura</dt>
            <dd>
              {soil?.farmer_description ?? 'sin dato'}. Interpretación: {soil?.texture_interpreted ?? 'sin dato'}.
            </dd>
          </div>
          <div>
            <dt>Agua disponible</dt>
            <dd>
              {fmt2(awcLow)} a {fmt2(awcHigh)} m por metro de suelo: rango genérico NRCS por textura, no medido.{' '}
              {controlDepth}.
            </dd>
          </div>
          <div>
            <dt>Profundidad efectiva</dt>
            <dd>{soil?.effective_depth_cm == null ? 'Sin dato medido.' : `${soil.effective_depth_cm} cm.`}</dd>
          </div>
          <div>
            <dt>Ventanas excluidas</dt>
            <dd>
              <ul className="plain-list">
                {groupExclusions(climate.exclusions).map((g) => (
                  <li key={g.reason}>
                    {g.years.join(', ')}: {g.reason}.
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
        <h3>Límites del cálculo</h3>
        <ul className="limits">
          {catalog.model_limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <NextStep to="ficha" onStep={onStep} />
    </>
  );
}

function groupExclusions(list: readonly { year: number; reason: string }[]) {
  const groups: { reason: string; years: number[] }[] = [];
  for (const e of list) {
    const g = groups.find((x) => x.reason === e.reason);
    if (g) g.years.push(e.year);
    else groups.push({ reason: e.reason, years: [e.year] });
  }
  return groups;
}

function CoverLegend() {
  const states: CoverState[] = ['siembra', 'cultivo', 'cosecha', 'descanso', 'sin_cultivo'];
  return (
    <ul className="cover-legend" aria-label="Leyenda del calendario">
      {states.map((s) => (
        <li key={s}>
          <span className="cover-cell" data-state={s} data-crop={s === 'descanso' ? 'descanso' : s === 'sin_cultivo' ? undefined : 'papa'} aria-hidden="true" />
          {STATE_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

function describe(cells: CoverCell[], kase: Case) {
  return kase.crops
    .map((crop, i) => {
      const own = cells.filter((c) => c.campaign === i);
      const runs: string[] = [];
      let start = 0;
      for (let k = 1; k <= own.length; k++) {
        if (k === own.length || own[k]?.state !== own[start]?.state) {
          const a = own[start];
          const b = own[k - 1];
          if (a && b) {
            const span = a === b ? MONTH_NAME[a.month] : `${MONTH_NAME[a.month]} a ${MONTH_NAME[b.month]}`;
            runs.push(`${span}: ${STATE_LABEL[a.state].toLowerCase()}`);
          }
          start = k;
        }
      }
      return `Campaña ${i + 1}, ${CROP_NAME[crop]}: ${runs.join('; ')}.`;
    })
    .join(' ');
}

function CoverRow({
  kase,
  cells,
  selected,
  figures,
}: {
  kase: Case;
  cells: CoverCell[];
  selected: boolean;
  figures: CaseAggregate;
}) {
  const c = figures.cycle;
  return (
    <div className="cover-row" data-selected={selected || undefined}>
      <p className="cover-label">
        <span className="case-id">{kase.case_id}</span> {caseLabel(kase.crops)}
      </p>
      <p className="cover-figures">
        {fmt0(c.coverage_pct.mean)} % con cultivo, {fmt0(c.partial_cover_pct.mean)} % en descanso,{' '}
        {fmt0(c.bare_days.mean)} días sin cultivo: {fmt0(c.bare_rain_exposure_days.mean)} con lluvia fuerte y{' '}
        {fmt0(c.bare_wind_exposure_days.mean)} con viento fuerte
      </p>
      <div className="cover-strip" aria-hidden="true">
        {[0, 1, 2].map((campaign) => (
          <div className="cover-campaign" key={campaign}>
            {cells
              .filter((cell) => cell.campaign === campaign)
              .map((cell, i) => (
                <span
                  key={i}
                  className="cover-cell"
                  data-state={cell.state}
                  data-crop={cell.crop ?? undefined}
                  title={`${MONTH_NAME[cell.month]}: ${STATE_LABEL[cell.state]}`}
                >
                  <span className="cover-month">{MONTH_INITIAL[cell.month]}</span>
                </span>
              ))}
          </div>
        ))}
      </div>
      <p className="visually-hidden">{describe(cells, kase)}</p>
    </div>
  );
}
