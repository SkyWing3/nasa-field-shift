import { useRef, useState } from 'react';

import { aggregateCase, resultId, sampleStatus, waterByPosition, windowsFor } from '../analysis';
import { Faja, Mark, StepHeading } from '../components';
import { caseLabel, CROP_NAME, fmt0, fmt2, m3ha, mm, PERIOD_LABEL, SEQUENCE_NOTE } from '../format';
import type { Selection } from '../state';
import type { Bundle } from '../types';

interface Props {
  data: Bundle;
  selection: Selection;
}

const SOURCES = [
  'NASA POWER, API diaria, comunidad AG (reanálisis MERRA-2): lluvia, temperatura, viento, humedad y radiación desde 1981.',
  'NOAA CPC, índice ONI (oni.ascii.txt): fase Niño, Niña o Normal de cada campaña.',
  'FAO-56 (Allen et al. 1998): ET0, coeficientes y etapas de cultivo, balance diario de agua y evaporación del suelo.',
  'USDA NRCS: agua disponible por textura (genérica, no medida) y curva número de escorrentía (TR-55).',
  'Wischmeier y Smith (1978) y Fryrear et al. (1998): umbrales de lluvia erosiva y viento erosivo.',
  'NASADEM (NASA JPL): elevación del punto.',
  'Productor de Obrajes (comunicación personal, 14 de noviembre de 2026): calendario, riego y suelo.',
];

export function SheetStep({ data, selection }: Props) {
  const { catalog, climate, results, audio } = data;
  const kase = catalog.cases.find((c) => c.case_id === selection.caseId) ?? catalog.cases[0];
  const windows = windowsFor(climate, selection.scenario, selection.period);
  const active = selection.windowId === 'mean' ? windows : windows.filter((w) => w.window_id === selection.windowId);
  const budget = catalog.water_budgets.find((b) => b.id === selection.budget) ?? catalog.water_budgets[0];
  const budgetId = budget?.id ?? 'requerimiento';
  const id = kase
    ? resultId(catalog.build_id, kase.case_id, budgetId, selection.scenario, selection.period, selection.windowId)
    : '';
  const peers = kase ? catalog.cases.filter((c) => c.crops[0] === kase.crops[0]) : [];
  const status = sampleStatus(windows.length);
  const soil = catalog.soils.profiles[0];

  if (!kase) return null;

  const rows = peers.map((c) => {
    const agg = aggregateCase(results.records, c.case_id, active, budgetId);
    return { c, agg, water: waterByPosition(results.records, c, active, catalog.crops, budgetId) };
  });
  const scaleMax = Math.max(0, ...rows.flatMap((r) => r.water.map((p) => p.water.mean ?? 0)));
  const selectionText = `${kase.case_id} (${caseLabel(kase.crops)}), fase ${selection.scenario} en la campaña de decisión, ${PERIOD_LABEL[selection.period].toLowerCase()}, ${budget?.label.toLowerCase() ?? budgetId}, ${selection.windowId === 'mean' ? `promedio de ${active.length} ventanas` : `ventana ${selection.windowId}`}`;

  const plainText = [
    'RAÍZ — FICHA DE COMPARACIÓN',
    `${catalog.point.comunidad}, ${catalog.point.municipio}, ${catalog.point.departamento}. ${catalog.point.elevation_m.value} m.`,
    `Identificador de resultado: ${id}`,
    `Corrida: ${catalog.build_id}. Datos hasta ${catalog.data_as_of ?? 'sin dato'}. Modelo ${catalog.model_version ?? 'sin dato'}.`,
    '',
    `Selección: ${selectionText}.`,
    `Muestra: n = ${windows.length} ventanas${status === 'ok' ? '' : ' (muestra insuficiente: sin conclusión)'}.`,
    '',
    'Opciones que empiezan con el mismo cultivo (ciclo de tres campañas):',
    ...rows.map(
      (r) =>
        `- ${r.c.case_id} ${caseLabel(r.c.crops)} (${SEQUENCE_NOTE[r.c.sequence_id] ?? ''}): agua de pozo ${mm(r.agg.cycle.net_irrigation_applied_mm.mean)} (requerimiento ${mm(r.agg.cycle.net_irrigation_required_mm.mean)}), estrés hídrico ${fmt0(r.agg.cycle.water_stress_days.mean)} días, déficit ${mm(r.agg.cycle.water_deficit_mm.mean)}, ${fmt0(r.agg.cycle.bare_days.mean)} días sin cultivo, helada ${fmt0(r.agg.cycle.thermal_exposure_days.mean)} días. Sin estrés en cultivos con riego en ${r.agg.pass.numerator} de ${r.agg.pass.denominator} ventanas.`,
    ),
    '',
    `Suelo: ${soil?.texture_interpreted ?? 'sin dato'}; agua disponible ${fmt2(soil?.available_water_m_per_m[0])}–${fmt2(soil?.available_water_m_per_m[1])} m/m (genérico, no medido); profundidad sin dato.`,
    `Presupuesto de agua: ${budget?.label ?? budgetId}. ${budget?.note ?? ''} La quinua es de secano.`,
    `Reglas: ${climate.phase_rule} ${climate.campaign_rule}.`,
    '',
    'Fuentes:',
    ...SOURCES.map((s) => `- ${s}`),
    '',
    'Límites:',
    ...catalog.model_limits.map((l) => `- ${l}`),
    '',
    'Esta ficha compara escenarios con datos de campañas pasadas. No es una orden ni una promesa de cosecha.',
  ].join('\n');

  return (
    <>
      <StepHeading
        id="paso-ficha"
        title="Ficha y boletín"
        lead="La ficha resume la selección actual para imprimirla o enviarla. El boletín de radio es general para la región y no depende de la selección."
      />

      <div className="sheet-actions no-print">
        <button
          type="button"
          className="button-primary"
          onClick={() => {
            window.print();
          }}
        >
          Imprimir ficha
        </button>
        <DownloadText text={plainText} filename={`raiz-ficha-${kase.case_id}-${selection.scenario.replace(/\s/g, '-').toLowerCase()}.txt`} />
      </div>

      <article className="sheet" aria-labelledby="ficha-titulo">
        <header className="sheet-head">
          <p className="sheet-brand">Raíz</p>
          <h2 id="ficha-titulo">Ficha de comparación de rotaciones</h2>
          <p>
            {catalog.point.comunidad}, {catalog.point.municipio}, {catalog.point.departamento}.{' '}
            {catalog.point.elevation_m.value.toLocaleString('es-BO')} m.
          </p>
        </header>

        <dl className="sheet-meta">
          <div>
            <dt>Identificador de resultado</dt>
            <dd>
              <code>{id}</code>
            </dd>
          </div>
          <div>
            <dt>Datos hasta</dt>
            <dd>{catalog.data_as_of ?? 'sin dato'}</dd>
          </div>
          <div>
            <dt>Selección</dt>
            <dd>{selectionText}</dd>
          </div>
          <div>
            <dt>Muestra</dt>
            <dd>
              n = {windows.length} ventanas de tres campañas
              {status !== 'ok' ? (
                <>
                  {' '}
                  <Mark kind="insuficiente">Muestra insuficiente: sin conclusión</Mark>
                </>
              ) : null}
            </dd>
          </div>
        </dl>

        <h3>Opciones que empiezan con {CROP_NAME[kase.crops[0] ?? 'papa'].toLowerCase()}</h3>
        <ul className="sheet-options">
          {rows.map((r) => (
            <li key={r.c.case_id} data-selected={r.c.case_id === kase.case_id || undefined}>
              <p className="sheet-option-head">
                <strong>{r.c.case_id}</strong> {caseLabel(r.c.crops)}
                <span>{SEQUENCE_NOTE[r.c.sequence_id]}</span>
                {r.c.case_id === kase.case_id ? <span className="sheet-chosen">Selección</span> : null}
              </p>
              <Faja positions={r.water} scaleMax={scaleMax} />
              <p>
                Ciclo: {mm(r.agg.cycle.net_irrigation_applied_mm.mean)} de pozo
                {r.agg.cycle.net_irrigation_applied_mm.mean
                  ? ` (unos ${m3ha(r.agg.cycle.net_irrigation_applied_mm.mean)})`
                  : ''}
                , requerimiento {mm(r.agg.cycle.net_irrigation_required_mm.mean)},{' '}
                {fmt0(r.agg.cycle.water_stress_days.mean)} días de estrés, {fmt0(r.agg.cycle.bare_days.mean)} días sin
                cultivo, {fmt0(r.agg.cycle.thermal_exposure_days.mean)} días de helada. Sin estrés en cultivos con riego en{' '}
                {r.agg.pass.numerator} de {r.agg.pass.denominator} ventanas.
              </p>
            </li>
          ))}
        </ul>

        <div className="sheet-columns">
          <section>
            <h3>Suelo y agua</h3>
            <p>
              {soil?.texture_interpreted ?? 'Textura sin dato'}. Agua disponible {fmt2(soil?.available_water_m_per_m[0])} a{' '}
              {fmt2(soil?.available_water_m_per_m[1])} m/m, genérica, no medida. Profundidad sin dato.
            </p>
            <p>
              Presupuesto de agua: {budget?.label ?? budgetId}. {budget?.note} La quinua es de secano.
            </p>
            <h3>Reglas</h3>
            <p>
              {climate.phase_rule} {climate.campaign_rule}.
            </p>
          </section>
          <section>
            <h3>Fuentes</h3>
            <ul>
              {SOURCES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </div>
        <section>
          <h3>Límites</h3>
          <ul className="limits">
            {catalog.model_limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
        <p className="sheet-foot">
          Esta ficha compara escenarios con datos de campañas pasadas. No es una orden ni una promesa de cosecha.
          Converse con su técnico y su comunidad antes de decidir. Corrida {catalog.build_id}.
        </p>
      </article>

      <section className="block bulletin no-print" aria-labelledby="radio-title">
        <h2 id="radio-title">Boletín regional para radio</h2>
        <p className="measure">
          Mensaje general para las comunidades de Soracachi. No corresponde a la selección de la ficha ni a un
          identificador de resultado.
        </p>
        <p className="broadcast">
          {audio.distribution_status === 'prepared_not_broadcast' ? (
            <Mark kind="no_evaluado">Preparado; emisión por radio no confirmada</Mark>
          ) : (
            <Mark kind="evaluado">Estado: {audio.distribution_status}</Mark>
          )}
        </p>
        <div className="bulletin-pair">
          <div className="bulletin-lang" lang="qu">
            <h3 lang="es">Quechua</h3>
            {audio.quechua_mp3 ? <Player src={audio.quechua_mp3} name="boletín en quechua" /> : null}
            <p className="audio-credit" lang="es">
              Leído y grabado por un productor de la comunidad (sin nombre, con su autorización).
            </p>
            <blockquote>
              {audio.quechua_text
                .trim()
                .split('\n')
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
            </blockquote>
            <p lang="es">
              <a href="/raiz/audio/boletin_qu_productor.mp3" download>
                Descargar audio en quechua (MP3)
              </a>
            </p>
          </div>
          <div className="bulletin-lang">
            <h3>Español</h3>
            {audio.spanish_mp3 ? (
              <Player src={audio.spanish_mp3} name="boletín en español" />
            ) : (
              <p>
                <Mark kind="sin_dato">Audio en español no disponible en esta entrega</Mark>
              </p>
            )}
            <blockquote>
              {audio.spanish_text
                .trim()
                .split('\n')
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
            </blockquote>
            <p>
              <a href="/raiz/audio/boletin_es.txt" download>
                Descargar texto en español
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function DownloadText({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      type="button"
      className="button-secondary"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 0);
      }}
    >
      Descargar ficha en texto
    </button>
  );
}

/** Reproducción solo al pulsar; controles nativos como respaldo accesible. */
function Player({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="player">
      <button
        type="button"
        className="button-primary"
        aria-pressed={playing}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (playing) {
            el.pause();
            return;
          }
          el.play().catch(() => {
            setError(true);
          });
        }}
      >
        {playing ? `Pausar ${name}` : `Escuchar ${name}`}
      </button>
      <audio
        ref={ref}
        src={src}
        controls
        preload="none"
        aria-label={`Reproductor del ${name}`}
        onPlay={() => {
          setPlaying(true);
          setError(false);
        }}
        onPause={() => {
          setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
        }}
        onError={() => {
          setError(true);
        }}
      />
      {error ? (
        <p role="alert" lang="es">
          El audio no se pudo abrir. Lea el texto de abajo o descargue el MP3.
        </p>
      ) : null}
    </div>
  );
}
