import { Document, type Primitive } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';

import { simplifyPrimitiveWithAttributes } from './simplify.ts';

/** Rejilla plana de n × n celdas con normales y UV, con costuras de UV como un escaneo. */
function gridPrimitive(document: Document, cells: number, splitSeams: boolean): Primitive {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, z: number, u: number, v: number): number => {
    positions.push(x / cells, Math.sin(x * 0.7) * Math.cos(z * 0.5) * 0.02, z / cells);
    normals.push(0, 1, 0);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  for (let z = 0; z < cells; z++) {
    for (let x = 0; x < cells; x++) {
      // Con costuras, cada celda tiene vértices propios (mismas posiciones, UV distintas).
      const offset = splitSeams ? ((x + z) % 2) * 0.5 : 0;
      const a = vertex(x, z, x / cells + offset, z / cells);
      const b = vertex(x + 1, z, (x + 1) / cells + offset, z / cells);
      const c = vertex(x, z + 1, x / cells + offset, (z + 1) / cells);
      const d = vertex(x + 1, z + 1, (x + 1) / cells + offset, (z + 1) / cells);
      indices.push(a, c, b, b, c, d);
    }
  }
  const buffer = document.createBuffer();
  const accessor = (
    array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
    type: 'VEC3' | 'VEC2' | 'SCALAR',
  ) => document.createAccessor().setArray(array).setType(type).setBuffer(buffer);
  return document
    .createPrimitive()
    .setAttribute('POSITION', accessor(new Float32Array(positions), 'VEC3'))
    .setAttribute('NORMAL', accessor(new Float32Array(normals), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(new Float32Array(uvs), 'VEC2'))
    .setIndices(accessor(new Uint32Array(indices), 'SCALAR'));
}

const triangles = (primitive: Primitive): number => (primitive.getIndices()?.getCount() ?? 0) / 3;

describe('simplificación sensible a atributos', () => {
  beforeAll(async () => {
    await MeshoptSimplifier.ready;
  });

  it('reduce una malla con costuras de UV al objetivo pedido', () => {
    const document = new Document();
    const primitive = gridPrimitive(document, 40, true);
    expect(triangles(primitive)).toBe(3200);
    simplifyPrimitiveWithAttributes(primitive, 0.25, 0.05);
    expect(triangles(primitive)).toBeLessThanOrEqual(800);
    expect(triangles(primitive)).toBeGreaterThan(0);
  });

  it('compacta los vértices y deja índices válidos', () => {
    const document = new Document();
    const primitive = gridPrimitive(document, 30, false);
    const before = primitive.getAttribute('POSITION')?.getCount() ?? 0;
    simplifyPrimitiveWithAttributes(primitive, 0.2, 0.05);
    const vertexCount = primitive.getAttribute('POSITION')?.getCount() ?? 0;
    expect(vertexCount).toBeLessThan(before);
    const indices = primitive.getIndices()?.getArray() ?? new Uint16Array();
    expect(Math.max(...indices)).toBeLessThan(vertexCount);
    expect(primitive.getAttribute('TEXCOORD_0')?.getCount()).toBe(vertexCount);
  });

  it('no modifica la primitiva si no hay que reducir', () => {
    const document = new Document();
    const primitive = gridPrimitive(document, 4, false);
    expect(simplifyPrimitiveWithAttributes(primitive, 1, 0.01)).toBe(0);
    expect(triangles(primitive)).toBe(32);
  });
});
