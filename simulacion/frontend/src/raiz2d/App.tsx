import { useCallback, useEffect, useRef, useState } from 'react';

import { Shell } from './components';
import { loadBundle } from './data';
import { STEPS, useSelection, type Step } from './state';
import { ClimateStep } from './steps/ClimateStep';
import { CreditsPage } from './steps/CreditsPage';
import { RotationsStep } from './steps/RotationsStep';
import { SheetStep } from './steps/SheetStep';
import { SoilStep } from './steps/SoilStep';
import type { Bundle } from './types';
import './raiz2d.css';

const isCredits = () => new URLSearchParams(location.search).get('vista') === 'creditos';

export function App() {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selection, update] = useSelection(data);
  const lastStep = useRef<Step | null>(null);
  const credits = isCredits();

  useEffect(() => {
    const controller = new AbortController();
    loadBundle(controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudieron leer los datos.');
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  // Al cambiar de paso: volver arriba y llevar el foco al título (teclado y lectores de pantalla).
  useEffect(() => {
    if (!data) return;
    if (lastStep.current !== null && lastStep.current !== selection.step) {
      window.scrollTo({ top: 0 });
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    }
    lastStep.current = selection.step;
    const label = STEPS.find((s) => s.id === selection.step)?.label ?? 'Clima';
    document.title = credits ? 'Créditos y límites · Raíz' : `${label} · Raíz`;
  }, [selection.step, data, credits]);

  const onStep = useCallback(
    (step: Step) => {
      update({ step });
    },
    [update],
  );

  if (error) {
    return (
      <Shell step={null}>
        <div className="load-state" role="alert">
          <h1>No se pudieron cargar los archivos</h1>
          <p>{error}</p>
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          >
            Reintentar la carga
          </button>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell step={null}>
        <p className="load-state" role="status">
          Cargando los datos precalculados…
        </p>
      </Shell>
    );
  }

  const p = data.catalog.point;
  const place = `${p.comunidad}, ${p.municipio.split(' (')[0] ?? p.municipio} (${p.departamento})`;

  if (credits) {
    return (
      <Shell step={null} place={place}>
        <CreditsPage data={data} />
      </Shell>
    );
  }

  return (
    <Shell step={selection.step} onStep={onStep} place={place}>
      {selection.step === 'clima' ? (
        <ClimateStep data={data} selection={selection} update={update} onStep={onStep} />
      ) : selection.step === 'rotaciones' ? (
        <RotationsStep data={data} selection={selection} update={update} onStep={onStep} />
      ) : selection.step === 'suelo' ? (
        <SoilStep data={data} selection={selection} onStep={onStep} />
      ) : (
        <SheetStep data={data} selection={selection} />
      )}
    </Shell>
  );
}
