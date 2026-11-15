import { describe, expect, it } from 'vitest';

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_COMPARATOR_URL,
  DEV_COMPARATOR_URL,
  DEFAULT_BASEMAP_STYLE_URL,
  DEFAULT_SATELLITE_TILES_URL,
  loadAppConfig,
  parseApiBaseUrl,
  parseSatelliteTilesUrl,
  withLanguage,
} from './env';

describe('parseApiBaseUrl', () => {
  it('usa el valor por defecto si la variable no está definida o está vacía', () => {
    expect(parseApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(parseApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('usa el mismo origen de la página al dejar la URL vacía o indicar la raíz', () => {
    expect(loadAppConfig({} as ImportMetaEnv).apiBaseUrl).toBe('');
    expect(parseApiBaseUrl('')).toBe('');
    expect(parseApiBaseUrl('/')).toBe('');
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
      comparatorUrl: DEFAULT_COMPARATOR_URL,
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

describe('comparador de rotaciones', () => {
  it('usa el comparador publicado por defecto y acepta otro https', () => {
    expect(loadAppConfig({} as ImportMetaEnv).comparatorUrl).toBe(DEFAULT_COMPARATOR_URL);
    expect(
      loadAppConfig({ VITE_RAIZ_COMPARADOR_URL: 'https://raiz.example.org/' } as ImportMetaEnv)
        .comparatorUrl,
    ).toBe('https://raiz.example.org/');
  });

  it('rechaza un comparador sin https', () => {
    expect(() =>
      loadAppConfig({ VITE_RAIZ_COMPARADOR_URL: 'http://raiz.example.org/' } as ImportMetaEnv),
    ).toThrow(/VITE_RAIZ_COMPARADOR_URL debe ser una URL https/);
  });

  it('en desarrollo abre el beta-frontend local y admite http solo en localhost', () => {
    expect(loadAppConfig({ DEV: true } as ImportMetaEnv).comparatorUrl).toBe(DEV_COMPARATOR_URL);
    expect(
      loadAppConfig({ VITE_RAIZ_COMPARADOR_URL: 'http://127.0.0.1:4173/' } as ImportMetaEnv)
        .comparatorUrl,
    ).toBe('http://127.0.0.1:4173/');
  });

  it('pasa el idioma a la otra aplicación', () => {
    expect(withLanguage('http://localhost:5175/', 'qu')).toBe('http://localhost:5175/?idioma=qu');
    expect(withLanguage('https://x.org/a/?vista=clima', 'ay')).toBe(
      'https://x.org/a/?vista=clima&idioma=ay',
    );
  });
});
