/**
 * Simplificación de mallas sensible a atributos (meshoptimizer `simplifyWithAttributes`).
 *
 * Los escaneos fotogramétricos tienen costuras de UV por todas partes: en `boulder_01` hay 67 042
 * vértices para 33 063 posiciones únicas. La simplificación clásica no puede colapsar esas
 * costuras y se detiene (54 k de 66 k triángulos aunque se pidan 5 k). El modo `Permissive`
 * permite colapsarlas cuando el error de normales y UV es pequeño, y llega al objetivo con un error
 * medido de 0,2–1,9 % del radio (ver ADR-021).
 */
import { type Accessor, Primitive } from '@gltf-transform/core';
import { compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Peso de cada componente de atributo frente al error geométrico: normal (xyz) y UV (uv). */
const NORMAL_WEIGHT = 0.5;
const UV_WEIGHT = 1;

function floatArray(accessor: Accessor): Float32Array {
  const array = accessor.getArray();
  if (array instanceof Float32Array) return array;
  // Los glTF de origen usan flotantes; si un atributo viniera cuantizado se desnormaliza aquí.
  const result = new Float32Array(accessor.getCount() * accessor.getElementSize());
  const element: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) {
    accessor.getElement(index, element);
    result.set(element, index * accessor.getElementSize());
  }
  return result;
}

function interleaveAttributes(primitive: Primitive): {
  readonly data: Float32Array;
  readonly stride: number;
  readonly weights: number[];
} | null {
  const normal = primitive.getAttribute('NORMAL');
  const uv = primitive.getAttribute('TEXCOORD_0');
  const sources: { array: Float32Array; size: number; weight: number }[] = [];
  if (normal !== null) sources.push({ array: floatArray(normal), size: 3, weight: NORMAL_WEIGHT });
  if (uv !== null) sources.push({ array: floatArray(uv), size: 2, weight: UV_WEIGHT });
  if (sources.length === 0) return null;
  const vertexCount = primitive.getAttribute('POSITION')?.getCount() ?? 0;
  const stride = sources.reduce((sum, source) => sum + source.size, 0);
  const data = new Float32Array(vertexCount * stride);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    let offset = vertex * stride;
    for (const source of sources) {
      for (let component = 0; component < source.size; component++) {
        data[offset++] = source.array[vertex * source.size + component] ?? 0;
      }
    }
  }
  return {
    data,
    stride,
    weights: sources.flatMap((source) => Array<number>(source.size).fill(source.weight)),
  };
}

/**
 * Reduce los triángulos de una primitiva a `ratio` sin superar `error` (fracción del radio).
 * Devuelve el error relativo alcanzado. Modifica la primitiva in situ.
 */
export function simplifyPrimitiveWithAttributes(
  primitive: Primitive,
  ratio: number,
  error: number,
): number {
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  if (
    position === null ||
    indices === null ||
    primitive.getMode() !== Primitive.Mode.TRIANGLES ||
    ratio >= 1
  ) {
    return 0;
  }
  const source = new Uint32Array(indices.getArray() ?? []);
  const target = Math.max(3, Math.floor((source.length * ratio) / 3) * 3);
  const positions = floatArray(position);
  const attributes = interleaveAttributes(primitive);
  const [result, achievedError] =
    attributes === null
      ? MeshoptSimplifier.simplify(source, positions, 3, target, error, ['Permissive'])
      : MeshoptSimplifier.simplifyWithAttributes(
          source,
          positions,
          3,
          attributes.data,
          attributes.stride,
          attributes.weights,
          null,
          target,
          error,
          ['Permissive'],
        );
  indices.setArray(
    position.getCount() <= 65_535 ? new Uint16Array(result) : new Uint32Array(result),
  );
  compactPrimitive(primitive);
  return achievedError;
}
