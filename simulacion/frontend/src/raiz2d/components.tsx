import type { ReactNode } from 'react';

import type { PositionWater } from './analysis';
import { CROP_NAME, fmt0, mm } from './format';
import { STEPS, type Step } from './state';
import type { CropId } from './types';

// ---------------------------------------------------------------- estructura

interface ShellProps {
  step: Step | null;
  onStep?: (step: Step) => void;
  place?: string;
  children: ReactNode;
}

export function Shell({ step, onStep, place, children }: ShellProps) {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="masthead no-print">
        <a className="wordmark" href="/">
          Raíz
        </a>
        <p className="masthead-place">{place ?? 'Obrajes, Soracachi (Oruro)'}</p>
        <a className="masthead-link" href="/?vista=creditos">
          Créditos y límites
        </a>
      </header>
      <div className="sticky-bar no-print">
        {step ? <StepNav current={step} onStep={onStep} /> : null}
        <p className="regional-banner">
          Datos regionales (celda NASA POWER de ~50 km), no mediciones de la parcela
        </p>
      </div>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer no-print">
        <p>Raíz, NASA Space Apps Challenge 2026. Campañas de decisión con datos NASA POWER y NOAA ONI.</p>
        <nav aria-label="Archivos y créditos">
          <a href="/?vista=creditos">Fuentes y uso de IA</a>
          <a href="/raiz/data/manifest.json" download>
            Descargar manifiesto
          </a>
        </nav>
      </footer>
    </>
  );
}

function StepNav({ current, onStep }: { current: Step; onStep: ((step: Step) => void) | undefined }) {
  return (
    <nav className="step-nav" aria-label="Pasos del recorrido">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`?paso=${s.id}`}
              aria-current={s.id === current ? 'step' : undefined}
              onClick={(e) => {
                if (!onStep || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                onStep(s.id);
              }}
            >
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="step-label-long">{s.label}</span>
              <span className="step-label-short" aria-hidden="true">
                {s.short}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StepHeading({ id, title, lead }: { id: string; title: string; lead?: ReactNode }) {
  return (
    <div className="step-heading">
      <h1 id={id} tabIndex={-1}>
        {title}
      </h1>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}

export function NextStep({ to, onStep }: { to: Step; onStep: (s: Step) => void }) {
  const target = STEPS.find((s) => s.id === to);
  if (!target) return null;
  const index = STEPS.indexOf(target) + 1;
  return (
    <div className="next-step no-print">
      <button type="button" className="button-primary" onClick={() => { onStep(to); }}>
        Seguir al paso {index}: {target.label}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- controles

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  crop?: CropId;
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'segmented' | 'chips';
}

/** Grupo de opciones con radios nativos: teclado con flechas, etiquetas y foco visibles. */
export function Choice<T extends string>({ legend, name, options, value, onChange, variant = 'segmented' }: ChoiceProps<T>) {
  return (
    <fieldset className={`choice choice-${variant}`}>
      <legend>{legend}</legend>
      <div className="choice-options">
        {options.map((o) => (
          <label key={o.value} className="choice-option" data-crop={o.crop}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => {
                onChange(o.value);
              }}
            />
            <span className="choice-face">
              {o.crop ? <span className="swatch" aria-hidden="true" /> : null}
              <span className="choice-label">{o.label}</span>
              {o.hint ? <span className="choice-hint">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- cultivo y faja

export function CropTag({ crop }: { crop: CropId }) {
  return (
    <span className="crop-tag" data-crop={crop}>
      <span className="swatch" aria-hidden="true" />
      {CROP_NAME[crop]}
    </span>
  );
}

const waterText = (p: PositionWater) => {
  if (p.kind === 'descanso') return 'Descanso: sin cultivo que regar';
  if (p.water.mean === null) return 'Sin dato';
  const stress = p.stressDays.mean ?? 0;
  const stressText = stress >= 0.5 ? `, ${fmt0(stress)} días de estrés` : '';
  return p.kind === 'riego'
    ? `${mm(p.water.mean)} de pozo${stressText}`
    : `Secano: ${mm(p.water.mean)} de déficit${stressText}`;
};

/**
 * Faja de rotación: las tres campañas de una secuencia con el agua de cada una.
 * La barra inferior compara el agua contra `scaleMax` (máximo entre los casos mostrados).
 */
export function Faja({ positions, scaleMax, compact = false }: { positions: PositionWater[]; scaleMax: number; compact?: boolean }) {
  return (
    <ol className={`faja${compact ? ' faja-compact' : ''}`} aria-label="Campañas de la secuencia">
      {positions.map((p) => {
        const share = p.water.mean !== null && scaleMax > 0 ? Math.max(2, (p.water.mean / scaleMax) * 100) : 0;
        return (
          <li key={p.position} className="faja-seg" data-crop={p.crop}>
            <span className="faja-band">
              <span className="faja-campaign">Campaña {p.position + 1}</span>
              <span className="faja-crop">{CROP_NAME[p.crop]}</span>
            </span>
            {compact ? null : (
              <span className="faja-water" data-kind={p.kind}>
                <span className="faja-water-text">{waterText(p)}</span>
                <span className="water-track" aria-hidden="true">
                  <span className="water-fill" style={{ width: `${share}%` }} />
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- estados

export type MarkKind = 'evaluado' | 'supuesto' | 'sin_dato' | 'no_evaluado' | 'insuficiente';

const MARK_TEXT: Record<MarkKind, string> = {
  evaluado: 'Evaluado',
  supuesto: 'Evaluado con supuestos',
  sin_dato: 'Sin dato',
  no_evaluado: 'No evaluado',
  insuficiente: 'Muestra insuficiente',
};

/** Semáforo con forma y texto: el color nunca es la única señal. */
export function Mark({ kind, children }: { kind: MarkKind; children?: ReactNode }) {
  return (
    <span className="mark" data-kind={kind}>
      <span className="mark-glyph" aria-hidden="true" />
      {children ?? MARK_TEXT[kind]}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className="notice" data-tone={tone} role={tone === 'warn' ? 'status' : undefined}>
      {children}
    </div>
  );
}
