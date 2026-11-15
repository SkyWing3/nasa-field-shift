/**
 * Interpretación de coordenadas escritas por el usuario en el buscador. Se resuelve en local, sin
 * llamar a ningún servicio.
 *
 * Formatos aceptados:
 * - Decimal con punto: `-17.5513, -65.8620` · `-17.5513 -65.8620`
 * - Decimal con coma: `-17,5513; -65,8620`
 * - Grados, minutos y segundos con hemisferio: `17°33'04.8"S 65°51'43.1"W` (también O para oeste)
 */
import { type GeoPoint, geoPoint, isValidLatitude, isValidLongitude } from './wgs84.ts';

const DECIMAL_DOT = /^\s*([+-]?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*$/;
const DECIMAL_COMMA = /^\s*([+-]?\d{1,2}(?:,\d+)?)\s*;\s*([+-]?\d{1,3}(?:,\d+)?)\s*$/;
const DMS_PART =
  /(\d{1,3})\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')\s*)?([NSEOW])/gi;

function point(latitude: number, longitude: number): GeoPoint | null {
  return isValidLatitude(latitude) && isValidLongitude(longitude)
    ? geoPoint(latitude, longitude)
    : null;
}

const toNumber = (text: string | undefined): number =>
  text === undefined ? 0 : Number(text.replace(',', '.'));

function parseDms(text: string): GeoPoint | null {
  const parts = [...text.matchAll(DMS_PART)];
  if (parts.length !== 2) return null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  for (const [, degrees, minutes, seconds, hemisphereRaw] of parts) {
    const hemisphere = (hemisphereRaw ?? '').toUpperCase();
    const minutesValue = toNumber(minutes);
    const secondsValue = toNumber(seconds);
    if (minutesValue >= 60 || secondsValue >= 60) return null;
    const magnitude = toNumber(degrees) + minutesValue / 60 + secondsValue / 3600;
    if (hemisphere === 'N' || hemisphere === 'S') {
      latitude = hemisphere === 'S' ? -magnitude : magnitude;
    } else {
      longitude = hemisphere === 'E' ? magnitude : -magnitude;
    }
  }
  return latitude === null || longitude === null ? null : point(latitude, longitude);
}

/** Devuelve el punto si el texto es una coordenada reconocible; si no, `null`. */
export function parseCoordinates(text: string): GeoPoint | null {
  const dot = DECIMAL_DOT.exec(text);
  if (dot) return point(toNumber(dot[1]), toNumber(dot[2]));
  const comma = DECIMAL_COMMA.exec(text);
  if (comma) return point(toNumber(comma[1]), toNumber(comma[2]));
  return text.includes('°') ? parseDms(text) : null;
}
