import { create } from 'zustand';

import {
  COCHABAMBA_DEMO_PRESET,
  createRegion,
  type GeoPoint,
  type RectangularRegion,
  type RegionPreset,
} from '../geo';
import type { SavedSite, SiteSource } from '../persistence';

/** Región en edición en el mapa, todavía sin confirmar. */
export interface SiteDraft {
  readonly region: RectangularRegion;
  readonly name: string;
  readonly source: SiteSource;
  readonly presetId: string | null;
}

/** Tamaño inicial al elegir un centro sin región previa: el de la región demostrativa. */
export const DEFAULT_REGION_SIZE = {
  widthM: COCHABAMBA_DEMO_PRESET.region.widthM,
  lengthM: COCHABAMBA_DEMO_PRESET.region.lengthM,
} as const;

export interface RegionPatch {
  readonly widthM?: number;
  readonly lengthM?: number;
  readonly orientationDeg?: number;
}

interface SiteStore {
  readonly draft: SiteDraft | null;
  readonly saved: SavedSite | null;
  /** Aviso si el registro guardado no era válido y se descartó. */
  readonly loadWarning: string | null;

  hydrate: (saved: SavedSite | null, loadWarning?: string | null) => void;
  /** Coloca el centro conservando tamaño y orientación de la región actual. */
  placeCenter: (center: GeoPoint, source: SiteSource, name?: string) => void;
  setDraftRegion: (region: RectangularRegion, source: SiteSource, name?: string) => void;
  patchDraft: (patch: RegionPatch) => void;
  applyPreset: (preset: RegionPreset) => void;
  /** Abre el mapa con la región guardada para modificarla. */
  editSaved: () => void;
  clearDraft: () => void;
  setSaved: (site: SavedSite) => void;
}

const defaultName = (center: GeoPoint): string =>
  `Granja en ${center.latitude.toFixed(4)}, ${center.longitude.toFixed(4)}`;

export const useSiteStore = create<SiteStore>()((set, get) => ({
  draft: null,
  saved: null,
  loadWarning: null,

  hydrate: (saved, loadWarning = null) => {
    set({ saved, loadWarning, draft: null });
  },
  placeCenter: (center, source, name) => {
    const current = get().draft?.region;
    const region = createRegion(
      center,
      current?.widthM ?? DEFAULT_REGION_SIZE.widthM,
      current?.lengthM ?? DEFAULT_REGION_SIZE.lengthM,
      current?.orientationDeg ?? 0,
    );
    set({ draft: { region, source, presetId: null, name: name ?? defaultName(center) } });
  },
  setDraftRegion: (region, source, name) => {
    set({ draft: { region, source, presetId: null, name: name ?? defaultName(region.center) } });
  },
  patchDraft: (patch) => {
    const draft = get().draft;
    if (draft === null) return;
    const { region } = draft;
    set({
      draft: {
        ...draft,
        presetId: null,
        region: createRegion(
          region.center,
          patch.widthM ?? region.widthM,
          patch.lengthM ?? region.lengthM,
          patch.orientationDeg ?? region.orientationDeg,
        ),
      },
    });
  },
  applyPreset: (preset) => {
    set({
      draft: { region: preset.region, source: 'preset', presetId: preset.id, name: preset.name },
    });
  },
  editSaved: () => {
    const saved = get().saved;
    if (saved === null) return;
    set({
      draft: {
        region: saved.region,
        source: saved.source,
        presetId: saved.presetId,
        name: saved.name,
      },
    });
  },
  clearDraft: () => {
    set({ draft: null });
  },
  setSaved: (site) => {
    set({ saved: site, loadWarning: null });
  },
}));
