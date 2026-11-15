/**
 * Edificaciones 3D a partir de las huellas reales de OpenStreetMap (teselas OpenMapTiles).
 *
 * **Dato real**: la huella (forma y posición) y, si OSM registra `height` o `building:levels`,
 * la altura (OpenMapTiles la publica como `render_height`). OpenMapTiles publica 5 m cuando OSM no
 * registra la altura; ese valor se trata como «sin altura» y se **estima** (1 a 3 plantas de
 * 2,9 m según sea zona urbana o rural).
 * **Estimado / procedural**: el tipo de tejado (a dos aguas en casas pequeñas y rectangulares,
 * plano en el resto), los materiales (ladrillo visto o revoque pintado; teja o calamina) y el
 * color, elegidos con una semilla y con proporciones propias del bioma. OSM casi nunca registra
 * esos datos.
 */
import type { LocalPolygon } from './features.ts';
import { type Heightfield, heightAt } from './heightfield.ts';
import { hashCoords, seedFromText, unit } from './random.ts';

export type BuildingMaterial = 'brick' | 'plaster' | 'roofTiles' | 'roofMetal' | 'roofFlat';

export const BUILDING_MATERIALS: readonly BuildingMaterial[] = [
  'brick',
  'plaster',
  'roofTiles',
  'roofMetal',
  'roofFlat',
];

export interface BuildingStyle {
  /** Proporción de fachadas de ladrillo visto (el resto, revoque pintado). */
  readonly brickShare: number;
  /** Proporción de casas pequeñas con tejado inclinado (fuera de zona urbana). */
  readonly pitchedShare: number;
  /** Proporción de calamina entre los tejados inclinados (el resto, teja cerámica). */
  readonly metalRoofShare: number;
}

export interface BuildingMesh {
  readonly material: BuildingMaterial;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Coordenadas de textura en metros (el material aplica el tamaño real de su textura). */
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

export interface BuildingSet {
  readonly meshes: readonly BuildingMesh[];
  readonly count: number;
  /** Edificaciones con altura registrada en OSM y con altura estimada. */
  readonly taggedHeights: number;
  readonly estimatedHeights: number;
  readonly pitchedRoofs: number;
}

export interface BuildingInput {
  readonly polygons: readonly LocalPolygon[];
  readonly heightfield: Heightfield;
  readonly seed: number;
  readonly style: BuildingStyle;
  /** ¿Zona urbana? (cobertura «construido»): más plantas y tejados planos. */
  readonly isUrban: (x: number, z: number) => boolean;
  /** Zonas donde no se colocan edificaciones (p. ej. la región reservada para la granja). */
  readonly isExcluded: (x: number, z: number) => boolean;
}

/** Valor que OpenMapTiles publica cuando OSM no registra la altura. */
export const OPENMAPTILES_DEFAULT_HEIGHT_M = 5;
const FLOOR_M = 2.9;

/** Colores de revoque frecuentes (multiplican la textura clara del material). */
const PLASTER_COLORS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [1, 0.96, 0.86],
  [1, 0.9, 0.72],
  [0.98, 0.82, 0.66],
  [0.92, 0.72, 0.6],
  [0.84, 0.9, 0.95],
  [0.9, 0.95, 0.86],
  [0.95, 0.95, 0.95],
];

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  readonly material: BuildingMaterial;

  constructor(material: BuildingMaterial) {
    this.material = material;
  }

  vertex(
    x: number,
    y: number,
    z: number,
    n: readonly [number, number, number],
    u: number,
    v: number,
    color: readonly [number, number, number],
  ): number {
    this.positions.push(x, y, z);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(u, v);
    this.colors.push(color[0], color[1], color[2]);
    return this.positions.length / 3 - 1;
  }

  /** Triángulo con la cara frontal hacia `n` (corrige el orden de los vértices). */
  triangle(a: number, b: number, c: number, n: readonly [number, number, number]): void {
    const p = this.positions;
    const ax = p[a * 3] ?? 0;
    const ay = p[a * 3 + 1] ?? 0;
    const az = p[a * 3 + 2] ?? 0;
    const ux = (p[b * 3] ?? 0) - ax;
    const uy = (p[b * 3 + 1] ?? 0) - ay;
    const uz = (p[b * 3 + 2] ?? 0) - az;
    const vx = (p[c * 3] ?? 0) - ax;
    const vy = (p[c * 3 + 1] ?? 0) - ay;
    const vz = (p[c * 3 + 2] ?? 0) - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  quad(a: number, b: number, c: number, d: number, n: readonly [number, number, number]): void {
    this.triangle(a, b, c, n);
    this.triangle(a, c, d, n);
  }

  build(): BuildingMesh {
    return {
      material: this.material,
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      colors: Float32Array.from(this.colors),
      indices: Uint32Array.from(this.indices),
    };
  }
}

/** Vértices de un anillo cerrado sin el punto repetido final ni vértices duplicados. */
export function ringPoints(ring: Float32Array): [number, number][] {
  const points: [number, number][] = [];
  for (let k = 0; k + 1 < ring.length; k += 2) {
    const x = ring[k] ?? 0;
    const z = ring[k + 1] ?? 0;
    const last = points[points.length - 1];
    if (last !== undefined && Math.hypot(last[0] - x, last[1] - z) < 0.05) continue;
    points.push([x, z]);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first !== undefined && last !== undefined && points.length > 1) {
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) points.pop();
  }
  return points;
}

/** Área con signo (positiva = antihoraria con x a la derecha y z hacia arriba). */
export function signedArea(points: readonly (readonly [number, number])[]): number {
  let area = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Triangulación por recorte de orejas de un polígono simple antihorario (índices). */
export function triangulate(points: readonly (readonly [number, number])[]): number[] {
  const indices: number[] = [];
  const remaining = points.map((_, k) => k);
  const at = (k: number): readonly [number, number] => points[k] ?? [0, 0];
  const cross = (a: number, b: number, c: number): number => {
    const [ax, az] = at(a);
    const [bx, bz] = at(b);
    const [cx, cz] = at(c);
    return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  };
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    cross(a, b, p) > 1e-9 && cross(b, c, p) > 1e-9 && cross(c, a, p) > 1e-9;
  let guard = remaining.length * remaining.length + 10;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < remaining.length; k++) {
      const a = remaining[(k + remaining.length - 1) % remaining.length] ?? 0;
      const b = remaining[k] ?? 0;
      const c = remaining[(k + 1) % remaining.length] ?? 0;
      if (cross(a, b, c) <= 1e-9) continue; // vértice reflejo o colineal
      if (remaining.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      indices.push(a, b, c);
      remaining.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // polígono degenerado: se completa en abanico
  }
  for (let k = 1; k + 1 < remaining.length; k++) {
    indices.push(remaining[0] ?? 0, remaining[k] ?? 0, remaining[k + 1] ?? 0);
  }
  return indices;
}

export interface OrientedRect {
  readonly cx: number;
  readonly cz: number;
  /** Eje largo (unitario) y medidas (m). */
  readonly ux: number;
  readonly uz: number;
  readonly length: number;
  readonly width: number;
}

/** Rectángulo orientado de área mínima (probando la dirección de cada arista). */
export function minAreaRect(points: readonly (readonly [number, number])[]): OrientedRect {
  let best: OrientedRect = { cx: 0, cz: 0, ux: 1, uz: 0, length: 0, width: 0 };
  let bestArea = Infinity;
  for (let k = 0; k < points.length; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of points) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const long = maxU - minU >= maxV - minV;
      best = {
        cx: cu * ux - cv * uz,
        cz: cu * uz + cv * ux,
        ux: long ? ux : -uz,
        uz: long ? uz : ux,
        length: Math.max(maxU - minU, maxV - minV),
        width: Math.min(maxU - minU, maxV - minV),
      };
    }
  }
  return best;
}

function wallNormal(ax: number, az: number, bx: number, bz: number, ccw: boolean): [number, number, number] {
  const length = Math.hypot(bx - ax, bz - az) || 1;
  const nx = (bz - az) / length;
  const nz = -(bx - ax) / length;
  return ccw ? [nx, 0, nz] : [-nx, 0, -nz];
}

/** Paredes verticales de un contorno, de `base` a `top`, con UV en metros. */
function addWalls(
  mesh: MeshBuilder,
  points: readonly (readonly [number, number])[],
  base: number,
  top: number,
  color: readonly [number, number, number],
): void {
  const ccw = signedArea(points) > 0;
  let perimeter = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = wallNormal(a[0], a[1], b[0], b[1], ccw);
    const v0 = mesh.vertex(a[0], base, a[1], n, perimeter, 0, color);
    const v1 = mesh.vertex(b[0], base, b[1], n, perimeter + length, 0, color);
    const v2 = mesh.vertex(b[0], top, b[1], n, perimeter + length, top - base, color);
    const v3 = mesh.vertex(a[0], top, a[1], n, perimeter, top - base, color);
    mesh.quad(v0, v1, v2, v3, n);
    perimeter += length;
  }
}

function addFlatRoof(
  mesh: MeshBuilder,
  points: readonly (readonly [number, number])[],
  top: number,
  color: readonly [number, number, number],
): void {
  const ordered = signedArea(points) > 0 ? points : [...points].reverse();
  const up: [number, number, number] = [0, 1, 0];
  const first = mesh.positions.length / 3;
  for (const [x, z] of ordered) mesh.vertex(x, top, z, up, x, z, color);
  const tris = triangulate(ordered);
  for (let k = 0; k + 2 < tris.length; k += 3) {
    mesh.triangle(first + (tris[k] ?? 0), first + (tris[k + 1] ?? 0), first + (tris[k + 2] ?? 0), up);
  }
}

/** Casa rectangular con tejado a dos aguas (cumbrera sobre el eje largo) y alero. */
function addGableHouse(
  walls: MeshBuilder,
  roof: MeshBuilder,
  rect: OrientedRect,
  base: number,
  top: number,
  wallColor: readonly [number, number, number],
  roofColor: readonly [number, number, number],
): void {
  const { cx, cz, ux, uz, length, width } = rect;
  const vx = -uz;
  const vz = ux;
  const at = (u: number, v: number): [number, number] => [cx + ux * u + vx * v, cz + uz * u + vz * v];
  const hl = length / 2;
  const hw = width / 2;
  const corners = [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw)];
  addWalls(walls, corners, base, top, wallColor);
  const rise = Math.min(2.6, Math.max(0.8, width * 0.32));
  const ridge = top + rise;
  // Hastiales (triángulos de pared en los extremos cortos).
  for (const end of [-1, 1]) {
    const n: [number, number, number] = [ux * end, 0, uz * end];
    const [ax, az] = at(end * hl, -hw);
    const [bx, bz] = at(end * hl, hw);
    const [rx, rz] = at(end * hl, 0);
    const a = walls.vertex(ax, top, az, n, 0, top - base, wallColor);
    const b = walls.vertex(bx, top, bz, n, width, top - base, wallColor);
    const c = walls.vertex(rx, ridge, rz, n, hw, top - base + rise, wallColor);
    walls.triangle(a, b, c, n);
  }
  // Faldones con alero de 0,35 m.
  const overhang = 0.35;
  const slope = rise / hw;
  const eave = top - overhang * slope;
  const slant = Math.hypot(hw + overhang, rise + overhang * slope);
  for (const side of [-1, 1]) {
    const ny = hw;
    const nh = rise;
    const norm = Math.hypot(ny, nh);
    const n: [number, number, number] = [(vx * side * nh) / norm, ny / norm, (vz * side * nh) / norm];
    const [e0x, e0z] = at(-hl - overhang, side * (hw + overhang));
    const [e1x, e1z] = at(hl + overhang, side * (hw + overhang));
    const [r1x, r1z] = at(hl + overhang, 0);
    const [r0x, r0z] = at(-hl - overhang, 0);
    const a = roof.vertex(e0x, eave, e0z, n, 0, 0, roofColor);
    const b = roof.vertex(e1x, eave, e1z, n, length + 2 * overhang, 0, roofColor);
    const c = roof.vertex(r1x, ridge, r1z, n, length + 2 * overhang, slant, roofColor);
    const d = roof.vertex(r0x, ridge, r0z, n, 0, slant, roofColor);
    roof.quad(a, b, c, d, n);
  }
}

function tint(color: readonly [number, number, number], factor: number): [number, number, number] {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

export function buildBuildings(input: BuildingInput): BuildingSet {
  const builders = new Map<BuildingMaterial, MeshBuilder>(
    BUILDING_MATERIALS.map((material) => [material, new MeshBuilder(material)]),
  );
  const mesh = (material: BuildingMaterial): MeshBuilder => {
    const builder = builders.get(material);
    if (builder === undefined) throw new Error(`Material de edificación desconocido: ${material}`);
    return builder;
  };
  const half = input.heightfield.sizeM / 2 - 2;
  let count = 0;
  let tagged = 0;
  let estimated = 0;
  let pitched = 0;
  for (const polygon of input.polygons) {
    if (polygon.kind !== 'building') continue;
    const points = ringPoints(polygon.ring);
    if (points.length < 3) continue;
    const area = Math.abs(signedArea(points));
    if (area < 6 || area > 60_000) continue;
    if (points.some(([x, z]) => Math.abs(x) > half || Math.abs(z) > half)) continue;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of points) {
      cx += x / points.length;
      cz += z / points.length;
    }
    if (input.isExcluded(cx, cz)) continue;
    let groundMin = Infinity;
    let groundMax = -Infinity;
    for (const [x, z] of points) {
      const y = heightAt(input.heightfield, x, z);
      groundMin = Math.min(groundMin, y);
      groundMax = Math.max(groundMax, y);
    }
    const hash = hashCoords(input.seed, seedFromText(polygon.id));
    const urban = input.isUrban(cx, cz);
    const osmHeight =
      polygon.heightM !== null && polygon.heightM !== OPENMAPTILES_DEFAULT_HEIGHT_M
        ? polygon.heightM
        : null;
    let height: number;
    if (osmHeight !== null && osmHeight >= 2) {
      height = osmHeight;
      tagged++;
    } else {
      const r = unit(hashCoords(hash, 1));
      const floors = urban ? (r < 0.4 ? 1 : r < 0.78 ? 2 : 3) : r < 0.72 ? 1 : 2;
      height = floors * FLOOR_M + 0.4;
      estimated++;
    }
    const minHeight = polygon.minHeightM ?? 0;
    // Base enterrada medio metro bajo el punto más bajo: sin huecos en pendiente.
    const base = minHeight > 0 ? groundMin + minHeight : groundMin - 0.6;
    const top = Math.max(groundMin + height, groundMax + 2.2);
    const brick = unit(hashCoords(hash, 2)) < input.style.brickShare;
    const wallMaterial: BuildingMaterial = brick ? 'brick' : 'plaster';
    const wallColor = brick
      ? tint([1, 1, 1], 0.9 + 0.15 * unit(hashCoords(hash, 3)))
      : (PLASTER_COLORS[Math.floor(unit(hashCoords(hash, 3)) * PLASTER_COLORS.length)] ?? [1, 1, 1]);
    const roofShade = 0.85 + 0.25 * unit(hashCoords(hash, 4));

    const rect = minAreaRect(points);
    const rectangular = rect.length * rect.width > 0 && area / (rect.length * rect.width) > 0.82;
    const pitchedShare = urban ? input.style.pitchedShare * 0.35 : input.style.pitchedShare;
    const canPitch =
      rectangular &&
      area >= 20 &&
      area <= 400 &&
      height <= 9 &&
      minHeight === 0 &&
      rect.width >= 3.5 &&
      points.length <= 10;
    if (canPitch && unit(hashCoords(hash, 5)) < pitchedShare) {
      const metal = unit(hashCoords(hash, 6)) < input.style.metalRoofShare;
      addGableHouse(
        mesh(wallMaterial),
        mesh(metal ? 'roofMetal' : 'roofTiles'),
        rect,
        base,
        top,
        wallColor,
        tint([1, 1, 1], roofShade),
      );
      pitched++;
    } else {
      addWalls(mesh(wallMaterial), points, base, top, wallColor);
      addFlatRoof(mesh('roofFlat'), points, top, tint([1, 1, 1], roofShade));
    }
    count++;
  }
  return {
    meshes: [...builders.values()].filter((b) => b.indices.length > 0).map((b) => b.build()),
    count,
    taggedHeights: tagged,
    estimatedHeights: estimated,
    pitchedRoofs: pitched,
  };
}

