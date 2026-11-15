import { describe, expect, it } from 'vitest';

import { quantity } from '../domain/units.ts';
import { formatArea, formatAzimuth, formatDms, formatLength } from './format.ts';
import { geodesicInverse, geodesicPolygon } from './geodesic.ts';
import { createLocalFrame, tangentPlaneDrop } from './localFrame.ts';
import { parseCoordinates } from './parse.ts';
import { COCHABAMBA_DEMO_PRESET } from './presets.ts';
import { regionMetrics } from './metrics.ts';
import {
  clampRegion,
  createRegion,
  regionCornersEnu,
  regionFromDiagonal,
  validateRegion,
} from './region.ts';
import {
  ecefToGeodetic,
  type GeodeticPosition,
  geodeticToEcef,
  geoPoint,
  normalizeLongitude,
  WGS84,
  WGS84_E2,
} from './wgs84.ts';

const position = (latitude: number, longitude: number, height = 0): GeodeticPosition => ({
  ...geoPoint(latitude, longitude),
  heightM: quantity(height, 'm'),
});

describe('WGS84 y ECEF', () => {
  it('sitúa el ecuador y el polo en los semiejes del elipsoide', () => {
    const equator = geodeticToEcef(position(0, 0));
    expect(equator.x).toBeCloseTo(WGS84.a, 6);
    expect(equator.y).toBeCloseTo(0, 6);
    const pole = geodeticToEcef(position(90, 0));
    // Semieje menor b = a(1 − f) = 6 356 752,314 2 m (NGA TR8350.2).
    expect(pole.z).toBeCloseTo(6_356_752.3142, 3);
  });

  it('ida y vuelta geodésica ↔ ECEF sin error apreciable, también cerca de los polos', () => {
    for (const [lat, lon, h] of [
      [-17.551334, -65.861983, 2_750],
      [89.999, 120, 10],
      [-89.5, -45, 0],
      [45, 179.999, -100],
      [0, 0, 8_000],
    ] as const) {
      const back = ecefToGeodetic(geodeticToEcef(position(lat, lon, h)));
      expect(back.latitude).toBeCloseTo(lat, 10);
      expect(normalizeLongitude(back.longitude)).toBeCloseTo(lon, 10);
      expect(back.heightM).toBeCloseTo(h, 5);
    }
  });

  it('normaliza longitudes a (−180, 180]', () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-180)).toBe(180);
    expect(normalizeLongitude(540)).toBe(180);
  });
});

describe('marco local ENU y ejes de la escena', () => {
  const frame = createLocalFrame(COCHABAMBA_DEMO_PRESET.region.center);

  it('pone el origen en (0, 0, 0)', () => {
    const origin = frame.toEnu(frame.origin);
    expect(Math.hypot(origin.east, origin.north, origin.up)).toBeLessThan(1e-6);
  });

  it('usa +X este, +Y arriba y −Z norte en Three.js', () => {
    const east = frame.fromEnu({ east: 1_000, north: 0, up: 0 });
    const north = frame.fromEnu({ east: 0, north: 1_000, up: 0 });
    const [ex, , ez] = frame.toScene(east);
    const [nx, , nz] = frame.toScene(north);
    expect(ex).toBeCloseTo(1_000, 6);
    expect(ez).toBeCloseTo(0, 6);
    expect(nx).toBeCloseTo(0, 6);
    expect(nz).toBeCloseTo(-1_000, 6);
    expect(frame.toScene(frame.fromScene([12, 34, -56]))[1]).toBeCloseTo(34, 6);
  });

  it('coincide con las geodésicas de GeographicLib en distancia y rumbo', () => {
    for (const [east, north, azimuth] of [
      [1_000, 0, 90],
      [0, 1_000, 0],
      [-2_500, 0, 270],
      [0, -2_500, 180],
      // Vértice más lejano de la región máxima permitida (5 × 5 km): 3 536 m del centro.
      [2_500, 2_500, 45],
      [-2_500, -2_500, 225],
    ] as const) {
      const target = frame.fromEnu({ east, north, up: 0 });
      const segment = geodesicInverse(frame.origin, target);
      const planar = Math.hypot(east, north);
      // Error relativo del plano tangente en horizontal < 1e-6 (1 ppm) a estas distancias.
      expect(Math.abs(segment.distanceM - planar) / planar).toBeLessThan(1e-6);
      expect(Math.abs(((segment.azimuthDeg - azimuth + 540) % 360) - 180)).toBeLessThan(1e-6);
    }
  });

  it('mantiene el error horizontal por debajo de 1 ppm también a latitudes altas', () => {
    const north = createLocalFrame(geoPoint(70, 25));
    const corner = north.fromEnu({ east: 2_500, north: 2_500, up: 0 });
    const segment = geodesicInverse(north.origin, corner);
    expect(
      Math.abs(segment.distanceM - Math.hypot(2_500, 2_500)) / Math.hypot(2_500, 2_500),
    ).toBeLessThan(1e-6);
  });

  it('ida y vuelta ENU ↔ geodésicas con error submilimétrico a 5 km', () => {
    const enu = { east: 3_500, north: -3_500, up: 12 };
    const back = frame.toEnu(frame.fromEnu(enu));
    expect(back.east).toBeCloseTo(enu.east, 6);
    expect(back.north).toBeCloseTo(enu.north, 6);
    expect(back.up).toBeCloseTo(enu.up, 6);
  });

  it('cuantifica la caída de la superficie bajo el plano tangente', () => {
    expect(tangentPlaneDrop(1_000)).toBeCloseTo(0.0785, 4);
    expect(tangentPlaneDrop(5_000)).toBeCloseTo(1.962, 3);
  });
});

describe('áreas geodésicas', () => {
  it('reproduce el área analítica de un octante del elipsoide WGS84', () => {
    const { a } = WGS84;
    const e = Math.sqrt(WGS84_E2);
    const b2 = a * a * (1 - WGS84_E2);
    // Superficie del elipsoide oblato: 2πa² + π(b²/e)·ln((1 + e)/(1 − e)).
    const total = 2 * Math.PI * a * a + Math.PI * (b2 / e) * Math.log((1 + e) / (1 - e));
    const octant = geodesicPolygon([geoPoint(0, 0), geoPoint(0, 90), geoPoint(90, 0)]);
    expect(Math.abs(octant.areaM2 - total / 8) / (total / 8)).toBeLessThan(1e-12);
  });
});

describe('región rectangular', () => {
  it('mide en el terreno lo mismo que en el plano local a cualquier latitud', () => {
    for (const latitude of [-17.55, 0, 45, 70]) {
      for (const [width, length, orientation] of [
        [400, 300, 0],
        [5_000, 5_000, 0],
        [1_200, 350, 33],
      ] as const) {
        const region = createRegion(geoPoint(latitude, -65.86), width, length, orientation);
        const metrics = regionMetrics(region);
        expect(Math.abs(metrics.areaM2 - width * length) / (width * length)).toBeLessThan(1e-6);
        const [south = 0, east = 0, north = 0, west = 0] = metrics.sideLengthsM;
        for (const [measured, expected] of [
          [south, width],
          [east, length],
          [north, width],
          [west, length],
        ] as const) {
          expect(Math.abs(measured - expected)).toBeLessThan(0.005);
        }
        expect(metrics.orientationDeg).toBeCloseTo(orientation, 3);
      }
    }
  });

  it('no confunde grados con metros: a 70° de latitud un grado de longitud mide ~38 km', () => {
    const region = createRegion(geoPoint(70, 10), 1_000, 1_000);
    const [sw, se] = regionMetrics(region).corners as [
      ReturnType<typeof geoPoint>,
      ReturnType<typeof geoPoint>,
    ];
    // 1 km hacia el este son ≈ 0,0262° de longitud a 70° (frente a 0,009° en el ecuador).
    expect(se.longitude - sw.longitude).toBeCloseTo(0.0262, 3);
  });

  it('gira el rectángulo según la orientación del eje largo', () => {
    const corners = regionCornersEnu(createRegion(geoPoint(0, 0), 100, 300, 90));
    // Con 90°, el eje largo apunta al este: el rectángulo ocupa 300 m E–O y 100 m N–S.
    const easts = corners.map(([east]) => east);
    const norths = corners.map(([, north]) => north);
    expect(Math.max(...easts) - Math.min(...easts)).toBeCloseTo(300, 9);
    expect(Math.max(...norths) - Math.min(...norths)).toBeCloseTo(100, 9);
  });

  it('crea el rectángulo a partir de una diagonal dibujada', () => {
    const frame = createLocalFrame(geoPoint(-17.55, -65.86));
    const a = frame.fromEnu({ east: -200, north: 150, up: 0 });
    const b = frame.fromEnu({ east: 300, north: -50, up: 0 });
    const region = regionFromDiagonal(a, b);
    expect(region.widthM).toBeCloseTo(500, 2);
    expect(region.lengthM).toBeCloseTo(200, 2);
    const center = frame.toEnu(region.center);
    expect(center.east).toBeCloseTo(50, 2);
    expect(center.north).toBeCloseTo(50, 2);
  });

  it('valida y ajusta los límites', () => {
    expect(validateRegion(createRegion(geoPoint(0, 0), 400, 300))).toEqual([]);
    expect(validateRegion(createRegion(geoPoint(0, 0), 20, 300))).toEqual(['side-too-small']);
    expect(validateRegion(createRegion(geoPoint(0, 0), 400, 9_000))).toEqual(['side-too-large']);
    expect(validateRegion(createRegion(geoPoint(88, 0), 400, 300))).toEqual([
      'latitude-out-of-range',
    ]);
    const clamped = clampRegion(createRegion(geoPoint(0, 0), 10, 9_000));
    expect([clamped.widthM, clamped.lengthM]).toEqual([50, 5_000]);
  });
});

describe('región demostrativa de Cochabamba', () => {
  it('es válida, mide 12 ha y conserva sus datos de verificación', () => {
    const { region, verification, disclaimer } = COCHABAMBA_DEMO_PRESET;
    expect(validateRegion(region)).toEqual([]);
    const metrics = regionMetrics(region);
    expect(metrics.areaHa).toBeCloseTo(12, 6);
    expect(metrics.perimeterM).toBeCloseTo(1_400, 3);
    // Vértices calculados el 2026-11-14 y comprobados contra OSM y ESA WorldCover.
    expect(metrics.corners[0]?.latitude).toBeCloseTo(-17.5526893, 6);
    expect(metrics.corners[0]?.longitude).toBeCloseTo(-65.8638668, 6);
    expect(verification.map((record) => record.source)).toHaveLength(3);
    expect(disclaimer).toMatch(/no corresponde a ninguna propiedad/i);
  });
});

describe('formato y lectura de coordenadas', () => {
  it('formatea grados, minutos y segundos con hemisferio', () => {
    expect(formatDms(-17.551334, 'lat')).toBe('17°\u00a033′\u00a004,8″\u00a0S');
    expect(formatDms(-65.861983, 'lon')).toBe('65°\u00a051′\u00a043,1″\u00a0O');
    expect(formatDms(10.999999, 'lat')).toBe('11°\u00a000′\u00a000,0″\u00a0N');
  });

  it('elige unidades de superficie y longitud legibles', () => {
    expect(formatArea(9_500)).toBe('9.500\u00a0m²');
    expect(formatArea(120_000)).toBe('12,00\u00a0ha');
    expect(formatArea(25_000_000)).toBe('25,000\u00a0km²');
    expect(formatLength(399.99999)).toBe('400,0\u00a0m');
    expect(formatLength(5_000)).toBe('5,00\u00a0km');
    expect(formatLength(0.0049)).toBe('4,9\u00a0mm');
    expect(formatLength(0.785)).toBe('78,5\u00a0cm');
    expect(formatAzimuth(0)).toBe('0,0°\u00a0(N)');
    expect(formatAzimuth(123.4)).toBe('123,4°\u00a0(SE)');
  });

  it('reconoce coordenadas decimales y sexagesimales', () => {
    expect(parseCoordinates('-17.551334, -65.861983')).toEqual(geoPoint(-17.551334, -65.861983));
    expect(parseCoordinates('-17.55 -65.86')).toEqual(geoPoint(-17.55, -65.86));
    expect(parseCoordinates('-17,55; -65,86')).toEqual(geoPoint(-17.55, -65.86));
    const dms = parseCoordinates('17°33\'04.8"S 65°51\'43.1"W');
    expect(dms?.latitude).toBeCloseTo(-17.551333, 5);
    expect(dms?.longitude).toBeCloseTo(-65.861972, 5);
    expect(parseCoordinates('17°33′S 65°51′O')?.longitude).toBeCloseTo(-65.85, 6);
  });

  it('rechaza textos que no son coordenadas válidas', () => {
    for (const text of ['Cochabamba', '95, 10', '10, 200', "17°70'S 65°W", '']) {
      expect(parseCoordinates(text), text).toBeNull();
    }
  });
});
