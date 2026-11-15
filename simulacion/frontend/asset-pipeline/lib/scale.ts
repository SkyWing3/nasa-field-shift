/** Validación de escala de modelos contra las dimensiones publicadas por la fuente. */

export type Vec3 = readonly [number, number, number];

/**
 * Poly Haven publica las dimensiones en milímetros con los ejes de Blender (X, Y, Z con Z hacia
 * arriba). El exportador glTF de Blender convierte a Y hacia arriba: (x, y, z) → (x, z, −y), así
 * que el tamaño en ejes glTF es (dx, dz, dy).
 */
export function blenderMmToGltfMeters(dimensionsMm: readonly number[] | null): Vec3 | null {
  if (dimensionsMm?.length !== 3) return null;
  const [x, y, z] = dimensionsMm as Vec3;
  if (![x, y, z].every((value) => Number.isFinite(value) && value > 0)) return null;
  return [x / 1000, z / 1000, y / 1000];
}

export interface ScaleComparison {
  readonly status: 'ok' | 'mismatch';
  readonly maxRelativeError: number;
}

/** Compara dos tamaños eje a eje; tolerancia relativa por defecto del 5 %. */
export function compareSizes(actual: Vec3, expected: Vec3, tolerance = 0.05): ScaleComparison {
  const maxRelativeError = Math.max(
    ...actual.map((value, axis) => {
      const reference = expected[axis] ?? 0;
      return reference > 0 ? Math.abs(value - reference) / reference : Number.POSITIVE_INFINITY;
    }),
  );
  return { status: maxRelativeError <= tolerance ? 'ok' : 'mismatch', maxRelativeError };
}

/** Tamaño a partir de una caja envolvente. */
export function sizeOfBounds(min: readonly number[], max: readonly number[]): Vec3 {
  return [0, 1, 2].map((axis) => (max[axis] ?? 0) - (min[axis] ?? 0)) as unknown as Vec3;
}
