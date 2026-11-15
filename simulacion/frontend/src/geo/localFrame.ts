/**
 * Sistema de coordenadas local de la granja: plano tangente ENU (este, norte, arriba) al
 * elipsoide WGS84 en un origen fijo.
 *
 * La escena Three.js usa los mismos ejes que el resto del proyecto (`weather-visual/sun.ts`):
 * +X = este, +Y = arriba, −Z = norte. Es decir, `x = E`, `y = U`, `z = −N`, en metros.
 *
 * Exactitud: la conversión ENU es exacta en 3D (solo un giro y una traslación de ECEF). La
 * aproximación aparece al tratar el plano E–N como "el suelo": la superficie del elipsoide cae por
 * debajo del plano unos d²/2R (≈ 7,8 cm a 1 km, 2 m a 5 km). En distancias horizontales el error
 * relativo es del orden de (d/R)²/6: inferior a 1e-7 a 5 km. Por eso las regiones se limitan a
 * 5 km de lado (ADR-029).
 */
import { quantity, type Quantity } from '../domain/units.ts';
import { ecefToGeodetic, type GeodeticPosition, type GeoPoint, geodeticToEcef } from './wgs84.ts';

const DEG = Math.PI / 180;

/** Coordenadas locales este-norte-arriba, en metros. */
export interface Enu {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

/** Posición en la escena Three.js: [x (este), y (arriba), z (−norte)], en metros. */
export type ScenePosition = readonly [x: number, y: number, z: number];

export interface LocalFrame {
  readonly origin: GeodeticPosition;
  toEnu(position: GeoPoint | GeodeticPosition): Enu;
  fromEnu(enu: Enu): GeodeticPosition;
  toScene(position: GeoPoint | GeodeticPosition): ScenePosition;
  fromScene(position: ScenePosition): GeodeticPosition;
}

export function enuToScene(enu: Enu): ScenePosition {
  return [enu.east, enu.up, -enu.north];
}

export function sceneToEnu([x, y, z]: ScenePosition): Enu {
  return { east: x, north: -z, up: y };
}

function withHeight(position: GeoPoint | GeodeticPosition): GeodeticPosition {
  return 'heightM' in position ? position : { ...position, heightM: quantity(0, 'm') };
}

export function createLocalFrame(origin: GeoPoint | GeodeticPosition): LocalFrame {
  const base = withHeight(origin);
  const o = geodeticToEcef(base);
  const phi = base.latitude * DEG;
  const lambda = base.longitude * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  const toEnu = (position: GeoPoint | GeodeticPosition): Enu => {
    const p = geodeticToEcef(withHeight(position));
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dz = p.z - o.z;
    return {
      east: -sinLambda * dx + cosLambda * dy,
      north: -sinPhi * cosLambda * dx - sinPhi * sinLambda * dy + cosPhi * dz,
      up: cosPhi * cosLambda * dx + cosPhi * sinLambda * dy + sinPhi * dz,
    };
  };

  const fromEnu = ({ east, north, up }: Enu): GeodeticPosition =>
    ecefToGeodetic({
      x: o.x - sinLambda * east - sinPhi * cosLambda * north + cosPhi * cosLambda * up,
      y: o.y + cosLambda * east - sinPhi * sinLambda * north + cosPhi * sinLambda * up,
      z: o.z + cosPhi * north + sinPhi * up,
    });

  return {
    origin: base,
    toEnu,
    fromEnu,
    toScene: (position) => enuToScene(toEnu(position)),
    fromScene: (position) => fromEnu(sceneToEnu(position)),
  };
}

/** Radio medio de la Tierra para estimaciones de error (IUGG). */
const MEAN_EARTH_RADIUS_M = 6_371_008.8;

/** Caída de la superficie terrestre bajo el plano tangente a una distancia horizontal dada. */
export function tangentPlaneDrop(distanceM: number): Quantity<'m'> {
  return quantity((distanceM * distanceM) / (2 * MEAN_EARTH_RADIUS_M), 'm');
}
