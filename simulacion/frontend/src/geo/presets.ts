/**
 * Regiones predefinidas reproducibles. La región demostrativa es la referencia principal de
 * desarrollo; su ubicación se verificó con fuentes abiertas independientes (ver `verification`).
 */
import { createRegion, type RectangularRegion } from './region.ts';
import { geoPoint } from './wgs84.ts';

export interface VerificationRecord {
  readonly source: string;
  readonly detail: string;
  readonly url: string;
  readonly checkedOn: string;
}

export interface RegionPreset {
  readonly id: string;
  readonly name: string;
  readonly locality: string;
  readonly description: string;
  /** Aclaración obligatoria: una región demostrativa no es una propiedad real. */
  readonly disclaimer: string;
  readonly region: RectangularRegion;
  readonly verification: readonly VerificationRecord[];
}

export const COCHABAMBA_DEMO_PRESET: RegionPreset = {
  id: 'cochabamba-valle-alto-demo',
  name: 'Valle Alto de Cochabamba',
  locality: 'A unos 3,1 km al oeste-suroeste de Punata · departamento de Cochabamba, Bolivia',
  description:
    'Rectángulo de 400 × 300 m (12 ha) orientado al norte, dentro de una zona de uso agrícola del Valle Alto.',
  disclaimer:
    'Región demostrativa para el desarrollo. No corresponde a ninguna propiedad, parcela catastral ni explotación agrícola real.',
  region: createRegion(geoPoint(-17.551334, -65.861983), 400, 300, 0),
  verification: [
    {
      source: 'OpenStreetMap (ODbL)',
      detail:
        'Los cuatro vértices están dentro del área cartografiada como landuse=farmland (vía 723914107), al menos a 281 m de su borde. Consulta a la API Overpass con datos del 2026-11-14T19:54Z.',
      url: 'https://www.openstreetmap.org/way/723914107',
      checkedOn: '2026-11-14',
    },
    {
      source: 'ESA WorldCover 10 m 2021 v200 (CC BY 4.0)',
      detail:
        'El 99,5 % de los 1564 píxeles de 10 m que cubren el rectángulo son «cultivos» (clase 40); el 0,5 % restante, pastizal. En un entorno de 2 × 2 km, el 87,9 % son cultivos.',
      url: 'https://esa-worldcover.org/',
      checkedOn: '2026-11-14',
    },
    {
      source: 'GeoNames (CC BY 4.0)',
      detail:
        'Localidades más cercanas: Punata a 3,06 km, Cliza a 8,51 km y Arani a 10,07 km (distancias geodésicas desde el centro).',
      url: 'https://www.geonames.org/3907080',
      checkedOn: '2026-11-14',
    },
  ],
};

export const REGION_PRESETS: readonly RegionPreset[] = [COCHABAMBA_DEMO_PRESET];

export function findPreset(id: string): RegionPreset | undefined {
  return REGION_PRESETS.find((preset) => preset.id === id);
}
