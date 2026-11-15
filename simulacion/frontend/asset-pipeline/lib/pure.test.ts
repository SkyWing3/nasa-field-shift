import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cell,
  CATALOG_END,
  CATALOG_START,
  renderCatalogMarkdown,
  replaceBetweenMarkers,
} from './docs.ts';
import { formatBytes, safeJoin, toPosixRelative } from './files.ts';
import { stableStringify } from './json.ts';
import { checkAgainstLock, EMPTY_LOCK, parseLock, withEntry } from './lockfile.ts';
import { parseRadianceHeader } from './radiance.ts';
import { blenderMmToGltfMeters, compareSizes, sizeOfBounds } from './scale.ts';
import { createCatalog, missingEntry } from './catalog.ts';
import { ASSET_SELECTION, type MissingSelection } from '../selection.ts';

const SHA = 'a'.repeat(64);

describe('escala', () => {
  it('convierte milímetros de Blender (Z arriba) a metros glTF (Y arriba)', () => {
    // Árbol de Poly Haven: 2921 × 4292 × 4650 mm (x, y, z de Blender).
    expect(blenderMmToGltfMeters([2921, 4292, 4650])).toEqual([2.921, 4.65, 4.292]);
  });

  it('rechaza dimensiones ausentes, incompletas o no positivas', () => {
    expect(blenderMmToGltfMeters(null)).toBeNull();
    expect(blenderMmToGltfMeters([1, 2])).toBeNull();
    expect(blenderMmToGltfMeters([1, 0, 2])).toBeNull();
  });

  it('compara tamaños eje a eje con tolerancia relativa', () => {
    expect(compareSizes([1, 2, 3], [1, 2, 3.1]).status).toBe('ok');
    const mismatch = compareSizes([1, 2, 3], [1, 2, 4]);
    expect(mismatch.status).toBe('mismatch');
    expect(mismatch.maxRelativeError).toBeCloseTo(0.25);
    // Un error de unidades (centímetros tomados como metros) se detecta siempre.
    expect(compareSizes([100, 200, 300], [1, 2, 3]).status).toBe('mismatch');
  });

  it('calcula el tamaño de una caja envolvente', () => {
    expect(sizeOfBounds([-1, 0, -2], [1, 3, 2])).toEqual([2, 3, 4]);
  });
});

describe('cabecera Radiance HDR', () => {
  const header = (body: string) => new TextEncoder().encode(body);

  it('lee la resolución de una cabecera válida', () => {
    const bytes = header(
      '#?RADIANCE\nGAMMA=1\nFORMAT=32-bit_rle_rgbe\n\n-Y 512 +X 1024\n\u0002\u0002',
    );
    expect(parseRadianceHeader(bytes)).toEqual({ width: 1024, height: 512 });
  });

  it('rechaza archivos sin firma, con otro formato o con orientación no soportada', () => {
    expect(() => parseRadianceHeader(header('P6\n1024 512\n'))).toThrow(/firma/);
    expect(() =>
      parseRadianceHeader(header('#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 2\n')),
    ).toThrow(/Formato/);
    expect(() =>
      parseRadianceHeader(header('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+X 2 -Y 1\n')),
    ).toThrow(/resolución/);
  });
});

describe('rutas seguras', () => {
  const base = path.resolve('/tmp/biblioteca');

  it('une rutas relativas dentro del directorio base', () => {
    expect(safeJoin(base, 'textures/a.jpg')).toBe(path.join(base, 'textures', 'a.jpg'));
  });

  it('impide salir del directorio con rutas de datos externos', () => {
    expect(() => safeJoin(base, '../secreto')).toThrow();
    expect(() => safeJoin(base, 'a/../../secreto')).toThrow();
    expect(() => safeJoin(base, '/etc/passwd')).toThrow();
    expect(() => safeJoin(base, 'C:\\Windows')).toThrow();
    expect(() => safeJoin(base, '')).toThrow();
  });

  it('produce rutas relativas con barras normales', () => {
    expect(toPosixRelative(base, path.join(base, 'models', 'x.glb'))).toBe('models/x.glb');
  });

  it('formatea tamaños en unidades binarias', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('archivo de huellas (sources.lock.json)', () => {
  it('valida el formato y las huellas', () => {
    const lock = parseLock(
      JSON.stringify({ lockVersion: 1, files: { 'https://x/a': { bytes: 3, sha256: SHA } } }),
    );
    expect(lock.files['https://x/a']).toEqual({ bytes: 3, sha256: SHA });
    expect(() => parseLock(JSON.stringify({ lockVersion: 2, files: {} }))).toThrow(/versión/);
    expect(() =>
      parseLock(JSON.stringify({ lockVersion: 1, files: { u: { bytes: 1, sha256: 'xyz' } } })),
    ).toThrow(/sha256/);
  });

  it('distingue coincidencia, archivo nuevo y archivo cambiado en origen', () => {
    const lock = withEntry(EMPTY_LOCK, 'u', { bytes: 3, sha256: SHA });
    expect(checkAgainstLock(lock, 'u', { bytes: 3, sha256: SHA })).toBe('match');
    expect(checkAgainstLock(lock, 'otro', { bytes: 3, sha256: SHA })).toBe('unknown');
    expect(checkAgainstLock(lock, 'u', { bytes: 3, sha256: 'b'.repeat(64) })).toBe('mismatch');
    expect(EMPTY_LOCK.files).toEqual({});
  });

  it('serializa con claves ordenadas para diferencias estables', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n',
    );
  });
});

describe('documentación generada', () => {
  it('escapa barras verticales y saltos de línea en celdas', () => {
    expect(cell('a|b\nc')).toBe('a\\|b c');
  });

  it('sustituye solo el contenido entre marcadores', () => {
    const document = `antes\n${CATALOG_START}\nviejo\n${CATALOG_END}\ndespués`;
    expect(replaceBetweenMarkers(document, 'nuevo')).toBe(
      `antes\n${CATALOG_START}\nnuevo\n${CATALOG_END}\ndespués`,
    );
    expect(() => replaceBetweenMarkers('sin marcadores', 'x')).toThrow(/marcadores/);
  });

  it('lista los recursos faltantes con sus alternativas', () => {
    const missing = ASSET_SELECTION.filter(
      (item): item is MissingSelection => item.acquisition === 'missing',
    );
    const markdown = renderCatalogMarkdown(createCatalog(missing.map(missingEntry), new Date(0)));
    expect(markdown).toContain('0 disponibles');
    expect(markdown).toContain(`${missing.length} faltantes`);
    expect(markdown).toContain('crop_fava');
    expect(markdown).toContain(
      'sketchfab.com/3d-models/corn-plant-773c4a1bd7fc44049b59c177aa162566',
    );
  });
});
