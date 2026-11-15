import { useMemo } from 'react';

import { climateByPeriod, matchesScenario, parseCampaigns, periodOfYear, type Campaign } from '../analysis';
import { NextStep, Notice, StepHeading } from '../components';
import { useWidth } from '../hooks';
import { fmtOni, mm, PERIOD_LABEL, signedMm } from '../format';
import { ScenarioControls } from '../ScenarioControls';
import type { Selection, Step } from '../state';
import type { Bundle, PeriodId, Scenario } from '../types';

interface Props {
  data: Bundle;
  selection: Selection;
  update: (patch: Partial<Selection>) => void;
  onStep: (step: Step) => void;
}

export function ClimateStep({ data, selection, update, onStep }: Props) {
  const campaigns = useMemo(() => parseCampaigns(data.climate.campaigns), [data]);
  const periods = climateByPeriod(campaigns, selection.scenario);
  const ref = data.climate.four_of_five.normal_reference_mm;
  const strong = campaigns.filter((c) => c.strong && c.included);
  const strongBelow = strong.filter((c) => c.rainMm !== null && c.rainMm < ref);
  const [historical, recent] = periods;
  const included = campaigns.filter((c) => c.included);
  const minRain = Math.min(...included.map((c) => c.rainMm ?? Infinity));
  const maxRain = Math.max(...included.map((c) => c.rainMm ?? -Infinity));
  const point = data.catalog.point;

  return (
    <>
      <StepHeading
        id="paso-clima"
        title="Rotar con evidencia. Proteger agua y suelo."
        lead={
          <>
            Raíz compara tres rotaciones de papa, quinua, haba y descanso para {point.comunidad}, en{' '}
            {point.municipio.split(' (')[0]} ({point.departamento}), a{' '}
            {point.elevation_m.value.toLocaleString('es-BO')} m de altura. Usa {included.length} campañas de lluvia de la NASA y muestra agua, cobertura y límites. La
            decisión es del productor y su técnico.
          </>
        }
      />

      <aside className="outlook">
        <p>
          NOAA considera probable un Niño de fuerte a muy fuerte hasta enero–marzo de 2027 (discusión del 12 de
          noviembre de 2026). Raíz no pronostica: muestra qué pasó en campañas pasadas con la misma fase.{' '}
          <a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml">
            Leer la discusión de NOAA
          </a>
        </p>
      </aside>

      <ScenarioControls selection={selection} update={update} />

      <section className="block" aria-labelledby="lluvia-titulo">
        <h2 id="lluvia-titulo">Lluvia de noviembre a marzo, campaña por campaña</h2>
        <RainChart campaigns={included} scenario={selection.scenario} period={selection.period} normalMm={ref} />
        <p className="figure-note">
          NASA POWER, reanálisis MERRA-2 en una celda de unos 50 km. Lluvia acumulada del 1 de noviembre al 31 de
          marzo, en milímetros. {data.climate.campaign_rule}. Fases según {data.climate.phase_rule}
        </p>
        <CampaignTable campaigns={included} normalMm={ref} />
      </section>

      <section className="block" aria-labelledby="periodos-titulo">
        <h2 id="periodos-titulo">Antes y ahora</h2>
        <p className="measure">
          Se compara la lluvia promedio por campaña de cada periodo, no totales de periodos de distinta longitud.
          Este eje es independiente del escenario El Niño o La Niña.
        </p>
        <div className="period-pair">
          {periods.map((p) => (
            <article key={p.period} className="period" data-active={selection.period === p.period || undefined}>
              <h3>{PERIOD_LABEL[p.period]}</h3>
              <p className="period-figure">
                <span className="figure-value">{mm(p.rain.mean)}</span> por campaña en promedio
              </p>
              <p>
                {p.rain.n} campañas, entre {mm(p.rain.min)} y {mm(p.rain.max)}.
              </p>
              <p>
                {p.scenario.n === 0
                  ? `Ninguna campaña ${selection.scenario} en este periodo.`
                  : `${p.scenario.n} ${p.scenario.n === 1 ? 'campaña' : 'campañas'} ${selection.scenario}: ${mm(p.scenario.mean)} en promedio.`}
              </p>
            </article>
          ))}
        </div>
        {historical && recent && historical.rain.mean !== null && recent.rain.mean !== null ? (
          <p className="measure">
            La diferencia entre periodos es de {signedMm(recent.rain.mean - historical.rain.mean)} por campaña. La
            lluvia de una sola campaña varía entre {mm(minRain)} y {mm(maxRain)}, así que esta diferencia no
            demuestra una tendencia ni indica su causa.
          </p>
        ) : null}
      </section>

      <section className="block evidence-fact" aria-labelledby="ninofuerte-titulo">
        <h2 id="ninofuerte-titulo">
          {strongBelow.length} de {strong.length} campañas con Niño fuerte tuvieron menos lluvia que una campaña
          Normal
        </h2>
        <ol className="strong-list">
          {strong.map((c) => (
            <li key={c.id}>
              <span className="strong-year">{c.id}</span>
              <span>
                {mm(c.rainMm)}, ONI {fmtOni(c.oni)}
              </span>
              <span className="strong-verdict" data-below={c.rainMm !== null && c.rainMm < ref}>
                {c.rainMm !== null && c.rainMm < ref ? 'Menos que el promedio Normal' : 'Más que el promedio Normal'}
              </span>
            </li>
          ))}
        </ol>
        <Notice>
          Es una frecuencia histórica con n = {strong.length}, no una probabilidad ni un pronóstico. Promedio Normal:{' '}
          {mm(ref)}, de {data.climate.four_of_five.normal_campaign_count} campañas. Cálculo reproducido por Dev 1 y
          confirmado por P6. El granizo no se mide con estos datos.
        </Notice>
      </section>

      <NextStep to="rotaciones" onStep={onStep} />
    </>
  );
}

// ---------------------------------------------------------------- gráfica

interface ChartProps {
  campaigns: Campaign[];
  scenario: Scenario;
  period: PeriodId;
  normalMm: number;
}

function RainChart({ campaigns, scenario, period, normalMm }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width < 560;
  const height = narrow ? 230 : 290;
  const m = { top: 30, right: 6, bottom: 26, left: narrow ? 34 : 42 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const maxRain = Math.max(normalMm, ...campaigns.map((c) => c.rainMm ?? 0));
  const yMax = Math.ceil(maxRain / 100) * 100;
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;
  const band = campaigns.length ? innerW / campaigns.length : 0;
  const barW = Math.max(2, band * 0.7);
  const x = (i: number) => m.left + i * band + (band - barW) / 2;
  const splitIndex = campaigns.findIndex((c) => periodOfYear(c.startYear) === 'recent');
  const splitX = m.left + splitIndex * band;
  const highlighted = campaigns.filter((c) => matchesScenario(c.phase, c.oni, scenario));
  const step = narrow ? 10 : 5;
  const ticks = Array.from({ length: yMax / 100 + 1 }, (_, i) => i * 100).filter((t) => !narrow || t % 200 === 0);

  return (
    <figure className="rain-figure">
      <div ref={ref} className="rain-chart">
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Barras de lluvia nov–mar de ${campaigns.length} campañas. ${highlighted.length} campañas ${scenario} resaltadas. Línea de promedio Normal en ${Math.round(normalMm)} mm. La tabla siguiente contiene los mismos datos.`}
          >
            {ticks.map((t) => (
              <g key={t} className="grid">
                <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
                <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            <text className="axis-unit" x={m.left - 6} y={m.top - 14} textAnchor="end">
              mm
            </text>
            {splitIndex > 0 ? (
              <g className="period-split">
                {period !== 'all' ? (
                  <rect
                    className="period-dim"
                    x={period === 'historical' ? splitX : m.left}
                    width={period === 'historical' ? width - m.right - splitX : splitX - m.left}
                    y={m.top}
                    height={innerH}
                  />
                ) : null}
                <line x1={splitX} x2={splitX} y1={m.top - 18} y2={m.top + innerH} />
                <text x={(m.left + splitX) / 2} y={m.top - 16} textAnchor="middle">
                  1981–2000
                </text>
                <text x={(splitX + width - m.right) / 2} y={m.top - 16} textAnchor="middle">
                  2001–2025
                </text>
              </g>
            ) : null}
            {campaigns.map((c, i) => {
              const rain = c.rainMm ?? 0;
              const on = matchesScenario(c.phase, c.oni, scenario);
              const outside = period !== 'all' && periodOfYear(c.startYear) !== period;
              return (
                <g key={c.id} className="bar" data-on={on || undefined} data-outside={outside || undefined}>
                  <rect x={x(i)} y={y(rain)} width={barW} height={Math.max(0, y(0) - y(rain))}>
                    <title>{`${c.id}: ${mm(c.rainMm)}, ${c.phase ?? 'sin fase'}, ONI ${fmtOni(c.oni)}`}</title>
                  </rect>
                  {c.strong ? (
                    <path
                      className="strong-marker"
                      d={`M${x(i) + barW / 2} ${y(rain) - 9} l4.5 7 h-9 z`}
                    />
                  ) : null}
                </g>
              );
            })}
            <g className="normal-line">
              <line x1={m.left} x2={width - m.right} y1={y(normalMm)} y2={y(normalMm)} />
            </g>
            {campaigns.map((c, i) =>
              c.startYear % step === 0 ? (
                <text key={c.id} className="x-label" x={x(i) + barW / 2} y={height - 8} textAnchor="middle">
                  {c.startYear}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
      </div>
      <figcaption className="legend">
        <span className="legend-item">
          <span className="legend-swatch legend-on" aria-hidden="true" />
          Campañas {scenario} ({highlighted.length})
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-off" aria-hidden="true" />
          Otras campañas
        </span>
        <span className="legend-item">
          <span className="legend-line" aria-hidden="true" />
          Promedio de campañas Normales, {mm(normalMm)}
        </span>
        <span className="legend-item">
          <span className="legend-triangle" aria-hidden="true" />
          Niño fuerte (ONI ≥ 1,5)
        </span>
      </figcaption>
    </figure>
  );
}

function CampaignTable({ campaigns, normalMm }: { campaigns: Campaign[]; normalMm: number }) {
  return (
    <details className="data-details">
      <summary>Ver la tabla de las {campaigns.length} campañas</summary>
      <div className="table-scroll">
        <table className="data-table">
          <caption>Lluvia nov–mar por campaña, fase ONI NDJ y diferencia con el promedio Normal</caption>
          <thead>
            <tr>
              <th scope="col">Campaña</th>
              <th scope="col">Fase</th>
              <th scope="col">ONI NDJ</th>
              <th scope="col">Lluvia</th>
              <th scope="col">Frente al promedio Normal</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.id}</th>
                <td>
                  {c.phase ?? 'sin dato'}
                  {c.strong ? ' fuerte' : ''}
                </td>
                <td className="num">{fmtOni(c.oni)}</td>
                <td className="num">{mm(c.rainMm)}</td>
                <td className="num">{c.rainMm === null ? 'sin dato' : signedMm(c.rainMm - normalMm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
