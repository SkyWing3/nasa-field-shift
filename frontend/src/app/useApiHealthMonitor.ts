import { useEffect } from 'react';

import { refreshApiHealth } from './services';

const HEALTH_POLL_INTERVAL_MS = 30_000;

/** Comprueba la API al montar y periódicamente mientras la aplicación está abierta. */
export function useApiHealthMonitor(intervalMs: number = HEALTH_POLL_INTERVAL_MS): void {
  useEffect(() => {
    void refreshApiHealth();
    const timer = window.setInterval(() => {
      void refreshApiHealth();
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}
