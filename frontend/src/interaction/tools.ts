/**
 * Catálogo de herramientas agrícolas del panel lateral.
 *
 * Las herramientas traducen gestos del usuario en *comandos* hacia el estado de la
 * simulación (ADR-002); nunca mutan datos directamente. En la Fase 01 solo existe el
 * catálogo: todas están marcadas como `planned` y su lógica llegará en fases
 * posteriores.
 */

export type FarmToolId = 'prepare-soil' | 'sow' | 'irrigate' | 'harvest';

export type FarmToolAvailability = 'available' | 'planned';

export interface FarmToolDefinition {
  readonly id: FarmToolId;
  readonly label: string;
  readonly description: string;
  readonly availability: FarmToolAvailability;
}

export const FARM_TOOLS: readonly FarmToolDefinition[] = [
  {
    id: 'prepare-soil',
    label: 'Preparar suelo',
    description: 'Labranza y preparación del lecho de siembra de una parcela.',
    availability: 'planned',
  },
  {
    id: 'sow',
    label: 'Sembrar',
    description: 'Elegir cultivo, fecha y densidad de siembra.',
    availability: 'planned',
  },
  {
    id: 'irrigate',
    label: 'Regar',
    description: 'Aplicar una lámina de riego a una parcela.',
    availability: 'planned',
  },
  {
    id: 'harvest',
    label: 'Cosechar',
    description: 'Cosechar un cultivo maduro y registrar el rendimiento.',
    availability: 'planned',
  },
];

export function isToolAvailable(toolId: FarmToolId): boolean {
  return FARM_TOOLS.some((tool) => tool.id === toolId && tool.availability === 'available');
}
