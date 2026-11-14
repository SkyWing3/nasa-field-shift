import { lazy, Suspense } from 'react';

import { useAppStore } from '../state';
import {
  ErrorBoundary,
  ErrorState,
  LoadingIndicator,
  SidePanel,
  TopBar,
  WorkspaceLayout,
} from '../ui';
import { refreshApiHealth } from './services';

// Three.js, R3F y Drei se cargan solo al entrar en el espacio de trabajo.
const SceneViewport = lazy(async () => {
  const module = await import('../scene/SceneViewport');
  return { default: module.SceneViewport };
});

function retryApi(): void {
  void refreshApiHealth();
}

export function WorkspaceScreen() {
  const returnToStart = useAppStore((s) => s.returnToStart);

  return (
    <WorkspaceLayout
      topBar={<TopBar onRetryApi={retryApi} onGoHome={returnToStart} />}
      sidePanel={<SidePanel />}
      scene={
        <ErrorBoundary
          fallback={(error, reset) => (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
              <ErrorState
                title="No se pudo cargar el motor gráfico"
                detail={error.message}
                onRetry={reset}
              >
                Falló la descarga o la inicialización del módulo 3D. Comprueba la conexión y vuelve
                a intentarlo.
              </ErrorState>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                <LoadingIndicator label="Cargando motor gráfico" />
              </div>
            }
          >
            <SceneViewport />
          </Suspense>
        </ErrorBoundary>
      }
    />
  );
}
