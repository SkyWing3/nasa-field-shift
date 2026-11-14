import { create } from 'zustand';

import type { AssetCatalog } from '../assets';
import type { WorldViewId } from '../camera/worldCamera';
import type { GeneratedWorld, StageEvent, StageStatus } from '../world/generate';
import type { StageId } from '../world/pipeline';
import { DEFAULT_WORLD_QUALITY, type WorldQualityId } from '../world/quality';

export interface StageState {
  readonly status: StageStatus;
  readonly durationMs: number | null;
  readonly detail: string | null;
}

export interface TerrainSelection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Altura del terreno (m sobre el geoide si la fuente es NASADEM). */
  readonly elevationM: number;
  readonly slopeDeg: number;
  readonly landCover: string;
  readonly insideFarm: boolean;
  readonly nearestFeature: string | null;
}

export interface RenderStats {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly vegetationVisible: number;
  readonly impostors: number;
}

export type WorldStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface WorldError {
  readonly kind: string;
  readonly message: string;
  readonly failedSources: readonly string[];
}

interface WorldStore {
  readonly status: WorldStatus;
  readonly stages: Readonly<Partial<Record<StageId, StageState>>>;
  readonly world: GeneratedWorld | null;
  readonly catalog: AssetCatalog | null;
  readonly error: WorldError | null;
  /** HDRI del catálogo usado como cielo (ambientación visual, no clima real). */
  readonly skyId: string;
  readonly quality: WorldQualityId;
  readonly selection: TerrainSelection | null;
  readonly showOsm: boolean;
  readonly showRegion: boolean;
  readonly viewRequest: { readonly view: WorldViewId; readonly token: number } | null;
  readonly stats: RenderStats | null;
  begin: () => void;
  stage: (event: StageEvent) => void;
  succeed: (world: GeneratedWorld, catalog: AssetCatalog) => void;
  setSky: (skyId: string) => void;
  fail: (error: WorldError) => void;
  sceneReady: (durationMs: number, detail: string) => void;
  setQuality: (quality: WorldQualityId) => void;
  select: (selection: TerrainSelection | null) => void;
  toggleOsm: () => void;
  toggleRegion: () => void;
  requestView: (view: WorldViewId) => void;
  setStats: (stats: RenderStats) => void;
  reset: () => void;
}

const QUALITY_KEY = 'terralab.worldQuality';
export const DEFAULT_SKY = 'kloofendal_43d_clear_puresky';

function storedQuality(): WorldQualityId {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value === 'low' || value === 'medium' || value === 'high'
      ? value
      : DEFAULT_WORLD_QUALITY;
  } catch {
    return DEFAULT_WORLD_QUALITY;
  }
}

export const useWorldStore = create<WorldStore>()((set) => ({
  status: 'idle',
  stages: {},
  world: null,
  catalog: null,
  error: null,
  skyId: DEFAULT_SKY,
  quality: storedQuality(),
  selection: null,
  showOsm: false,
  showRegion: true,
  viewRequest: null,
  stats: null,
  begin: () => {
    set({
      status: 'generating',
      stages: {},
      world: null,
      error: null,
      selection: null,
      stats: null,
    });
  },
  stage: (event) => {
    set((state) => ({
      stages: {
        ...state.stages,
        [event.stage]: {
          status: event.status,
          durationMs: event.durationMs ?? null,
          detail: event.detail ?? null,
        },
      },
    }));
  },
  setSky: (skyId) => {
    set({ skyId });
  },
  succeed: (world, catalog) => {
    set((state) => ({
      world,
      catalog,
      stages: { ...state.stages, scene: { status: 'running', durationMs: null, detail: null } },
    }));
  },
  fail: (error) => {
    set({ status: 'error', error });
  },
  sceneReady: (durationMs, detail) => {
    set((state) => ({
      status: 'ready',
      stages: { ...state.stages, scene: { status: 'done', durationMs, detail } },
    }));
  },
  setQuality: (quality) => {
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      // Preferencia no persistente (modo privado): se ignora.
    }
    set({ quality });
  },
  select: (selection) => {
    set({ selection });
  },
  toggleOsm: () => {
    set((state) => ({ showOsm: !state.showOsm }));
  },
  toggleRegion: () => {
    set((state) => ({ showRegion: !state.showRegion }));
  },
  requestView: (view) => {
    set((state) => ({ viewRequest: { view, token: (state.viewRequest?.token ?? 0) + 1 } }));
  },
  setStats: (stats) => {
    set({ stats });
  },
  reset: () => {
    set({
      status: 'idle',
      stages: {},
      world: null,
      error: null,
      selection: null,
      viewRequest: null,
      stats: null,
    });
  },
}));
