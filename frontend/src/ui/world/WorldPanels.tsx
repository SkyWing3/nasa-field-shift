import { formatDegrees } from '../../geo';
import type { DatasetMeta } from '../../simulation-client';
import type { RenderStats, StageState, TerrainSelection, WorldError } from '../../state/worldStore';
import type { GeneratedWorld } from '../../world/generate';
import { STAGES, type StageId } from '../../world/pipeline';
import { Button } from '../components/Button';
import styles from './World.module.css';

function formatMs(ms: number | null): string {
  if (ms === null) return '';
  return ms < 1000 ? `${Math.round(ms).toString()} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: 'Pendiente',
  running: 'En curso',
  done: 'Hecho',
  error: 'Error',
};

/** Progreso real de cada etapa del pipeline, con su duración medida. */
export function GenerationProgress({
  stages,
}: {
  readonly stages: Readonly<Partial<Record<StageId, StageState>>>;
}) {
  return (
    <ol className={styles.stages} data-testid="world-stages">
      {STAGES.map((stage) => {
        const state = stages[stage.id];
        const status = state?.status ?? 'pending';
        return (
          <li key={stage.id} className={styles.stage} data-status={status} data-stage={stage.id}>
            <span className={styles.stageDot} aria-hidden="true" />
            <span className={styles.stageLabel}>{stage.label}</span>
            <span className={styles.stageTime}>
              {status === 'done' ? formatMs(state?.durationMs ?? null) : STATUS_LABEL[status]}
            </span>
            {state?.detail != null ? (
              <span className={styles.stageDetail}>{state.detail}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface ProvenanceRowProps {
  readonly layer: string;
  readonly origin: 'real' | 'procedural' | 'none' | 'asset';
  readonly source: string;
  readonly note?: string | undefined;
  readonly testId?: string;
}

const ORIGIN_LABEL = {
  real: 'Dato real',
  procedural: 'Procedural',
  none: 'Sin datos',
  asset: 'Recurso CC0',
} as const;

function ProvenanceRow({ layer, origin, source, note, testId }: ProvenanceRowProps) {
  return (
    <li className={styles.provRow} data-testid={testId}>
      <div className={styles.provHead}>
        <span>{layer}</span>
        <span className={styles.badge} data-origin={origin}>
          {ORIGIN_LABEL[origin]}
        </span>
      </div>
      <p className={styles.provSource}>{source}</p>
      {note === undefined ? null : <p className={styles.provNote}>{note}</p>}
    </li>
  );
}

function citation(meta: DatasetMeta | undefined): string {
  return meta === undefined ? '' : meta.citation;
}

/** Procedencia de cada capa del mundo: qué es dato real y qué es generado. */
export function ProvenancePanel({ world }: { readonly world: GeneratedWorld }) {
  const { sources, build } = world;
  const datasets = sources.datasets;
  const featureDate = sources.features.osmTimestamp?.slice(0, 10) ?? '';
  return (
    <section className={styles.panel} aria-labelledby="prov-heading" data-testid="provenance-panel">
      <h2 id="prov-heading" className={styles.panelTitle}>
        Procedencia de los datos
      </h2>
      <ul className={styles.provList}>
        <ProvenanceRow
          testId="prov-elevation"
          layer="Relieve"
          origin={sources.elevation.origin}
          source={
            sources.elevation.origin === 'real'
              ? `NASADEM (NASA JPL, SRTM 2000), ≈ 30 m, vía OpenTopography · ${sources.elevation.tiles.join(', ')}`
              : 'Terreno procedural de demostración: no es la topografía real del lugar.'
          }
          note={
            sources.elevation.origin === 'real'
              ? `Altura en el centro: ${build.originElevationM.toFixed(0)} m (EGM96). Suavizado σ = ${String(build.normalization.smoothingSigmaPx)} px para atenuar el ruido del radar.`
              : (sources.elevation.failure ?? undefined)
          }
        />
        <ProvenanceRow
          testId="prov-landcover"
          layer="Cobertura del suelo"
          origin={sources.landCover.origin}
          source={
            sources.landCover.origin === 'real'
              ? 'ESA WorldCover 2021 v200, 10 m (exactitud global publicada 76,7 %)'
              : 'Cobertura procedural de demostración.'
          }
          note="Define dónde hay cultivo, pastizal, matorral, árboles o zonas construidas."
        />
        <ProvenanceRow
          testId="prov-features"
          layer="Caminos, agua y edificaciones"
          origin={sources.features.available ? 'real' : 'none'}
          source={
            sources.features.available
              ? `OpenStreetMap (ODbL), datos del ${featureDate} · ${String(sources.features.count)} elementos`
              : (sources.features.reason ?? 'Sin datos de OpenStreetMap para esta área.')
          }
          note={
            sources.features.available
              ? 'Anchos estimados por categoría cuando OSM no los registra. Las edificaciones se marcan en el suelo: no hay modelos 3D de edificios en el catálogo.'
              : undefined
          }
        />
        <ProvenanceRow
          layer="Campos, plantas y rocas"
          origin="procedural"
          source="Posiciones, especies representativas y estado de los campos generados con una semilla dentro de las zonas que permiten los datos."
          note="No representan cultivos, árboles ni parcelas reales."
        />
        <ProvenanceRow
          layer="Materiales, modelos y cielo"
          origin="asset"
          source="Catálogo CC0 de la fase 02 (Poly Haven, ambientCG). El cielo HDRI es ambientación visual, no el clima del lugar."
        />
      </ul>
      <details className={styles.citations}>
        <summary>Citas y licencias</summary>
        <ul>
          <li>
            {citation(datasets?.elevation) ||
              'NASA JPL (2020). NASADEM Merged DEM Global 1 arc second V001. Distribuido por OpenTopography.'}
          </li>
          <li>
            {datasets?.landcover.attribution ??
              '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021).'}
          </li>
          <li>© OpenStreetMap contributors (ODbL).</li>
        </ul>
      </details>
    </section>
  );
}

export function SelectionCard({
  selection,
  onClose,
}: {
  readonly selection: TerrainSelection;
  readonly onClose: () => void;
}) {
  return (
    <section
      className={styles.selection}
      aria-label="Punto seleccionado"
      data-testid="terrain-selection"
    >
      <div className={styles.provHead}>
        <h2 className={styles.panelTitle}>Punto del terreno</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Coordenadas</dt>
          <dd data-testid="selection-coords">
            {formatDegrees(selection.latitude, 5)}, {formatDegrees(selection.longitude, 5)}
          </dd>
        </div>
        <div>
          <dt>Altura</dt>
          <dd data-testid="selection-elevation">{selection.elevationM.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Pendiente</dt>
          <dd>{selection.slopeDeg.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Cobertura</dt>
          <dd>{selection.landCover}</dd>
        </div>
        <div>
          <dt>Local (m)</dt>
          <dd>
            x {selection.x.toFixed(1)} · z {selection.z.toFixed(1)}
          </dd>
        </div>
        {selection.nearestFeature === null ? null : (
          <div>
            <dt>Cerca</dt>
            <dd>{selection.nearestFeature}</dd>
          </div>
        )}
      </dl>
      {selection.insideFarm ? (
        <p className={styles.provNote}>Dentro de la región reservada para las parcelas.</p>
      ) : null}
    </section>
  );
}

export function PerformancePanel({
  stats,
  world,
}: {
  readonly stats: RenderStats | null;
  readonly world: GeneratedWorld;
}) {
  const build = world.build;
  return (
    <section
      className={styles.panel}
      aria-labelledby="perf-heading"
      data-testid="performance-panel"
    >
      <h2 id="perf-heading" className={styles.panelTitle}>
        Rendimiento
      </h2>
      <dl className={styles.facts}>
        <div>
          <dt>Calidad</dt>
          <dd>
            {world.quality.label} · malla de {build.stats.detailSpacingM.toFixed(1)} m
          </dd>
        </div>
        <div>
          <dt>Fotogramas</dt>
          <dd data-testid="perf-fps">
            {stats === null
              ? '—'
              : stats.fps === 0
                ? 'en reposo (se dibuja solo al moverse)'
                : `${String(stats.fps)} fps`}
          </dd>
        </div>
        <div>
          <dt>Dibujo</dt>
          <dd data-testid="perf-draw">
            {stats === null
              ? '—'
              : `${String(stats.drawCalls)} llamadas · ${(stats.triangles / 1e6).toFixed(2)} M triángulos`}
          </dd>
        </div>
        <div>
          <dt>Vegetación visible</dt>
          <dd>
            {stats === null
              ? '—'
              : `${String(stats.vegetationVisible)} ejemplares (${String(stats.impostors)} impostores)`}
          </dd>
        </div>
        <div>
          <dt>Memoria GPU</dt>
          <dd>
            {stats === null
              ? '—'
              : `${String(stats.geometries)} geometrías · ${String(stats.textures)} texturas`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

interface WorldErrorPanelProps {
  readonly error: WorldError;
  readonly onRetry: () => void;
  readonly onUseProcedural: () => void;
  readonly onBack: () => void;
}

export function WorldErrorPanel({ error, onRetry, onUseProcedural, onBack }: WorldErrorPanelProps) {
  return (
    <div className={styles.errorBox} role="alert" data-testid="world-error">
      <h2 className={styles.panelTitle}>No se pudo generar el mundo 3D</h2>
      <p>{error.message}</p>
      {error.failedSources.length > 0 ? (
        <ul className={styles.failed}>
          {error.failedSources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.errorActions}>
        <Button variant="primary" onClick={onRetry}>
          Reintentar
        </Button>
        {error.kind === 'data-unavailable' ? (
          <Button variant="secondary" onClick={onUseProcedural} data-testid="use-procedural">
            Continuar con datos procedurales (demostrativos)
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onBack}>
          Volver
        </Button>
      </div>
      {error.kind === 'data-unavailable' ? (
        <p className={styles.provNote}>
          Los datos procedurales se etiquetan en la escena como demostrativos: no representan el
          relieve ni la cobertura reales del lugar.
        </p>
      ) : null}
    </div>
  );
}
