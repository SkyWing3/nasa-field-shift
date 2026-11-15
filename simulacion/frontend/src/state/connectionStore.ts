import { create } from 'zustand';

import type { HealthResponse } from '../simulation-client';

export type ApiConnection =
  | { readonly status: 'unknown' }
  | {
      readonly status: 'online';
      readonly version: string;
      readonly environment: string;
      readonly checkedAt: number;
    }
  | { readonly status: 'offline'; readonly message: string; readonly checkedAt: number };

interface ConnectionStore {
  readonly api: ApiConnection;
  /** Hay una comprobación en curso. Se mantiene aparte para no perder el último estado conocido. */
  readonly isChecking: boolean;
  markChecking: () => void;
  markOnline: (health: HealthResponse, checkedAt: number) => void;
  markOffline: (message: string, checkedAt: number) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  api: { status: 'unknown' },
  isChecking: false,
  markChecking: () => {
    set({ isChecking: true });
  },
  markOnline: (health, checkedAt) => {
    set({
      isChecking: false,
      api: {
        status: 'online',
        version: health.version,
        environment: health.environment,
        checkedAt,
      },
    });
  },
  markOffline: (message, checkedAt) => {
    set({ isChecking: false, api: { status: 'offline', message, checkedAt } });
  },
}));
