/** Formato de coordenadas y magnitudes geográficas para la interfaz (es-ES). */

const NBSP = ' ';

function decimal(value: number, digits: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  });
}

/** Grados decimales con 6 decimales (≈ 0,1 m) y signo: −17,551334. */
export function formatDegrees(value: number, digits = 6): string {
  return `${decimal(value, digits)}°`;
}

/** Grados, minutos y segundos con hemisferio: 17° 33′ 04,8″ S. */
export function formatDms(value: number, axis: 'lat' | 'lon'): string {
  const hemisphere = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'O' : 'E';
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = Math.floor((absolute - degrees) * 60);
  let seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 10) / 10;
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }
  return `${degrees}°${NBSP}${String(minutes).padStart(2, '0')}′${NBSP}${decimal(seconds, 1).padStart(4, '0')}″${NBSP}${hemisphere}`;
}

/** Superficie en m² (< 1 ha), ha (< 100 ha) o km². */
export function formatArea(squareMeters: number): string {
  if (squareMeters < 10_000) return `${decimal(squareMeters, 0)}${NBSP}m²`;
  if (squareMeters < 1_000_000) return `${decimal(squareMeters / 10_000, 2)}${NBSP}ha`;
  return `${decimal(squareMeters / 1_000_000, 3)}${NBSP}km²`;
}

/** Longitud en mm (< 1 cm), cm (< 1 m), m (< 1 km, con 1 decimal) o km (2 decimales). */
export function formatLength(meters: number): string {
  if (meters < 0.01) return `${decimal(meters * 1_000, 1)}${NBSP}mm`;
  if (meters < 1) return `${decimal(meters * 100, 1)}${NBSP}cm`;
  if (meters < 1_000) return `${decimal(meters, 1)}${NBSP}m`;
  return `${decimal(meters / 1_000, 2)}${NBSP}km`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

/** Azimut con rumbo cardinal aproximado: 32,0° (NE). */
export function formatAzimuth(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const cardinal = CARDINALS[Math.round(normalized / 45) % 8] ?? 'N';
  return `${decimal(normalized, 1)}°${NBSP}(${cardinal})`;
}
