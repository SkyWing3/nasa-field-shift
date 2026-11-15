import { create } from 'zustand';

/**
 * Pantallas de primer nivel. Flujo principal (fase 03):
 * inicio → mapa (ubicación y región) → preparación de la granja → mundo 3D (fase 04).
 */
export type AppScreen = 'start' | 'location' | 'farm' | 'world' | 'workspace';

interface AppStore {
  readonly screen: AppScreen;
  openLocation: () => void;
  openFarm: () => void;
  openWorld: () => void;
  enterWorkspace: () => void;
  returnToStart: () => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  screen: 'start',
  openLocation: () => {
    set({ screen: 'location' });
  },
  openFarm: () => {
    set({ screen: 'farm' });
  },
  openWorld: () => {
    set({ screen: 'world' });
  },
  enterWorkspace: () => {
    set({ screen: 'workspace' });
  },
  returnToStart: () => {
    set({ screen: 'start' });
  },
}));
