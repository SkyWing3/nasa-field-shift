import { create } from 'zustand';

export type SceneErrorReason = 'webgl-unsupported' | 'context-lost' | 'render-error';

/** Ciclo de vida del lienzo 3D. Independiente del estado de la simulación. */
export type SceneStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'initializing' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly reason: SceneErrorReason; readonly message: string };

interface SceneStore {
  readonly status: SceneStatus;
  beginInitialization: () => void;
  markReady: () => void;
  fail: (reason: SceneErrorReason, message: string) => void;
  reset: () => void;
}

export const useSceneStore = create<SceneStore>()((set, get) => ({
  status: { kind: 'idle' },
  beginInitialization: () => {
    set({ status: { kind: 'initializing' } });
  },
  markReady: () => {
    // Un error ya registrado (p. ej. contexto perdido) no debe quedar oculto por
    // un "listo" tardío; solo se sale del error con un reinicio explícito.
    if (get().status.kind === 'error') return;
    set({ status: { kind: 'ready' } });
  },
  fail: (reason, message) => {
    set({ status: { kind: 'error', reason, message } });
  },
  reset: () => {
    set({ status: { kind: 'idle' } });
  },
}));
