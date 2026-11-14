/**
 * Dibujo instanciado de la vegetación (`InstancedMesh`): una malla por modelo, nivel de detalle y
 * material. En cada actualización (solo cuando la cámara se mueve) se recorren las celdas de la
 * rejilla de instancias, se descartan las que están fuera del campo de visión (frustum culling)
 * o demasiado lejos, y cada ejemplar visible se asigna al LOD que le corresponde por distancia.
 */
import {
  Box3,
  type Camera,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';

import { heightAt, type Heightfield } from '../world/heightfield.ts';
import {
  INSTANCE_STRIDE,
  type InstanceSet,
  type ScatterContext,
  scatterGroundCoverCell,
} from '../world/scatter.ts';
import { SPECIES, type SpeciesId } from '../world/vegetationSpecies.ts';
import { type Impostor, impostorInstanceMatrix } from './impostor.ts';
import type { SpeciesModels, VegetationModel } from './vegetationAssets.ts';

/** Distancias de los árboles: LOD2 hasta 350 m e impostor hasta 2,5 km. */
export const TREE_IMPOSTOR_START_M = 350;
export const TREE_IMPOSTOR_CULL_M = 2_500;
const GROUND_CELL_M = 16;
const GROUND_CACHE_LIMIT = 900;

class Bucket {
  readonly meshes: InstancedMesh[];
  readonly matrices: Matrix4[];
  readonly group: Group;
  readonly model: VegetationModel | null;
  readonly level: number;
  count = 0;
  private capacity: number;
  private readonly impostor: Impostor | null;

  constructor(
    group: Group,
    model: VegetationModel | null,
    level: number,
    capacity: number,
    castShadow: boolean,
    impostor: Impostor | null,
  ) {
    this.group = group;
    this.model = model;
    this.level = level;
    this.impostor = impostor;
    this.capacity = Math.max(16, capacity);
    this.meshes = [];
    this.matrices = [];
    this.build(castShadow);
  }

  private build(castShadow: boolean): void {
    if (this.impostor !== null) {
      this.meshes.push(this.createMesh(this.impostor.geometry, this.impostor.material, false));
      this.matrices.push(new Matrix4());
      return;
    }
    for (const part of this.model?.lods[this.level] ?? []) {
      this.meshes.push(this.createMesh(part.geometry, part.material, castShadow));
      this.matrices.push(part.matrix);
    }
  }

  private createMesh(
    geometry: InstancedMesh['geometry'],
    material: InstancedMesh['material'],
    castShadow: boolean,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, this.capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false; // el descarte se hace por celdas
    mesh.castShadow = castShadow;
    mesh.receiveShadow = this.impostor === null;
    mesh.count = 0;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  begin(): void {
    this.count = 0;
  }

  /** Añade un ejemplar con su matriz de instancia (posición, giro, escala). */
  push(instance: Matrix4, scratch: Matrix4): void {
    if (this.count >= this.capacity) this.grow();
    const offset = this.count * 16;
    this.meshes.forEach((mesh, k) => {
      const part = this.matrices[k];
      if (this.impostor !== null || part === undefined)
        instance.toArray(mesh.instanceMatrix.array, offset);
      else scratch.multiplyMatrices(instance, part).toArray(mesh.instanceMatrix.array, offset);
    });
    this.count++;
  }

  private grow(): void {
    this.capacity *= 2;
    for (const mesh of this.meshes) {
      const array = new Float32Array(this.capacity * 16);
      array.set(mesh.instanceMatrix.array);
      mesh.instanceMatrix = new InstancedBufferAttribute(array, 16);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }
  }

  end(): void {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.visible = this.count > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  triangles(): number {
    return this.meshes.reduce((sum, mesh) => {
      const index = mesh.geometry.index;
      const triangles =
        index === null ? (mesh.geometry.attributes.position?.count ?? 0) / 3 : index.count / 3;
      return sum + triangles * mesh.count;
    }, 0);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }
}

export interface VegetationStats {
  readonly visible: Readonly<Record<SpeciesId, number>>;
  readonly impostors: number;
  readonly triangles: number;
  readonly groundCells: number;
}

export interface VegetationRendererOptions {
  readonly models: SpeciesModels;
  readonly far: Readonly<Record<'tree' | 'shrub' | 'rock' | 'debris', InstanceSet>>;
  readonly impostors: readonly (Impostor | null)[];
  readonly scatter: ScatterContext;
  readonly heightfield: Heightfield;
  readonly lodScale: number;
  readonly groundCoverRadiusM: number;
  readonly grassDensity: number;
}

export class VegetationRenderer {
  readonly group = new Group();
  private readonly buckets = new Map<string, Bucket>();
  private readonly frustum = new Frustum();
  private readonly projView = new Matrix4();
  private readonly box = new Box3();
  private readonly instance = new Matrix4();
  private readonly scratch = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly lastPosition = new Vector3(Infinity, Infinity, Infinity);
  private readonly lastQuaternion = new Quaternion();
  private readonly groundCache = new Map<string, Float32Array>();
  private stats: VegetationStats = {
    visible: { tree: 0, shrub: 0, rock: 0, debris: 0, grass: 0, weed: 0 },
    impostors: 0,
    triangles: 0,
    groundCells: 0,
  };

  private readonly options: VegetationRendererOptions;

  constructor(options: VegetationRendererOptions) {
    this.options = options;
    this.group.name = 'vegetacion';
    for (const id of ['tree', 'shrub', 'rock', 'debris', 'grass', 'weed'] as const) {
      const config = SPECIES[id];
      const models = options.models[id];
      const counts = this.modelCounts(id, models.length);
      models.forEach((model, index) => {
        const capacity = counts[index] ?? 1024;
        model.lods.forEach((_, level) => {
          this.buckets.set(
            `${id}:${String(index)}:${String(level)}`,
            new Bucket(this.group, model, level, capacity, config.castShadow && level < 2, null),
          );
        });
        const impostor = id === 'tree' ? (options.impostors[index] ?? null) : null;
        if (impostor !== null) {
          this.buckets.set(
            `${id}:${String(index)}:impostor`,
            new Bucket(this.group, model, 3, capacity, false, impostor),
          );
        }
      });
    }
  }

  private modelCounts(id: SpeciesId, modelCount: number): number[] {
    const counts = new Array<number>(modelCount).fill(
      id === 'grass' ? 2048 : id === 'weed' ? 256 : 16,
    );
    if (id === 'grass' || id === 'weed') return counts;
    const set = this.options.far[id];
    counts.fill(0);
    for (let k = 0; k < set.count; k++) {
      const model = set.data[k * INSTANCE_STRIDE + 5] ?? 0;
      counts[model] = (counts[model] ?? 0) + 1;
    }
    return counts;
  }

  get currentStats(): VegetationStats {
    return this.stats;
  }

  /** Recalcula los ejemplares visibles si la cámara se movió (o si `force`). */
  update(camera: Camera, force = false): boolean {
    const moved =
      camera.position.distanceToSquared(this.lastPosition) > 0.25 ||
      Math.abs(camera.quaternion.dot(this.lastQuaternion)) < 0.99998;
    if (!moved && !force) return false;
    this.lastPosition.copy(camera.position);
    this.lastQuaternion.copy(camera.quaternion);
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    for (const bucket of this.buckets.values()) bucket.begin();

    const visible: Record<SpeciesId, number> = {
      tree: 0,
      shrub: 0,
      rock: 0,
      debris: 0,
      grass: 0,
      weed: 0,
    };
    let impostors = 0;
    for (const id of ['tree', 'shrub', 'rock', 'debris'] as const) {
      const set = this.options.far[id];
      const result = this.collect(id, set, camera.position);
      visible[id] = result.visible;
      impostors += result.impostors;
    }
    let groundCells = 0;
    const cam = camera.position;
    const above = cam.y - heightAt(this.options.heightfield, cam.x, cam.z);
    if (above < this.options.groundCoverRadiusM * 1.5) {
      for (const id of ['grass', 'weed'] as const) {
        const result = this.collectGround(id, cam);
        visible[id] = result.visible;
        groundCells += result.cells;
      }
    }
    let triangles = 0;
    for (const bucket of this.buckets.values()) {
      bucket.end();
      triangles += bucket.triangles();
    }
    this.stats = { visible, impostors, triangles, groundCells };
    return true;
  }

  private lodFor(id: SpeciesId, distance: number): number {
    const [l1, l2, cull] = SPECIES[id].lodDistancesM;
    const s = this.options.lodScale;
    if (id === 'tree') {
      if (distance < l1 * s) return 0;
      if (distance < l2 * s) return 1;
      if (distance < TREE_IMPOSTOR_START_M * s) return 2;
      return distance < TREE_IMPOSTOR_CULL_M ? 3 : -1;
    }
    const limit =
      id === 'grass' || id === 'weed' ? Math.min(cull, this.options.groundCoverRadiusM) : cull * s;
    if (distance >= limit) return -1;
    if (distance < l1 * s) return 0;
    return distance < l2 * s ? 1 : 2;
  }

  private pushInstance(id: SpeciesId, data: Float32Array, k: number, level: number): boolean {
    const base = k * INSTANCE_STRIDE;
    const x = data[base] ?? 0;
    const y = data[base + 1] ?? 0;
    const z = data[base + 2] ?? 0;
    const yaw = data[base + 3] ?? 0;
    const scale = data[base + 4] ?? 1;
    const model = data[base + 5] ?? 0;
    const key =
      level === 3 ? `${id}:${String(model)}:impostor` : `${id}:${String(model)}:${String(level)}`;
    let bucket = this.buckets.get(key);
    // Si el modelo no tiene ese nivel (p. ej. sin LOD2), se usa el más cercano disponible.
    for (let l = level - 1; bucket === undefined && l >= 0; l--)
      bucket = this.buckets.get(`${id}:${String(model)}:${String(l)}`);
    if (bucket === undefined) return false;
    if (level === 3) impostorInstanceMatrix(this.instance, x, y, z, yaw, scale);
    else {
      this.position.set(x, y, z);
      this.quaternion.setFromAxisAngle(UP, yaw);
      this.scale.setScalar(scale);
      this.instance.compose(this.position, this.quaternion, this.scale);
    }
    bucket.push(this.instance, this.scratch);
    return true;
  }

  private collect(
    id: SpeciesId,
    set: InstanceSet,
    cam: Vector3,
  ): { visible: number; impostors: number } {
    const hf = this.options.heightfield;
    const cull =
      id === 'tree' ? TREE_IMPOSTOR_CULL_M : SPECIES[id].lodDistancesM[2] * this.options.lodScale;
    let visible = 0;
    let impostors = 0;
    for (let j = 0; j < set.cellsPerSide; j++) {
      for (let i = 0; i < set.cellsPerSide; i++) {
        const cell = j * set.cellsPerSide + i;
        const start = set.cellStart[cell] ?? 0;
        const end = set.cellStart[cell + 1] ?? 0;
        if (start === end) continue;
        const x0 = set.origin + i * set.cellSizeM;
        const z0 = set.origin + j * set.cellSizeM;
        this.box.min.set(x0, hf.minY - 2, z0);
        this.box.max.set(x0 + set.cellSizeM, hf.maxY + 30, z0 + set.cellSizeM);
        if (this.box.distanceToPoint(cam) > cull || !this.frustum.intersectsBox(this.box)) continue;
        for (let k = start; k < end; k++) {
          const base = k * INSTANCE_STRIDE;
          const dx = (set.data[base] ?? 0) - cam.x;
          const dy = (set.data[base + 1] ?? 0) - cam.y;
          const dz = (set.data[base + 2] ?? 0) - cam.z;
          const level = this.lodFor(id, Math.sqrt(dx * dx + dy * dy + dz * dz));
          if (level < 0) continue;
          if (this.pushInstance(id, set.data, k, level)) {
            visible++;
            if (level === 3) impostors++;
          }
        }
      }
    }
    return { visible, impostors };
  }

  private collectGround(id: 'grass' | 'weed', cam: Vector3): { visible: number; cells: number } {
    const radius = this.options.groundCoverRadiusM;
    const hf = this.options.heightfield;
    const c0x = Math.floor((cam.x - radius) / GROUND_CELL_M);
    const c1x = Math.floor((cam.x + radius) / GROUND_CELL_M);
    const c0z = Math.floor((cam.z - radius) / GROUND_CELL_M);
    const c1z = Math.floor((cam.z + radius) / GROUND_CELL_M);
    let visible = 0;
    let cells = 0;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const x0 = cx * GROUND_CELL_M;
        const z0 = cz * GROUND_CELL_M;
        this.box.min.set(x0, hf.minY - 2, z0);
        this.box.max.set(x0 + GROUND_CELL_M, hf.maxY + 3, z0 + GROUND_CELL_M);
        if (this.box.distanceToPoint(cam) > radius || !this.frustum.intersectsBox(this.box))
          continue;
        const data = this.groundCell(id, cx, cz);
        cells++;
        for (let k = 0; k < data.length / INSTANCE_STRIDE; k++) {
          const base = k * INSTANCE_STRIDE;
          const dx = (data[base] ?? 0) - cam.x;
          const dy = (data[base + 1] ?? 0) - cam.y;
          const dz = (data[base + 2] ?? 0) - cam.z;
          const level = this.lodFor(id, Math.sqrt(dx * dx + dy * dy + dz * dz));
          if (level >= 0 && this.pushInstance(id, data, k, level)) visible++;
        }
      }
    }
    return { visible, cells };
  }

  private groundCell(id: 'grass' | 'weed', cx: number, cz: number): Float32Array {
    const key = `${id}:${String(cx)}:${String(cz)}`;
    const cached = this.groundCache.get(key);
    if (cached !== undefined) {
      // Orden de inserción como LRU: se vuelve a insertar al usarla.
      this.groundCache.delete(key);
      this.groundCache.set(key, cached);
      return cached;
    }
    const data = scatterGroundCoverCell(
      this.options.scatter,
      id,
      cx,
      cz,
      GROUND_CELL_M,
      this.options.grassDensity,
    );
    this.groundCache.set(key, data);
    if (this.groundCache.size > GROUND_CACHE_LIMIT) {
      const oldest = this.groundCache.keys().next().value;
      if (oldest !== undefined) this.groundCache.delete(oldest);
    }
    return data;
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) bucket.dispose();
    this.buckets.clear();
    this.groundCache.clear();
  }
}

const UP = new Vector3(0, 1, 0);
