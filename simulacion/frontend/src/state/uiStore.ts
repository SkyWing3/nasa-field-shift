import { create } from 'zustand';

import type { FarmToolId } from '../interaction';

interface UiStore {
  readonly activeToolId: FarmToolId | null;
  setActiveTool: (toolId: FarmToolId | null) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  activeToolId: null,
  setActiveTool: (toolId) => {
    set({ activeToolId: toolId });
  },
}));
