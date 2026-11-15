import { create } from 'zustand';

import type { SimulationScenario, SimulationState } from '../domain';

/**
 * Espejo en el cliente del estado de la simulación (ADR-004). El motor autoritativo
 * vive en el backend; este store solo contendrá instantáneas recibidas de la API.
 *
 * En la Fase 01 no existe motor ni escenarios: ambos valores son `null` y la UI
 * muestra estados vacíos explícitos en lugar de datos inventados.
 */
interface SimulationStore {
  readonly scenario: SimulationScenario | null;
  readonly snapshot: SimulationState | null;
}

export const useSimulationStore = create<SimulationStore>()(() => ({
  scenario: null,
  snapshot: null,
}));
