/**
 * Rejillas geográficas (EPSG:4326) recibidas de la API y su muestreo.
 *
 * Convención de área: filas de norte a sur; el centro del píxel (fila r, columna c) está en
 * (north − (r + ½)·pixelHeight, west + (c + ½)·pixelWidth).
 */
export interface GeoGrid<T extends Float32Array | Uint8Array> {
  readonly west: number;
  readonly north: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly width: number;
  readonly height: number;
  readonly data: T;
}

export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decodifica `float32` little-endian independientemente del orden de bytes de la máquina. */
export function decodeFloat32LE(base64: string, expectedLength: number): Float32Array {
  const bytes = decodeBase64(base64);
  if (bytes.length !== expectedLength * 4) {
    throw new Error(`Rejilla de elevación con tamaño inesperado (${String(bytes.length)} bytes)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function decodeUint8(base64: string, expectedLength: number): Uint8Array {
  const bytes = decodeBase64(base64);
  if (bytes.length !== expectedLength) {
    throw new Error(`Rejilla de cobertura con tamaño inesperado (${String(bytes.length)} bytes)`);
  }
  return bytes;
}

/** Posición continua en píxeles (0 = centro del primer píxel). */
function pixelCoords(
  grid: GeoGrid<Float32Array | Uint8Array>,
  lat: number,
  lon: number,
): [x: number, y: number] {
  return [(lon - grid.west) / grid.pixelWidth - 0.5, (grid.north - lat) / grid.pixelHeight - 0.5];
}

function clampIndex(value: number, size: number): number {
  return value < 0 ? 0 : value >= size ? size - 1 : value;
}

export function sampleNearest(
  grid: GeoGrid<Float32Array | Uint8Array>,
  lat: number,
  lon: number,
): number {
  const [x, y] = pixelCoords(grid, lat, lon);
  const c = clampIndex(Math.round(x), grid.width);
  const r = clampIndex(Math.round(y), grid.height);
  return grid.data[r * grid.width + c] ?? 0;
}

export function sampleBilinear(grid: GeoGrid<Float32Array>, lat: number, lon: number): number {
  const [x, y] = pixelCoords(grid, lat, lon);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const c0 = clampIndex(x0, grid.width);
  const c1 = clampIndex(x0 + 1, grid.width);
  const r0 = clampIndex(y0, grid.height);
  const r1 = clampIndex(y0 + 1, grid.height);
  const d = grid.data;
  const w = grid.width;
  const top = (d[r0 * w + c0] ?? 0) * (1 - fx) + (d[r0 * w + c1] ?? 0) * fx;
  const bottom = (d[r1 * w + c0] ?? 0) * (1 - fx) + (d[r1 * w + c1] ?? 0) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Peso de Catmull-Rom: interpola los datos (pasa por las muestras) con continuidad C1. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}

/** Interpolación bicúbica Catmull-Rom (superficie suave, sin aristas en los bordes de píxel). */
export function sampleBicubic(grid: GeoGrid<Float32Array>, lat: number, lon: number): number {
  const [x, y] = pixelCoords(grid, lat, lon);
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const fx = x - x1;
  const fy = y - y1;
  const d = grid.data;
  const w = grid.width;
  const rows: number[] = [];
  for (let j = -1; j <= 2; j++) {
    const r = clampIndex(y1 + j, grid.height) * w;
    rows.push(
      catmullRom(
        d[r + clampIndex(x1 - 1, w)] ?? 0,
        d[r + clampIndex(x1, w)] ?? 0,
        d[r + clampIndex(x1 + 1, w)] ?? 0,
        d[r + clampIndex(x1 + 2, w)] ?? 0,
        fx,
      ),
    );
  }
  return catmullRom(rows[0] ?? 0, rows[1] ?? 0, rows[2] ?? 0, rows[3] ?? 0, fy);
}
