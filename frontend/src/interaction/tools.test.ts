import { describe, expect, it } from 'vitest';

import { FARM_TOOLS, isToolAvailable } from './tools';

describe('catálogo de herramientas', () => {
  it('tiene identificadores únicos', () => {
    const ids = FARM_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no habilita herramientas sin implementación en la Fase 01', () => {
    for (const tool of FARM_TOOLS) {
      expect(isToolAvailable(tool.id)).toBe(false);
    }
  });
});
