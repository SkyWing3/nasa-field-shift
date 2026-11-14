import { useMemo } from 'react';

import {
  REGION_LIMITS,
  REGION_PROBLEM_MESSAGES,
  type RegionPreset,
  validateRegion,
} from '../../geo';
import { regionMetrics } from '../../geo/metrics.ts';
import type { PlaceSearchProvider, PlaceSearchResult } from '../../place-search';
import type { RegionPatch, SiteDraft } from '../../state';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import styles from './Location.module.css';
import { NumberField } from './NumberField';
import { PlaceSearch } from './PlaceSearch';
import { RegionSummary } from './RegionSummary';

const SOURCE_LABELS: Readonly<Record<SiteDraft['source'], string>> = {
  preset: 'Región demostrativa',
  search: 'Resultado de búsqueda',
  map: 'Elegido en el mapa',
  drawn: 'Dibujado en el mapa',
  coordinates: 'Coordenadas escritas',
};

interface LocationPanelProps {
  readonly draft: SiteDraft | null;
  readonly searchProvider: PlaceSearchProvider;
  readonly presets: readonly RegionPreset[];
  readonly drawMode: boolean;
  readonly onSelectResult: (result: PlaceSearchResult) => void;
  readonly onApplyPreset: (preset: RegionPreset) => void;
  readonly onPatch: (patch: RegionPatch) => void;
  readonly onToggleDraw: () => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

export function LocationPanel({
  draft,
  searchProvider,
  presets,
  drawMode,
  onSelectResult,
  onApplyPreset,
  onPatch,
  onToggleDraw,
  onConfirm,
  onBack,
}: LocationPanelProps) {
  const region = draft?.region ?? null;
  const metrics = useMemo(() => (region === null ? null : regionMetrics(region)), [region]);
  const problems = region === null ? [] : validateRegion(region);

  return (
    <aside className={styles.panel} aria-label="Selección de ubicación">
      <header className={styles.panelHeader}>
        <Button variant="ghost" size="small" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="home" size={16} />
        </Button>
        <div>
          <h1 className={styles.panelTitle}>Ubicación de la granja</h1>
          <p className={styles.muted}>
            Elige un lugar real del planeta y delimita la zona de trabajo.
          </p>
        </div>
      </header>

      <PlaceSearch provider={searchProvider} onSelect={onSelectResult} />

      <section className={styles.section} aria-labelledby="presets-heading">
        <h2 id="presets-heading" className={styles.sectionTitle}>
          Región de referencia
        </h2>
        {presets.map((preset) => (
          <article key={preset.id} className={styles.preset} data-testid="region-preset">
            <div>
              <p className={styles.presetName}>{preset.name}</p>
              <p className={styles.subtle}>{preset.locality}</p>
            </div>
            <Button
              variant={draft?.presetId === preset.id ? 'secondary' : 'primary'}
              size="small"
              onClick={() => {
                onApplyPreset(preset);
              }}
            >
              {draft?.presetId === preset.id ? 'Seleccionada' : 'Usar'}
            </Button>
          </article>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="region-heading">
        <div className={styles.sectionHeader}>
          <h2 id="region-heading" className={styles.sectionTitle}>
            Zona de trabajo
          </h2>
          <Button
            variant={drawMode ? 'primary' : 'ghost'}
            size="small"
            aria-pressed={drawMode}
            onClick={onToggleDraw}
            data-testid="draw-toggle"
          >
            <Icon name="draw" size={14} />
            {drawMode ? 'Dibujando…' : 'Dibujar'}
          </Button>
        </div>

        {draft === null || region === null || metrics === null ? (
          <EmptyState icon="pin" title="Ninguna zona seleccionada">
            Haz clic en el mapa para colocar el centro, arrastra con «Dibujar» para trazar un
            rectángulo, busca un lugar o usa la región de referencia.
          </EmptyState>
        ) : (
          <>
            <p className={styles.sourceTag} data-testid="draft-source">
              <Icon name="pin" size={14} />
              {SOURCE_LABELS[draft.source]}
              {draft.source === 'search' ? ` · ${draft.name}` : ''}
            </p>
            {draft.presetId !== null ? (
              <p className={styles.disclaimer}>
                {presets.find((preset) => preset.id === draft.presetId)?.disclaimer}
              </p>
            ) : null}
            <div className={styles.fields}>
              <NumberField
                label="Ancho"
                value={region.widthM}
                unit="m"
                min={REGION_LIMITS.minSideM}
                max={REGION_LIMITS.maxSideM}
                onCommit={(widthM) => {
                  onPatch({ widthM });
                }}
                testId="region-width"
              />
              <NumberField
                label="Largo"
                value={region.lengthM}
                unit="m"
                min={REGION_LIMITS.minSideM}
                max={REGION_LIMITS.maxSideM}
                onCommit={(lengthM) => {
                  onPatch({ lengthM });
                }}
                testId="region-length"
              />
            </div>
            <label className={styles.slider}>
              <span>
                Orientación del lado largo
                <output>{Math.round(region.orientationDeg)}°</output>
              </span>
              <input
                type="range"
                min={0}
                max={179}
                step={1}
                value={Math.round(region.orientationDeg)}
                onChange={(event) => {
                  onPatch({ orientationDeg: Number(event.target.value) });
                }}
                data-testid="region-orientation-input"
              />
            </label>
            {problems.length > 0 ? (
              <ul className={styles.problems} role="alert" data-testid="region-problems">
                {problems.map((problem) => (
                  <li key={problem}>{REGION_PROBLEM_MESSAGES[problem]}</li>
                ))}
              </ul>
            ) : null}
            <RegionSummary metrics={metrics} center={region.center} />
          </>
        )}
      </section>

      <footer className={styles.panelFooter}>
        <Button
          variant="primary"
          size="large"
          disabled={draft === null || problems.length > 0}
          onClick={onConfirm}
          data-testid="confirm-location"
        >
          Confirmar ubicación
        </Button>
      </footer>
    </aside>
  );
}
