import { describe, expect, it } from 'vitest';

import { DEFAULT_BASEMAP_STYLE_URL, DEFAULT_SATELLITE_TILES_URL } from '../config/env';
import { COCHABAMBA_DEMO_PRESET, createRegion, geoPoint } from '../geo';
import { createBasemaps, EOX_ATTRIBUTION, SATELLITE_MAX_ZOOM } from './basemaps';
import { regionBounds, regionCollection, regionPolygon } from './regionGeoJson';

describe('polígono de la región para el mapa', () => {
  it('cierra el anillo con los cuatro vértices', () => {
    const ring = regionPolygon(COCHABAMBA_DEMO_PRESET.region).geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(regionCollection(null).features).toEqual([]);
  });

  it('mantiene continuo un rectángulo que cruza el antimeridiano', () => {
    const region = createRegion(geoPoint(-16.5, 179.999), 2_000, 1_000);
    const longitudes = (regionPolygon(region).geometry.coordinates[0] ?? []).map(
      ([lon = 0]) => lon,
    );
    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThan(0.1);
    expect(Math.max(...longitudes)).toBeGreaterThan(180);
  });

  it('calcula la caja envolvente para encuadrar', () => {
    const [[west, south], [east, north]] = regionBounds(COCHABAMBA_DEMO_PRESET.region);
    expect(west).toBeCloseTo(-65.863867, 5);
    expect(east).toBeCloseTo(-65.860099, 5);
    expect(south).toBeCloseTo(-17.552689, 5);
    expect(north).toBeCloseTo(-17.549979, 5);
  });
});

describe('proveedores de mapa base', () => {
  it('describe el mapa vectorial y la imagen de satélite con su atribución y zoom útil', () => {
    const basemaps = createBasemaps({
      basemapStyleUrl: DEFAULT_BASEMAP_STYLE_URL,
      satelliteTilesUrl: DEFAULT_SATELLITE_TILES_URL,
    });
    expect(basemaps.map.style).toBe(DEFAULT_BASEMAP_STYLE_URL);
    const style = basemaps.satellite.style;
    if (typeof style === 'string') throw new Error('se esperaba un estilo en línea');
    const source = style.sources.satellite;
    expect(source).toMatchObject({
      type: 'raster',
      maxzoom: SATELLITE_MAX_ZOOM,
      attribution: EOX_ATTRIBUTION,
      tiles: [DEFAULT_SATELLITE_TILES_URL],
    });
    expect(EOX_ATTRIBUTION).toMatch(/Copernicus Sentinel 2016/);
    expect(EOX_ATTRIBUTION).toMatch(/EOX::Maps/);
  });
});
