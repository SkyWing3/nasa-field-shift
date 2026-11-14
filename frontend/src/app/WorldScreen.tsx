import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { assetFileUrl } from '../assets';
import type { RegionPreset } from '../geo';
import type { SavedSite } from '../persistence';
import { useWorldStore } from '../state/worldStore';
import { Button, ErrorBoundary, ErrorState, Icon, LoadingIndicator } from '../ui';
import styles from '../ui/world/World.module.css';
import {
  GenerationProgress,
  PerformancePanel,
  ProvenancePanel,
  SelectionCard,
  WorldErrorPanel,
} from '../ui/world/WorldPanels';
import { WORLD_QUALITIES, type WorldQualityId } from '../world/quality';
import type { WORLD_HDRIS } from '../world/worldAssets';
import { startWorldGeneration } from './worldGeneration';

// Three.js, R3F y el visor del mundo se descargan solo al abrir esta pantalla.
const WorldViewport = lazy(async () => {
  const module = await import('../scene/WorldViewport');
  return { default: module.WorldViewport };
});

const SKIES: readonly { readonly id: (typeof WORLD_HDRIS)[number]; readonly label: string }[] = [
  { id: 'kloofendal_43d_clear_puresky', label: 'Despejado' },
  { id: 'farm_field_puresky', label: 'Parcialmente nublado' },
  { id: 'overcast_soil_puresky', label: 'Cubierto' },
  { id: 'kloofendal_misty_morning_puresky', label: 'Mañana con bruma' },
  { id: 'belfast_sunset_puresky', label: 'Atardecer' },
];

interface WorldScreenProps {
  readonly site: SavedSite;
  readonly preset: RegionPreset | null;
  readonly onBack: () => void;
}

/** Mundo 3D generado a partir de la región guardada: terreno real, materiales y vegetación. */
export function WorldScreen({ site, preset, onBack }: WorldScreenProps) {
  const status = useWorldStore((s) => s.status);
  const stages = useWorldStore((s) => s.stages);
  const world = useWorldStore((s) => s.world);
  const catalog = useWorldStore((s) => s.catalog);
  const error = useWorldStore((s) => s.error);
  const quality = useWorldStore((s) => s.quality);
  const selection = useWorldStore((s) => s.selection);
  const stats = useWorldStore((s) => s.stats);
  const showOsm = useWorldStore((s) => s.showOsm);
  const showRegion = useWorldStore((s) => s.showRegion);
  const skyId = useWorldStore((s) => s.skyId);
  const {
    setQuality,
    select,
    toggleOsm,
    toggleRegion,
    requestView,
    sceneReady,
    fail,
    setSky,
    reset,
  } = useWorldStore.getState();
  const [attempt, setAttempt] = useState(0);
  const [allowProcedural, setAllowProcedural] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => globalThis.innerWidth > 860);

  useEffect(() => {
    const cancel = startWorldGeneration(site.region, allowProcedural);
    return cancel;
  }, [site.region, quality, attempt, allowProcedural]);

  useEffect(() => reset, [reset]);

  const handleSceneError = useCallback(
    (message: string) => {
      fail({ kind: 'scene', message, failedSources: [] });
    },
    [fail],
  );

  const hdri = catalog?.assets.find((asset) => asset.id === skyId);
  const hdriFile =
    hdri?.files.find((file) => file.path.endsWith(quality === 'low' ? '_1k.hdr' : '_2k.hdr')) ??
    hdri?.files[0];
  const hdriUrl = hdriFile === undefined ? null : assetFileUrl(hdriFile.path);
  const procedural =
    world !== null &&
    (world.sources.elevation.origin === 'procedural' ||
      world.sources.landCover.origin === 'procedural');

  return (
    <div className={styles.screen} data-testid="world-screen" data-world-status={status}>
      {world !== null && catalog !== null && hdriUrl !== null ? (
        <ErrorBoundary
          fallback={(caught) => (
            <div className={styles.overlay}>
              <ErrorState
                title="Error en la escena 3D"
                detail={caught.message}
                onRetry={() => {
                  setAttempt((n) => n + 1);
                }}
              >
                Se produjo un error al dibujar el mundo. Puedes volver a generarlo.
              </ErrorState>
            </div>
          )}
        >
          <Suspense fallback={null}>
            <WorldViewport
              key={`${String(attempt)}-${quality}`}
              world={world}
              catalog={catalog}
              hdriUrl={hdriUrl}
              onSceneReady={sceneReady}
              onSceneError={handleSceneError}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      <header className={styles.topbar}>
        <Button
          variant="ghost"
          size="small"
          onClick={onBack}
          aria-label="Volver a la preparación de la granja"
        >
          <Icon name="home" size={16} />
        </Button>
        <div className={styles.title}>
          <strong data-testid="world-farm-name">{site.name}</strong>
          <span>{preset?.locality ?? 'Mundo 3D generado a partir de la región guardada'}</span>
        </div>
        <div className={styles.group} role="group" aria-label="Vistas de cámara">
          <Button
            size="small"
            onClick={() => {
              requestView('aerial');
            }}
            disabled={status !== 'ready'}
            data-testid="view-aerial"
          >
            Vista aérea
          </Button>
          <Button
            size="small"
            onClick={() => {
              requestView('farm');
            }}
            disabled={status !== 'ready'}
            data-testid="view-farm"
          >
            Granja
          </Button>
          <Button
            size="small"
            onClick={() => {
              requestView('ground');
            }}
            disabled={status !== 'ready'}
            data-testid="view-ground"
          >
            A pie
          </Button>
        </div>
        <div className={styles.group} role="group" aria-label="Capas">
          <Button
            size="small"
            className={styles.toggle}
            aria-pressed={showRegion}
            onClick={toggleRegion}
            data-testid="toggle-region"
          >
            Límite de la granja
          </Button>
          <Button
            size="small"
            className={styles.toggle}
            aria-pressed={showOsm}
            onClick={toggleOsm}
            data-testid="toggle-osm"
          >
            Datos OSM
          </Button>
          <Button
            size="small"
            className={styles.toggle}
            aria-pressed={panelOpen}
            onClick={() => {
              setPanelOpen((v) => !v);
            }}
          >
            <Icon name="layers" size={14} />
            Panel
          </Button>
        </div>
        <span className={styles.spacer} />
        <label className={styles.group}>
          <span className={styles.label}>Cielo</span>
          <select
            className={styles.select}
            value={skyId}
            onChange={(event) => {
              setSky(event.target.value);
            }}
            data-testid="sky-select"
          >
            {SKIES.map((sky) => (
              <option key={sky.id} value={sky.id}>
                {sky.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.group}>
          <span className={styles.label}>Calidad</span>
          <select
            className={styles.select}
            value={quality}
            onChange={(event) => {
              setQuality(event.target.value as WorldQualityId);
            }}
            data-testid="quality-select"
          >
            {Object.values(WORLD_QUALITIES).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {world !== null ? (
        <aside className={styles.side} data-open={panelOpen ? 'true' : 'false'}>
          {procedural ? (
            <p className={styles.panel} data-testid="procedural-warning">
              <strong>Mundo con datos procedurales de demostración.</strong> Parte del relieve o de
              la cobertura no corresponde al lugar real (fuente no disponible).
            </p>
          ) : null}
          <ProvenancePanel world={world} />
          <section className={styles.panel} aria-label="Etapas de la generación">
            <h2 className={styles.panelTitle}>Generación</h2>
            <GenerationProgress stages={stages} />
          </section>
          <PerformancePanel stats={stats} world={world} />
          <p className={`${styles.panel} ${styles.hint}`}>
            Clic: consultar un punto · Arrastrar: girar · Botón derecho o WASD: desplazar · Rueda:
            zoom
          </p>
        </aside>
      ) : null}

      {selection !== null ? (
        <SelectionCard
          selection={selection}
          onClose={() => {
            select(null);
          }}
        />
      ) : null}

      <p className={styles.attribution} data-testid="world-attribution">
        Relieve: NASADEM (NASA JPL) vía OpenTopography · Cobertura: © ESA WorldCover 2021 · Caminos
        y agua: © OpenStreetMap contributors (ODbL) · Materiales, modelos y cielo: Poly Haven y
        ambientCG (CC0)
      </p>

      {status === 'generating' ? (
        <div className={styles.overlay} data-testid="world-progress">
          <div className={styles.progress}>
            <h2 className={styles.panelTitle}>Generando el mundo 3D</h2>
            <p>
              {WORLD_QUALITIES[quality].label} calidad · región de {Math.round(site.region.widthM)}{' '}
              × {Math.round(site.region.lengthM)} m
            </p>
            <GenerationProgress stages={stages} />
            {world === null ? null : (
              <div style={{ marginTop: 12 }}>
                <LoadingIndicator label="Preparando la escena en la GPU…" />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {status === 'error' && error !== null ? (
        <div className={styles.overlay}>
          <WorldErrorPanel
            error={error}
            onRetry={() => {
              setAttempt((n) => n + 1);
            }}
            onUseProcedural={() => {
              setAllowProcedural(true);
            }}
            onBack={onBack}
          />
        </div>
      ) : null}
    </div>
  );
}
