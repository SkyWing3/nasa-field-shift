/**
 * Construcción de la malla del terreno.
 *
 * - El área de detalle se divide en N × N fragmentos con varios niveles de detalle (LOD): cada
 *   nivel usa la mitad de segmentos que el anterior. Al estar separados, la GPU descarta los que
 *   quedan fuera de la cámara (frustum culling) y se elige el nivel por distancia.
 * - Las normales salen del campo de alturas más fino en todos los niveles: el sombreado no cambia
 *   al cambiar de LOD y no hay costuras de iluminación entre fragmentos.
 * - Cada fragmento lleva un faldón vertical en sus cuatro bordes que oculta las grietas entre
 *   fragmentos con distinto nivel de detalle y en el borde con el contexto.
 * - El contexto es una malla gruesa con un hueco exacto donde está el área de detalle.
 */
import { type Heightfield, heightAtNode, normalAtNode } from './heightfield.ts';

export interface MeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** [minX, minY, minZ, maxX, maxY, maxZ] */
  readonly bounds: readonly [number, number, number, number, number, number];
}

export interface ChunkLevels {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly center: readonly [number, number, number];
  readonly levels: readonly MeshData[];
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  private readonly min = [Infinity, Infinity, Infinity];
  private readonly max = [-Infinity, -Infinity, -Infinity];

  vertex(x: number, y: number, z: number, normal: readonly [number, number, number]): number {
    this.positions.push(x, y, z);
    this.normals.push(normal[0], normal[1], normal[2]);
    const p = [x, y, z];
    for (let a = 0; a < 3; a++) {
      const v = p[a] ?? 0;
      if (v < (this.min[a] ?? 0)) this.min[a] = v;
      if (v > (this.max[a] ?? 0)) this.max[a] = v;
    }
    return this.positions.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    // a ─ b
    // │ ╱ │   triángulos (a, c, b) y (b, c, d): diagonal de b a c, como `heightAt`.
    // c ─ d
    this.indices.push(a, c, b, b, c, d);
  }

  build(): MeshData {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      indices: Uint32Array.from(this.indices),
      bounds: [
        this.min[0] ?? 0,
        this.min[1] ?? 0,
        this.min[2] ?? 0,
        this.max[0] ?? 0,
        this.max[1] ?? 0,
        this.max[2] ?? 0,
      ],
    };
  }
}

/**
 * Malla de un fragmento con un paso de `step` nodos del campo de alturas.
 * `skirtDepthM` es la profundidad del faldón de los bordes.
 */
export function buildChunkLevel(
  hf: Heightfield,
  firstI: number,
  firstJ: number,
  nodesPerSide: number,
  step: number,
  skirtDepthM: number,
): MeshData {
  const builder = new MeshBuilder();
  const cells = nodesPerSide / step;
  const grid: number[] = [];
  for (let gj = 0; gj <= cells; gj++) {
    for (let gi = 0; gi <= cells; gi++) {
      const i = firstI + gi * step;
      const j = firstJ + gj * step;
      grid.push(
        builder.vertex(
          hf.originX + i * hf.spacingM,
          heightAtNode(hf, i, j),
          hf.originZ + j * hf.spacingM,
          normalAtNode(hf, i, j),
        ),
      );
    }
  }
  const at = (gi: number, gj: number): number => grid[gj * (cells + 1) + gi] ?? 0;
  for (let gj = 0; gj < cells; gj++) {
    for (let gi = 0; gi < cells; gi++) {
      builder.quad(at(gi, gj), at(gi + 1, gj), at(gi, gj + 1), at(gi + 1, gj + 1));
    }
  }
  // Faldones: copia de cada borde desplazada hacia abajo, unida al borde con quads verticales.
  const edges: [number, number][][] = [
    Array.from({ length: cells + 1 }, (_, k) => [k, 0]), // norte
    Array.from({ length: cells + 1 }, (_, k) => [cells, k]), // este
    Array.from({ length: cells + 1 }, (_, k) => [cells - k, cells]), // sur
    Array.from({ length: cells + 1 }, (_, k) => [0, cells - k]), // oeste
  ];
  const positions = builder.positions;
  const normals = builder.normals;
  for (const edge of edges) {
    const lowered = edge.map(([gi, gj]) => {
      const top = at(gi, gj);
      return builder.vertex(
        positions[top * 3] ?? 0,
        (positions[top * 3 + 1] ?? 0) - skirtDepthM,
        positions[top * 3 + 2] ?? 0,
        [normals[top * 3] ?? 0, normals[top * 3 + 1] ?? 1, normals[top * 3 + 2] ?? 0],
      );
    });
    for (let k = 0; k < edge.length - 1; k++) {
      const [ai, aj] = edge[k] ?? [0, 0];
      const [bi, bj] = edge[k + 1] ?? [0, 0];
      // Orden de vértices con la cara exterior hacia fuera del fragmento.
      builder.quad(at(bi, bj), at(ai, aj), lowered[k + 1] ?? 0, lowered[k] ?? 0);
    }
  }
  return builder.build();
}

/** Todos los fragmentos del área de detalle con sus niveles de detalle. */
export function buildDetailChunks(
  hf: Heightfield,
  chunksPerSide: number,
  levelCount: number,
): ChunkLevels[] {
  if (hf.segments % chunksPerSide !== 0) {
    throw new Error('Los segmentos del terreno deben repartirse por igual entre fragmentos');
  }
  const nodesPerChunk = hf.segments / chunksPerSide;
  const chunks: ChunkLevels[] = [];
  for (let cz = 0; cz < chunksPerSide; cz++) {
    for (let cx = 0; cx < chunksPerSide; cx++) {
      const levels: MeshData[] = [];
      for (let level = 0; level < levelCount; level++) {
        const step = 2 ** level;
        if (nodesPerChunk % step !== 0) break;
        const skirt = Math.max(4, hf.spacingM * step * 1.5);
        levels.push(
          buildChunkLevel(hf, cx * nodesPerChunk, cz * nodesPerChunk, nodesPerChunk, step, skirt),
        );
      }
      const first = levels[0];
      if (first === undefined) continue;
      const [x0, y0, z0, x1, y1, z1] = first.bounds;
      chunks.push({
        chunkX: cx,
        chunkZ: cz,
        center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        levels,
      });
    }
  }
  return chunks;
}

/**
 * Anillo de contexto: malla del campo de alturas grueso sin las celdas que caen dentro del
 * cuadrado de detalle (`holeHalfSizeM`, que debe coincidir con líneas de la malla).
 */
export function buildContextRing(hf: Heightfield, holeHalfSizeM: number): MeshData {
  const builder = new MeshBuilder();
  const n = hf.segments + 1;
  const indexOf = new Int32Array(n * n).fill(-1);
  const inside = (i: number, j: number): boolean => {
    const x = hf.originX + (i + 0.5) * hf.spacingM;
    const z = hf.originZ + (j + 0.5) * hf.spacingM;
    return Math.abs(x) < holeHalfSizeM && Math.abs(z) < holeHalfSizeM;
  };
  const vertex = (i: number, j: number): number => {
    const key = j * n + i;
    const existing = indexOf[key] ?? -1;
    if (existing >= 0) return existing;
    const created = builder.vertex(
      hf.originX + i * hf.spacingM,
      heightAtNode(hf, i, j),
      hf.originZ + j * hf.spacingM,
      normalAtNode(hf, i, j),
    );
    indexOf[key] = created;
    return created;
  };
  for (let j = 0; j < hf.segments; j++) {
    for (let i = 0; i < hf.segments; i++) {
      if (inside(i, j)) continue;
      builder.quad(vertex(i, j), vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1));
    }
  }
  return builder.build();
}

/** Número de triángulos de una malla (para estadísticas de rendimiento). */
export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}
