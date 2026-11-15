/**
 * Raíz de composición: instancia los servicios y los conecta con el estado global.
 * Es el único lugar que conoce a la vez el cliente HTTP y los stores.
 */

import { loadAppConfig } from '../config/env';
import { validateRegion } from '../geo';
import { createBasemaps } from '../map/basemaps';
import { createLocalSiteRepository, type SavedSite } from '../persistence';
import { createApiPlaceSearch } from '../place-search';
import { createSimulationClient, describeApiError } from '../simulation-client';
import { useConnectionStore, useSiteStore } from '../state';

export const appConfig = loadAppConfig(import.meta.env);

export const APP_VERSION = __APP_VERSION__;

export const simulationClient = createSimulationClient({ baseUrl: appConfig.apiBaseUrl });

let inFlightHealthCheck: Promise<void> | null = null;

/**
 * Comprueba la salud de la API y refleja el resultado en `connectionStore`.
 *
 * Las llamadas concurrentes comparten la misma petición en curso. La petición no se
 * cancela al desmontar componentes: su resultado es estado global y el cliente ya
 * aplica un tiempo límite, por lo que no puede quedar colgada.
 */
export function refreshApiHealth(): Promise<void> {
  inFlightHealthCheck ??= (async () => {
    useConnectionStore.getState().markChecking();
    try {
      const health = await simulationClient.getHealth();
      useConnectionStore.getState().markOnline(health, Date.now());
    } catch (error) {
      useConnectionStore.getState().markOffline(describeApiError(error), Date.now());
    } finally {
      inFlightHealthCheck = null;
    }
  })();
  return inFlightHealthCheck;
}

// ── Ubicación de la granja (fase 03) ─────────────────────────────────────────────────────────

export const placeSearch = createApiPlaceSearch(simulationClient);

export const basemaps = createBasemaps(appConfig);

export const siteRepository = createLocalSiteRepository();

/** Carga la ubicación guardada antes del primer render. Un registro no válido se descarta. */
export function hydrateSavedSite(): void {
  const result = siteRepository.load();
  if (result.status === 'invalid') {
    siteRepository.clear();
    useSiteStore
      .getState()
      .hydrate(null, `Se descartó una ubicación guardada no válida (${result.reason}).`);
    return;
  }
  useSiteStore.getState().hydrate(result.status === 'ok' ? result.site : null);
}

/**
 * Confirma la región en edición: la guarda y fija el origen del marco local en su centro.
 * Lanza `SitePersistenceError` si el navegador no permite guardar.
 */
export function confirmDraftSite(name: string): SavedSite {
  const { draft } = useSiteStore.getState();
  if (draft === null) throw new Error('No hay ninguna región en edición');
  const problems = validateRegion(draft.region);
  if (problems.length > 0) throw new Error(`Región no válida: ${problems.join(', ')}`);
  const site: SavedSite = {
    name: name.trim(),
    source: draft.source,
    presetId: draft.presetId,
    region: draft.region,
    frameOrigin: draft.region.center,
    confirmedAt: new Date().toISOString(),
  };
  siteRepository.save(site);
  useSiteStore.getState().setSaved(site);
  useSiteStore.getState().clearDraft();
  return site;
}
