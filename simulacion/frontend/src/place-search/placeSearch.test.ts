import { describe, expect, it, vi } from 'vitest';

import { ApiError, createSimulationClient, type SimulationClient } from '../simulation-client';
import {
  countryName,
  createApiPlaceSearch,
  type PlaceSearchProvider,
  PlaceSearchError,
  searchPlaces,
} from './index';

const PUNATA = {
  id: 'geonames:3907080',
  name: 'Punata',
  region: 'Cochabamba',
  countryCode: 'BO',
  latitude: -17.54234,
  longitude: -65.83472,
  kind: 'populated-place' as const,
  population: 15194,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('búsqueda de lugares', () => {
  it('resuelve coordenadas escritas sin consultar al proveedor', async () => {
    const search = vi.fn<PlaceSearchProvider['search']>();
    const provider: PlaceSearchProvider = { availability: vi.fn(), search };
    const [result] = await searchPlaces(' -17.551334, -65.861983 ', provider);
    expect(result?.kind).toBe('coordinates');
    expect(result?.point.latitude).toBe(-17.551334);
    expect(search).not.toHaveBeenCalled();
  });

  it('exige al menos dos caracteres antes de llamar a la red', async () => {
    const search = vi.fn<PlaceSearchProvider['search']>();
    const provider: PlaceSearchProvider = { availability: vi.fn(), search };
    await expect(searchPlaces('a', provider)).rejects.toThrow(PlaceSearchError);
    expect(search).not.toHaveBeenCalled();
  });

  it('consulta la API y adapta los resultados (país en español)', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        provider: 'geonames',
        attribution: 'GeoNames (CC BY 4.0)',
        attributionUrl: 'https://www.geonames.org/',
        query: 'Punata',
        results: [PUNATA],
      }),
    );
    const client = createSimulationClient({ baseUrl: 'http://api.test', fetchFn });
    const [result] = await searchPlaces('Punata', createApiPlaceSearch(client, 4));
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'http://api.test/api/geocoding/search?q=Punata&limit=4',
    );
    expect(result).toMatchObject({
      name: 'Punata',
      detail: 'Cochabamba · Bolivia',
      kind: 'populated-place',
      zoom: 13,
    });
    expect(countryName('BO')).toBe('Bolivia');
    expect(countryName(null)).toBeNull();
  });

  it('muestra el motivo que envía el servidor cuando la búsqueda no está disponible', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { detail: 'El nomenclátor local no está generado: ejecuta «make geodata».' },
          503,
        ),
      );
    const client = createSimulationClient({ baseUrl: 'http://api.test', fetchFn });
    await expect(createApiPlaceSearch(client).search('Punata')).rejects.toThrow(/make geodata/);
  });

  it('traduce los errores de red a un mensaje comprensible', async () => {
    const client: SimulationClient = {
      getHealth: vi.fn(),
      getGeocodingInfo: vi.fn().mockRejectedValue(new ApiError('network', 'sin red')),
      searchPlaces: vi.fn().mockRejectedValue(new ApiError('timeout', 'lento')),
      getWorldDatasets: vi.fn(),
      getElevation: vi.fn(),
      getLandCover: vi.fn(),
      getWorldFeatures: vi.fn(),
    };
    const provider = createApiPlaceSearch(client);
    await expect(provider.availability()).rejects.toThrow(/No se pudo conectar/);
    await expect(provider.search('Punata')).rejects.toThrow(/no respondió a tiempo/);
  });

  it('rechaza respuestas fuera de contrato', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        provider: 'x',
        attribution: '',
        attributionUrl: '',
        query: 'q',
        results: [{ ...PUNATA, latitude: 123 }],
      }),
    );
    const client = createSimulationClient({ baseUrl: 'http://api.test', fetchFn });
    await expect(createApiPlaceSearch(client).search('Punata')).rejects.toThrow(
      /formato inesperado/,
    );
  });
});
