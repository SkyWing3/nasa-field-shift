import { useProgress } from '@react-three/drei';

import type { AssetEntry } from '../../assets';
import { EmptyState, ErrorState, Icon, LoadingIndicator } from '../../ui';
import styles from '../AssetViewer.module.css';
import { formatMeters } from '../labels';
import { DISPLACEMENT_SCALE_M, SAMPLE_SIZE_M } from '../scene/assetFiles';
import { VIEW_MODES } from '../scene/viewModes';
import { useViewerStore } from '../viewerStore';
import { Segmented } from './Controls';
import { MissingAssetPanel } from './MissingAssetPanel';

function Toolbar({ asset }: { readonly asset: AssetEntry }) {
  const viewMode = useViewerStore((state) => state.viewMode);
  const setViewMode = useViewerStore((state) => state.setViewMode);
  const lodMode = useViewerStore((state) => state.lodMode);
  const setLodMode = useViewerStore((state) => state.setLodMode);
  const autoRotate = useViewerStore((state) => state.autoRotate);
  const setAutoRotate = useViewerStore((state) => state.setAutoRotate);
  const showGrid = useViewerStore((state) => state.showGrid);
  const setShowGrid = useViewerStore((state) => state.setShowGrid);
  const resetCamera = useViewerStore((state) => state.resetCamera);
  const lods = asset.model?.lods ?? [];

  return (
    <div className={styles.toolbar}>
      {asset.kind === 'hdri' ? null : (
        <Segmented
          label="Modo de visualización"
          value={viewMode}
          options={VIEW_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
          onChange={setViewMode}
          testId="view-mode"
        />
      )}
      {lods.length > 1 ? (
        <Segmented
          label="Nivel de detalle"
          value={lodMode}
          options={[
            { value: 'auto' as const, label: 'LOD auto' },
            ...lods.map((lod) => ({ value: lod.level, label: `LOD${lod.level}` })),
          ]}
          onChange={setLodMode}
          testId="lod-mode"
        />
      ) : null}
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={autoRotate}
          onClick={() => {
            setAutoRotate(!autoRotate);
          }}
        >
          Rotar
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={showGrid}
          onClick={() => {
            setShowGrid(!showGrid);
          }}
        >
          Cuadrícula 1 m
        </button>
        <button type="button" className={styles.toolButton} onClick={resetCamera}>
          <Icon name="refresh" size={14} />
          Encuadrar
        </button>
      </div>
    </div>
  );
}

function ScaleNote({ asset }: { readonly asset: AssetEntry }) {
  const displacement = useViewerStore((state) => state.displacement);
  let text: string;
  if (asset.model !== null) {
    text = `Tamaño ${formatMeters(asset.model.sizeM)} · cuadrícula de 1 m`;
  } else if (asset.material !== null) {
    const tile = asset.material.tileSizeM;
    text = `Superficie de muestra de ${SAMPLE_SIZE_M} × ${SAMPLE_SIZE_M} m · ${
      tile === null
        ? 'la fuente no publica el tamaño real (se asume 2 m por repetición)'
        : `una repetición cada ${formatMeters(tile)}`
    }${displacement ? ` · relieve con escala visual de ${DISPLACEMENT_SCALE_M * 100} cm, no medida` : ''}`;
  } else {
    text = 'Esferas de referencia: difusa gris 18 % y cromo';
  }
  return (
    <p className={styles.scaleNote} data-testid="scale-note">
      {text}
    </p>
  );
}

interface StageOverlayProps {
  readonly asset: AssetEntry | null;
}

export function StageOverlay({ asset }: StageOverlayProps) {
  const load = useViewerStore((state) => state.load);
  const retry = useViewerStore((state) => state.retry);
  const { progress, active } = useProgress();

  if (asset === null) {
    return (
      <div className={styles.overlayCenter}>
        <EmptyState icon="layers" title="Ningún asset seleccionado">
          Elige un asset en la lista para inspeccionarlo: rotar con arrastre, acercar con la rueda y
          desplazar con el botón derecho.
        </EmptyState>
      </div>
    );
  }
  if (asset.status === 'missing') {
    return (
      <div className={styles.overlayCenter}>
        <MissingAssetPanel asset={asset} />
      </div>
    );
  }
  if (asset.status === 'error') {
    return (
      <div className={styles.overlayCenter}>
        <ErrorState title="El asset no superó el procesado">
          Revisa la pestaña Información para ver qué comprobación falló.
          {asset.error === null ? null : <code className={styles.inlineCode}>{asset.error}</code>}
        </ErrorState>
      </div>
    );
  }
  return (
    <>
      <Toolbar asset={asset} />
      {load.status === 'loading' ? (
        <div className={styles.overlayCenter}>
          <LoadingIndicator label={`Cargando ${asset.name}…`} {...(active ? { progress } : {})} />
        </div>
      ) : null}
      {load.status === 'error' ? (
        <div className={styles.overlayCenter}>
          <ErrorState title="No se pudo cargar el asset" detail={load.message} onRetry={retry}>
            Three.js no pudo cargar o interpretar los archivos.
          </ErrorState>
        </div>
      ) : null}
      <ScaleNote asset={asset} />
    </>
  );
}
