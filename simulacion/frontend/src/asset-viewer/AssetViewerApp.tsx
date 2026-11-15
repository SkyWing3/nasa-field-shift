import { useEffect, useMemo, useState } from 'react';

import type { AssetCatalog, AssetEntry } from '../assets';
import { detectWebGLSupport } from '../scene';
import { EmptyState, ErrorState, LoadingIndicator } from '../ui';
import styles from './AssetViewer.module.css';
import { type CatalogResult, fetchCatalog } from '../assets/catalogClient';
import { AssetList } from './components/AssetList';
import { Inspector } from './components/Inspector';
import { StageOverlay } from './components/StageOverlay';
import { formatBytes, STATUS_CLASS } from './labels';
import { ViewerCanvas } from './scene/ViewerCanvas';
import { useViewerStore } from './viewerStore';

type CatalogState = { readonly status: 'loading' } | CatalogResult;

const PREFERRED_HDRI = 'farm_field_puresky';

function selectionFromHash(catalog: AssetCatalog): AssetEntry | null {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  return catalog.assets.find((asset) => asset.id === id) ?? null;
}

/** Ajustes iniciales que dependen del catálogo: HDRI por defecto y selección desde la URL. */
function initializeViewer(catalog: AssetCatalog): void {
  const hdris = catalog.assets.filter(
    (asset) => asset.kind === 'hdri' && asset.status === 'available',
  );
  const preferred = hdris.find((asset) => asset.id === PREFERRED_HDRI) ?? hdris[0];
  const store = useViewerStore.getState();
  store.updateLighting({ hdriId: preferred?.id ?? null });
  const initial = selectionFromHash(catalog);
  store.select(initial?.id ?? null, initial?.status === 'available');
}

function Header({ catalog }: { readonly catalog: AssetCatalog | null }) {
  const counts = useMemo(() => {
    const assets = catalog?.assets ?? [];
    return {
      available: assets.filter((asset) => asset.status === 'available').length,
      missing: assets.filter((asset) => asset.status === 'missing').length,
      failed: assets.filter((asset) => asset.status === 'error').length,
      bytes: assets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
    };
  }, [catalog]);
  return (
    <header className={styles.header}>
      <div className={styles.headerTitle}>
        <h1>Visualizador de assets</h1>
        <span>
          Herramienta de desarrollo
          {catalog === null
            ? ''
            : ` · catálogo del ${new Date(catalog.generatedAt).toLocaleDateString('es-ES')}`}
        </span>
      </div>
      {catalog === null ? null : (
        <ul className={styles.summary} data-testid="catalog-summary">
          <li className={STATUS_CLASS.available}>{counts.available} disponibles</li>
          <li className={STATUS_CLASS.missing}>{counts.missing} faltantes</li>
          {counts.failed > 0 ? (
            <li className={STATUS_CLASS.error}>{counts.failed} con errores</li>
          ) : null}
          <li>{formatBytes(counts.bytes)}</li>
        </ul>
      )}
      <a className={styles.backLink} href="/">
        Volver a TerraLab
      </a>
    </header>
  );
}

function CatalogProblem({
  state,
  onRetry,
}: {
  readonly state: CatalogState;
  readonly onRetry: () => void;
}) {
  switch (state.status) {
    case 'loading':
      return <LoadingIndicator label="Cargando catálogo de assets…" />;
    case 'not-generated':
      return (
        <EmptyState icon="layers" title="Catálogo no generado">
          La biblioteca de assets no está en el repositorio. Ejecuta <code>make assets</code> para
          descargar los originales (unos 400 MB), procesarlos y generar el catálogo.
        </EmptyState>
      );
    case 'invalid':
      return (
        <ErrorState title="Catálogo no válido" detail={state.message} onRetry={onRetry}>
          El archivo catalog.json no tiene el formato esperado. Regenera la biblioteca con{' '}
          <code>make assets</code>.
        </ErrorState>
      );
    case 'unreachable':
      return (
        <ErrorState title="No se pudo leer el catálogo" detail={state.message} onRetry={onRetry}>
          Comprueba que el servidor de desarrollo de Vite está en marcha.
        </ErrorState>
      );
    case 'ready':
      return null;
  }
}

export function AssetViewerApp() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const selectedId = useViewerStore((store) => store.selectedId);
  const select = useViewerStore((store) => store.select);
  const loadStatus = useViewerStore((store) => store.load.status);
  const hdriId = useViewerStore((store) => store.lighting.hdriId);
  const webgl = useMemo(() => detectWebGLSupport(), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog(controller.signal).then(
      (result) => {
        if (result.status === 'ready') initializeViewer(result.catalog);
        setState(result);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'unreachable',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      controller.abort();
    };
  }, [reloadToken]);

  const catalog = state.status === 'ready' ? state.catalog : null;

  // Navegación con el historial o enlaces directos (#id) sin recargar la página.
  useEffect(() => {
    if (catalog === null) return undefined;
    const onHashChange = (): void => {
      const target = selectionFromHash(catalog);
      if (target !== null && target.id !== useViewerStore.getState().selectedId) {
        select(target.id, target.status === 'available');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [catalog, select]);
  const asset = catalog?.assets.find((entry) => entry.id === selectedId) ?? null;
  const lightingHdri =
    catalog?.assets.find((entry) => entry.id === hdriId && entry.status === 'available') ?? null;

  const handleSelect = (entry: AssetEntry): void => {
    select(entry.id, entry.status === 'available');
    window.history.replaceState(null, '', `#${encodeURIComponent(entry.id)}`);
  };
  const retryCatalog = (): void => {
    setState({ status: 'loading' });
    setReloadToken((token) => token + 1);
  };

  // Three.js r163+ solo admite WebGL 2.
  if (webgl.version !== 2) {
    return (
      <div className={styles.fullscreen}>
        <ErrorState title="WebGL 2 no disponible">
          El visualizador necesita WebGL 2 para dibujar los modelos. Activa la aceleración gráfica
          del navegador o usa una versión reciente de Chrome, Edge, Firefox o Safari.
        </ErrorState>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Header catalog={catalog} />
      {catalog === null ? (
        <div className={styles.fullscreen}>
          <CatalogProblem state={state} onRetry={retryCatalog} />
        </div>
      ) : (
        <>
          <aside className={styles.sidebar}>
            <AssetList catalog={catalog} selectedId={selectedId} onSelect={handleSelect} />
          </aside>
          <main
            className={styles.stage}
            data-testid="viewer-stage"
            data-asset-id={asset?.id ?? ''}
            data-load-state={loadStatus}
          >
            <ViewerCanvas asset={asset} lightingHdri={lightingHdri} />
            <StageOverlay asset={asset} />
          </main>
          <aside className={styles.inspector}>
            <Inspector catalog={catalog} asset={asset} />
          </aside>
        </>
      )}
    </div>
  );
}
