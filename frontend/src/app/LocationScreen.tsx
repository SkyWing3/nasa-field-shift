import { lazy, Suspense, useState } from 'react';

import { findPreset, type GeoPoint, type RectangularRegion, REGION_PRESETS } from '../geo';
import type { BasemapId } from '../map/basemaps';
import type { MapFocus } from '../map/MapViewport';
import { SitePersistenceError } from '../persistence';
import type { PlaceSearchResult } from '../place-search';
import { useAppStore, useSiteStore } from '../state';
import { ErrorBoundary, ErrorState, LoadingIndicator } from '../ui';
import { ConfirmSiteDialog } from '../ui/location/ConfirmSiteDialog';
import { LocationPanel } from '../ui/location/LocationPanel';
import styles from './LocationScreen.module.css';
import { basemaps, confirmDraftSite, placeSearch } from './services';

// MapLibre (~1 MB) solo se descarga al abrir el mapa.
const MapViewport = lazy(async () => {
  const module = await import('../map/MapViewport');
  return { default: module.MapViewport };
});

const BASEMAP_ORDER: readonly BasemapId[] = ['map', 'satellite'];

type FocusRequest =
  | { readonly kind: 'point'; readonly point: GeoPoint; readonly zoom: number }
  | { readonly kind: 'region'; readonly region: RectangularRegion };

export function LocationScreen() {
  const draft = useSiteStore((state) => state.draft);
  const placeCenter = useSiteStore((state) => state.placeCenter);
  const setDraftRegion = useSiteStore((state) => state.setDraftRegion);
  const patchDraft = useSiteStore((state) => state.patchDraft);
  const applyPreset = useSiteStore((state) => state.applyPreset);
  const openFarm = useAppStore((state) => state.openFarm);
  const returnToStart = useAppStore((state) => state.returnToStart);

  const [basemapId, setBasemapId] = useState<BasemapId>('map');
  const [drawMode, setDrawMode] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Al volver a editar, el mapa encuadra la región existente.
  const [focus, setFocus] = useState<MapFocus | null>(() =>
    draft === null ? null : { kind: 'region', region: draft.region, token: 0 },
  );
  const nextFocus = (request: FocusRequest): void => {
    setFocus((previous) => ({ ...request, token: (previous?.token ?? 0) + 1 }));
  };

  const selectResult = (result: PlaceSearchResult): void => {
    placeCenter(
      result.point,
      result.kind === 'coordinates' ? 'coordinates' : 'search',
      result.name,
    );
    nextFocus({ kind: 'point', point: result.point, zoom: result.zoom });
  };

  const confirm = (name: string): void => {
    try {
      confirmDraftSite(name);
      setConfirming(false);
      openFarm();
    } catch (error) {
      setSaveError(
        error instanceof SitePersistenceError || error instanceof Error
          ? error.message
          : 'No se pudo guardar la ubicación.',
      );
    }
  };

  const preset = draft?.presetId == null ? null : (findPreset(draft.presetId) ?? null);

  return (
    <div className={styles.layout} data-testid="location-screen">
      <LocationPanel
        draft={draft}
        searchProvider={placeSearch}
        presets={REGION_PRESETS}
        drawMode={drawMode}
        onSelectResult={selectResult}
        onApplyPreset={(selected) => {
          applyPreset(selected);
          nextFocus({ kind: 'region', region: selected.region });
        }}
        onPatch={patchDraft}
        onToggleDraw={() => {
          setDrawMode((value) => !value);
        }}
        onConfirm={() => {
          setSaveError(null);
          setConfirming(true);
        }}
        onBack={returnToStart}
      />
      <main className={styles.mapArea}>
        <div className={styles.basemapSwitch} role="group" aria-label="Mapa base">
          {BASEMAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={basemapId === id}
              title={basemaps[id].description}
              onClick={() => {
                setBasemapId(id);
              }}
            >
              {basemaps[id].label}
            </button>
          ))}
        </div>
        {basemapId === 'satellite' ? (
          <p className={styles.basemapNote}>{basemaps.satellite.description}</p>
        ) : null}
        <ErrorBoundary
          key={mapAttempt}
          fallback={(error, reset) => (
            <div className={styles.centered}>
              <ErrorState
                title="No se pudo cargar el mapa"
                detail={error.message}
                onRetry={() => {
                  reset();
                  setMapAttempt((value) => value + 1);
                }}
              >
                Falló la descarga del módulo de mapas. Comprueba la conexión y vuelve a intentarlo.
              </ErrorState>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div className={styles.centered}>
                <LoadingIndicator label="Cargando el mapa…" />
              </div>
            }
          >
            <MapViewport
              key={mapAttempt}
              basemap={basemaps[basemapId]}
              region={draft?.region ?? null}
              focus={focus}
              drawMode={drawMode}
              onPickPoint={(point: GeoPoint) => {
                placeCenter(point, 'map');
              }}
              onMoveCenter={(point: GeoPoint) => {
                placeCenter(point, 'map', draft?.source === 'search' ? draft.name : undefined);
              }}
              onDrawRegion={(region) => {
                setDraftRegion(region, 'drawn');
              }}
              onDrawEnd={() => {
                setDrawMode(false);
              }}
              onRetry={() => {
                setMapAttempt((value) => value + 1);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </main>
      {confirming && draft !== null ? (
        <ConfirmSiteDialog
          draft={draft}
          disclaimer={preset?.disclaimer ?? null}
          error={saveError}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}
