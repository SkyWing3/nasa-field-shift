import { lazy, type ReactNode, Suspense, useMemo, useState } from 'react';

import { findPreset, formatArea, formatDegrees } from '../geo';
import { detectWebGLSupport } from '../scene';
import { useAppStore, useSiteStore } from '../state';
import { ErrorBoundary, ErrorState, LoadingIndicator, StartScreen } from '../ui';
import { APP_VERSION, appConfig, refreshApiHealth } from './services';
import { useApiHealthMonitor } from './useApiHealthMonitor';
import { WorkspaceScreen } from './WorkspaceScreen';

// Mapa (MapLibre) y medidas geodésicas (GeographicLib) solo se descargan al usarse.
const LocationScreen = lazy(async () => {
  const module = await import('./LocationScreen');
  return { default: module.LocationScreen };
});
const FarmScreen = lazy(async () => {
  const module = await import('../ui/screens/FarmScreen');
  return { default: module.FarmScreen };
});
const WorldScreen = lazy(async () => {
  const module = await import('./WorldScreen');
  return { default: module.WorldScreen };
});

function retryApi(): void {
  void refreshApiHealth();
}

function LazyScreen({ children }: { readonly children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
          <ErrorState title="No se pudo cargar la pantalla" detail={error.message} onRetry={reset}>
            Falló la descarga de una parte de la aplicación. Comprueba la conexión y vuelve a
            intentarlo.
          </ErrorState>
        </div>
      )}
    >
      <Suspense
        fallback={
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
            <LoadingIndicator label="Cargando…" />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  const screen = useAppStore((s) => s.screen);
  const openLocation = useAppStore((s) => s.openLocation);
  const openFarm = useAppStore((s) => s.openFarm);
  const openWorld = useAppStore((s) => s.openWorld);
  const enterWorkspace = useAppStore((s) => s.enterWorkspace);
  const returnToStart = useAppStore((s) => s.returnToStart);
  const saved = useSiteStore((s) => s.saved);
  const loadWarning = useSiteStore((s) => s.loadWarning);
  const editSaved = useSiteStore((s) => s.editSaved);
  const [graphics] = useState(detectWebGLSupport);

  useApiHealthMonitor();

  // Resumen ligero para la pantalla inicial: el área del plano local coincide con la geodésica
  // con un error relativo < 1 ppm en los tamaños permitidos (ver geo.test.ts).
  const savedSummary = useMemo(
    () =>
      saved === null
        ? null
        : {
            name: saved.name,
            area: formatArea(saved.region.widthM * saved.region.lengthM),
            center: `${formatDegrees(saved.region.center.latitude, 4)}, ${formatDegrees(saved.region.center.longitude, 4)}`,
            latitude: saved.region.center.latitude,
            longitude: saved.region.center.longitude,
            areaHa: (saved.region.widthM * saved.region.lengthM) / 10_000,
          },
    [saved],
  );

  // Abrir el mapa con la ubicación guardada (si existe) para modificarla.
  const chooseLocation = (): void => {
    editSaved();
    openLocation();
  };

  if (screen === 'workspace') return <WorkspaceScreen />;
  if (screen === 'location') {
    return (
      <LazyScreen>
        <LocationScreen />
      </LazyScreen>
    );
  }
  if (screen === 'world' && saved !== null) {
    return (
      <LazyScreen>
        <WorldScreen
          site={saved}
          preset={saved.presetId === null ? null : (findPreset(saved.presetId) ?? null)}
          onBack={openFarm}
        />
      </LazyScreen>
    );
  }
  if (screen === 'farm' && saved !== null) {
    return (
      <LazyScreen>
        <FarmScreen
          site={saved}
          preset={saved.presetId === null ? null : (findPreset(saved.presetId) ?? null)}
          onEdit={chooseLocation}
          onGenerateWorld={openWorld}
          onEnterWorkspace={enterWorkspace}
          onHome={returnToStart}
        />
      </LazyScreen>
    );
  }
  return (
    <StartScreen
      graphics={graphics}
      appVersion={APP_VERSION}
      savedSite={savedSummary}
      siteWarning={loadWarning}
      onChooseLocation={chooseLocation}
      onContinue={openFarm}
      onEnter={enterWorkspace}
      onRetryApi={retryApi}
      comparatorUrl={appConfig.comparatorUrl}
    />
  );
}
