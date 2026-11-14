import { describe, expect, it } from 'vitest';

import { COCHABAMBA_DEMO_PRESET } from '../geo';
import {
  createLocalSiteRepository,
  parseSavedSite,
  type SavedSite,
  SITE_SCHEMA_VERSION,
  SITE_STORAGE_KEY,
  SitePersistenceError,
} from './siteRepository';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const SITE: SavedSite = {
  name: 'Valle Alto de Cochabamba',
  source: 'preset',
  presetId: COCHABAMBA_DEMO_PRESET.id,
  region: COCHABAMBA_DEMO_PRESET.region,
  frameOrigin: COCHABAMBA_DEMO_PRESET.region.center,
  confirmedAt: '2026-11-14T16:00:00.000Z',
};

describe('repositorio local de la ubicación', () => {
  it('guarda y recupera la ubicación con su región y origen', () => {
    const repository = createLocalSiteRepository(new MemoryStorage());
    expect(repository.load()).toEqual({ status: 'empty' });
    repository.save(SITE);
    expect(repository.load()).toEqual({ status: 'ok', site: SITE });
    repository.clear();
    expect(repository.load()).toEqual({ status: 'empty' });
  });

  it('descarta registros corruptos, de otra versión o fuera de límites', () => {
    const storage = new MemoryStorage();
    const repository = createLocalSiteRepository(storage);
    storage.setItem(SITE_STORAGE_KEY, '{no es json');
    expect(repository.load()).toEqual({ status: 'invalid', reason: 'JSON no válido' });
    storage.setItem(SITE_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, site: SITE }));
    expect(repository.load()).toMatchObject({ status: 'invalid', reason: 'versión desconocida' });
    const tooLarge = { ...SITE, region: { ...SITE.region, widthM: 50_000 } };
    storage.setItem(
      SITE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SITE_SCHEMA_VERSION, site: tooLarge }),
    );
    expect(repository.load()).toMatchObject({
      status: 'invalid',
      reason: 'región fuera de límites',
    });
  });

  it('valida coordenadas, origen, nombre y fecha', () => {
    const wrap = (site: unknown) => ({ schemaVersion: SITE_SCHEMA_VERSION, site });
    expect(parseSavedSite(wrap({ ...SITE, name: ' ' }))).toBe('nombre no válido');
    expect(parseSavedSite(wrap({ ...SITE, confirmedAt: 'ayer' }))).toBe('fecha no válida');
    expect(parseSavedSite(wrap({ ...SITE, frameOrigin: { latitude: 120, longitude: 0 } }))).toBe(
      'coordenadas no válidas',
    );
    expect(parseSavedSite(wrap({ ...SITE, source: 'satélite' }))).toBe('origen no válido');
  });

  it('informa con un error claro si el navegador no permite guardar', () => {
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new DOMException('Cuota superada', 'QuotaExceededError');
    };
    expect(() => {
      createLocalSiteRepository(full).save(SITE);
    }).toThrow(SitePersistenceError);
    expect(() => {
      createLocalSiteRepository(null).save(SITE);
    }).toThrow(/no está disponible/);
    expect(createLocalSiteRepository(null).load()).toEqual({ status: 'empty' });
  });
});
