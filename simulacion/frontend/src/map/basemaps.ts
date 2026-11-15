/**
 * Adaptadores de mapa base. Cada proveedor es un dato (estilo MapLibre + atribución): cambiar de
 * proveedor no requiere reescribir la interfaz. Políticas revisadas el 2026-11-14 (ADR-027).
 *
 * - OpenFreeMap: instancia pública gratuita, sin claves ni límites de vistas; datos OpenStreetMap
 *   (ODbL). MapLibre añade su atribución automáticamente desde el TileJSON.
 * - EOX Sentinel-2 cloudless 2016: imagen sin nubes a 10 m, CC BY 4.0. EOX permite usar sus mapas
 *   en aplicaciones pidiendo atribución y un enlace a EOX::Maps. Las ediciones de 2018 en adelante
 *   son CC BY-NC-SA (no comerciales), por eso se usa la de 2016.
 */
import type { StyleSpecification } from 'maplibre-gl';

export type BasemapId = 'map' | 'satellite';

export interface BasemapProvider {
  readonly id: BasemapId;
  readonly label: string;
  readonly description: string;
  readonly style: string | StyleSpecification;
}

/** Sentinel-2 tiene 10 m de resolución: más allá del zoom 15 solo se amplían píxeles. */
export const SATELLITE_MAX_ZOOM = 15;

export const EOX_ATTRIBUTION =
  '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> por ' +
  '<a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> ' +
  '(contiene datos modificados de Copernicus Sentinel 2016, CC BY 4.0) · ' +
  '<a href="https://maps.eox.at" target="_blank" rel="noopener">EOX::Maps</a>';

export function createBasemaps(config: {
  readonly basemapStyleUrl: string;
  readonly satelliteTilesUrl: string;
}): Readonly<Record<BasemapId, BasemapProvider>> {
  return {
    map: {
      id: 'map',
      label: 'Mapa',
      description: 'OpenFreeMap · datos de OpenStreetMap',
      style: config.basemapStyleUrl,
    },
    satellite: {
      id: 'satellite',
      label: 'Satélite 2016',
      description:
        'Sentinel-2 sin nubes de 2016 (EOX) · 10 m por píxel: a mucho zoom se ve borrosa',
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [config.satelliteTilesUrl],
            tileSize: 256,
            maxzoom: SATELLITE_MAX_ZOOM,
            attribution: EOX_ATTRIBUTION,
          },
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
      },
    },
  };
}
