import { create } from 'zustand';

import type { LodMode } from './scene/lod';
import type { ViewMode } from './scene/viewModes';

export type InspectorTab = 'info' | 'materials' | 'lighting' | 'performance';
export type BackgroundMode = 'hdri' | 'blurred' | 'neutral';

export interface LightingSettings {
  readonly hdriId: string | null;
  readonly hdriResolution: '1k' | '2k';
  readonly environmentIntensity: number;
  readonly rotationDeg: number;
  readonly exposure: number;
  readonly background: BackgroundMode;
  readonly sunEnabled: boolean;
  readonly sunElevationDeg: number;
  readonly sunAzimuthDeg: number;
  readonly sunIntensity: number;
}

export const DEFAULT_LIGHTING: LightingSettings = {
  hdriId: null,
  hdriResolution: '1k',
  environmentIntensity: 1,
  rotationDeg: 0,
  exposure: 1,
  background: 'hdri',
  sunEnabled: false,
  sunElevationDeg: 45,
  sunAzimuthDeg: 135,
  sunIntensity: 3,
};

export type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly startedAt: number }
  | { readonly status: 'ready'; readonly loadMs: number }
  | { readonly status: 'error'; readonly message: string };

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly lodLevel: number | null;
}

export type FpsMeasurement =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | {
      readonly status: 'done';
      readonly fps: number;
      readonly frameMs: number;
      readonly frames: number;
    };

interface ViewerState {
  readonly selectedId: string | null;
  readonly attempt: number;
  readonly tab: InspectorTab;
  readonly viewMode: ViewMode;
  readonly lodMode: LodMode;
  readonly autoRotate: boolean;
  readonly showGrid: boolean;
  readonly materialResolution: number;
  readonly displacement: boolean;
  readonly lighting: LightingSettings;
  readonly load: LoadState;
  readonly stats: RenderStats | null;
  readonly fps: FpsMeasurement;
  readonly cameraResetToken: number;
  readonly stageRadius: number;

  select: (id: string | null, loads: boolean) => void;
  retry: () => void;
  setTab: (tab: InspectorTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setLodMode: (mode: LodMode) => void;
  setAutoRotate: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  setMaterialResolution: (value: number) => void;
  setDisplacement: (value: boolean) => void;
  updateLighting: (patch: Partial<LightingSettings>) => void;
  finishLoading: () => void;
  failLoading: (message: string) => void;
  setStats: (stats: RenderStats) => void;
  startFps: () => void;
  finishFps: (result: { fps: number; frameMs: number; frames: number }) => void;
  resetCamera: () => void;
  setStageRadius: (radius: number) => void;
}

const loadingNow = (): LoadState => ({ status: 'loading', startedAt: performance.now() });

export const useViewerStore = create<ViewerState>()((set, get) => ({
  selectedId: null,
  attempt: 0,
  tab: 'info',
  viewMode: 'pbr',
  lodMode: 'auto',
  autoRotate: false,
  showGrid: true,
  materialResolution: 2048,
  displacement: true,
  lighting: DEFAULT_LIGHTING,
  load: { status: 'idle' },
  stats: null,
  fps: { status: 'idle' },
  cameraResetToken: 0,
  stageRadius: 1,

  select: (id, loads) => {
    set({
      selectedId: id,
      viewMode: 'pbr',
      lodMode: 'auto',
      load: loads ? loadingNow() : { status: 'idle' },
      stats: null,
      fps: { status: 'idle' },
    });
  },
  retry: () => {
    set((state) => ({ attempt: state.attempt + 1, load: loadingNow() }));
  },
  setTab: (tab) => {
    set({ tab });
  },
  setViewMode: (viewMode) => {
    set({ viewMode });
  },
  setLodMode: (lodMode) => {
    set({ lodMode });
  },
  setAutoRotate: (autoRotate) => {
    set({ autoRotate });
  },
  setShowGrid: (showGrid) => {
    set({ showGrid });
  },
  setMaterialResolution: (materialResolution) => {
    set({ materialResolution, load: loadingNow() });
  },
  setDisplacement: (displacement) => {
    set({ displacement });
  },
  updateLighting: (patch) => {
    set((state) => ({ lighting: { ...state.lighting, ...patch } }));
  },
  finishLoading: () => {
    const { load } = get();
    if (load.status !== 'loading') return;
    set({ load: { status: 'ready', loadMs: performance.now() - load.startedAt } });
  },
  failLoading: (message) => {
    set({ load: { status: 'error', message } });
  },
  setStats: (stats) => {
    set({ stats });
  },
  startFps: () => {
    set({ fps: { status: 'running' } });
  },
  finishFps: (result) => {
    set({ fps: { status: 'done', ...result } });
  },
  resetCamera: () => {
    set((state) => ({ cameraResetToken: state.cameraResetToken + 1 }));
  },
  setStageRadius: (stageRadius) => {
    set({ stageRadius });
  },
}));
