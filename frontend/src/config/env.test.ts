import { describe, expect, it } from 'vitest';

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_BASEMAP_STYLE_URL,
  DEFAULT_SATELLITE_TILES_URL,
  loadAppConfig,
  parseApiBaseUrl,
  parseSatelliteTilesUrl,
} from './env';

describe('parseApiBaseUrl', () => {
  it('usa el valor por defecto si la variable no está definida o está vacía', () => {
    expect(parseApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(parseApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('normaliza eliminando la barra final', () => {
    expect(parseApiBaseUrl('http://localhost:8000/')).toBe('http://localhost:8000');
    expect(parseApiBaseUrl('https://api.example.org/terralab/')).toBe(
      'https://api.example.org/terralab',
    );
  });

  it('rechaza URLs inválidas o con protocolos no HTTP', () => {
    expect(() => parseApiBaseUrl('localhost:8000')).toThrow(/http o https/);
    expect(() => parseApiBaseUrl('no es una url')).toThrow(/no es una URL válida/);
    expect(() => parseApiBaseUrl('ftp://example.org')).toThrow(/http o https/);
  });

  it('carga la configuración desde import.meta.env', () => {
    expect(loadAppConfig({ VITE_API_BASE_URL: 'http://127.0.0.1:9000' } as ImportMetaEnv)).toEqual({
      apiBaseUrl: 'http://127.0.0.1:9000',
      basemapStyleUrl: DEFAULT_BASEMAP_STYLE_URL,
      satelliteTilesUrl: DEFAULT_SATELLITE_TILES_URL,
    });
  });
});

describe('proveedores de mapa configurables', () => {
  it('permite cambiar de proveedor por variables de entorno', () => {
    const config = loadAppConfig({
      VITE_BASEMAP_STYLE_URL: 'https://tiles.example.org/style.json',
      VITE_SATELLITE_TILES_URL: 'https://img.example.org/{z}/{x}/{y}.jpg',
    } as ImportMetaEnv);
    expect(config.basemapStyleUrl).toBe('https://tiles.example.org/style.json');
    expect(config.satelliteTilesUrl).toBe('https://img.example.org/{z}/{x}/{y}.jpg');
  });

  it('exige HTTPS y plantillas XYZ completas', () => {
    expect(() =>
      loadAppConfig({ VITE_BASEMAP_STYLE_URL: 'http://tiles.example.org' } as ImportMetaEnv),
    ).toThrow(/https/);
    expect(() => parseSatelliteTilesUrl('https://img.example.org/{z}/{x}.jpg')).toThrow(/\{y\}/);
  });
});
