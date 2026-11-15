/**
 * Recursos de GPU del terreno creados a partir del mundo generado, y su liberación.
 */
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector3,
} from 'three';

import type { GeneratedWorld } from '../world/generate.ts';
import { heightAtNode } from '../world/heightfield.ts';
import type { MeshData } from '../world/terrainMesh.ts';
import {
  createTerrainMaterial,
  type TerrainMaterialTextures,
  terrainMaterialTextures,
} from './terrainMaterial.ts';

export interface TerrainChunkResource {
  readonly levels: readonly BufferGeometry[];
  readonly center: Vector3;
}

export interface TerrainResources {
  readonly chunks: readonly TerrainChunkResource[];
  readonly context: BufferGeometry;
  readonly apron: BufferGeometry;
  readonly apronMaterial: MeshBasicMaterial;
  readonly detailMaterial: MeshStandardMaterial;
  readonly contextMaterial: MeshStandardMaterial;
  readonly textures: readonly Texture[];
  /** Memoria de GPU estimada de las texturas del terreno (bytes, con mipmaps). */
  readonly textureBytes: number;
}

export function geometryFromMesh(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  const vertexCount = mesh.positions.length / 3;
  geometry.setIndex(
    new BufferAttribute(vertexCount < 65_536 ? Uint16Array.from(mesh.indices) : mesh.indices, 1),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function dataTexture(data: Uint8Array, size: number, srgb = false): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function arrayTexture(
  data: Uint8Array,
  size: number,
  layers: number,
  srgb: boolean,
  anisotropy: number,
): DataArrayTexture {
  const texture = new DataArrayTexture(data, size, size, layers);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/** Anillo exterior plano (del borde del contexto a 60 km), siempre cubierto por la niebla. */
function apronGeometry(innerHalf: number, outerHalf: number, y: number): BufferGeometry {
  const i = innerHalf;
  const o = outerHalf;
  const positions = new Float32Array([
    -o,
    y,
    -o,
    o,
    y,
    -o,
    o,
    y,
    o,
    -o,
    y,
    o,
    -i,
    y,
    -i,
    i,
    y,
    -i,
    i,
    y,
    i,
    -i,
    y,
    i,
  ]);
  // Cuatro trapecios entre el cuadrado exterior (0–3) y el interior (4–7), caras hacia arriba.
  const indices = [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(24).map((_, k) => (k % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTerrainResources(
  world: GeneratedWorld,
  anisotropy: number,
): TerrainResources {
  const { build, textures } = world;
  const chunks = build.chunks.map((chunk) => ({
    levels: chunk.levels.map(geometryFromMesh),
    center: new Vector3(...chunk.center),
  }));
  const context = geometryFromMesh(build.contextRing);

  // Altura media del borde del contexto: el anillo exterior queda unos metros por debajo.
  const n = build.context.segments;
  let edgeSum = 0;
  for (let k = 0; k <= n; k++) {
    edgeSum +=
      heightAtNode(build.context, k, 0) +
      heightAtNode(build.context, k, n) +
      heightAtNode(build.context, 0, k) +
      heightAtNode(build.context, n, k);
  }
  const apronY = edgeSum / (4 * (n + 1)) - 5;
  const apron = apronGeometry(build.context.sizeM / 2 - build.context.spacingM, 60_000, apronY);

  const splat = build.splat;
  const empty = new Uint8Array(4 * 4 * 4).fill(255);
  const transparent = (): Uint8Array => new Uint8Array(4 * 4 * 4);
  const materialTextures: TerrainMaterialTextures = {
    albedoHeight: arrayTexture(
      textures.albedoHeight,
      textures.resolution,
      textures.layers,
      true,
      anisotropy,
    ),
    normalRoughAo: arrayTexture(
      textures.normalRoughAo,
      textures.resolution,
      textures.layers,
      false,
      anisotropy,
    ),
    tileSizeM: textures.tileSizeM,
    weightsA: dataTexture(splat.weightsA, splat.resolution),
    weightsB: dataTexture(splat.weightsB, splat.resolution),
    weightsC: dataTexture(splat.weightsC, splat.resolution),
    fieldInfo: dataTexture(splat.fieldInfo, splat.resolution),
    featureField:
      build.featureField === null
        ? dataTexture(empty, 4)
        : dataTexture(build.featureField.data, build.featureField.resolution),
    contextWeightsA: dataTexture(build.contextSplat.weightsA, build.contextSplat.resolution),
    contextWeightsB: dataTexture(build.contextSplat.weightsB, build.contextSplat.resolution),
    contextWeightsC: dataTexture(build.contextSplat.weightsC, build.contextSplat.resolution),
    satelliteDetail:
      build.satelliteDetail === null
        ? dataTexture(transparent(), 4, true)
        : dataTexture(build.satelliteDetail.data, build.satelliteDetail.resolution, true),
    satelliteContext:
      build.satelliteContext === null
        ? dataTexture(transparent(), 4, true)
        : dataTexture(build.satelliteContext.data, build.satelliteContext.resolution, true),
  };
  const options = {
    textures: materialTextures,
    detailSizeM: build.detail.sizeM,
    contextSizeM: build.context.sizeM,
    fieldAngleRad: build.mosaic.angleRad,
    satelliteStrength: build.satelliteDetail === null && build.satelliteContext === null ? 0 : 1,
  };
  const detailMaterial = createTerrainMaterial({ ...options, isContext: false });
  const contextMaterial = createTerrainMaterial({ ...options, isContext: true });
  const list = terrainMaterialTextures(materialTextures);
  const textureBytes = list.reduce((sum, texture) => {
    const image = texture.image as { width: number; height: number; depth?: number };
    return sum + (image.width * image.height * (image.depth ?? 1) * 4 * 4) / 3;
  }, 0);
  return {
    chunks,
    context,
    apron,
    apronMaterial: new MeshBasicMaterial({ color: '#9fb3c1', fog: true }),
    detailMaterial,
    contextMaterial,
    textures: list,
    textureBytes,
  };
}

export function disposeTerrainResources(resources: TerrainResources): void {
  for (const chunk of resources.chunks) for (const level of chunk.levels) level.dispose();
  resources.context.dispose();
  resources.apron.dispose();
  resources.apronMaterial.dispose();
  resources.detailMaterial.dispose();
  resources.contextMaterial.dispose();
  for (const texture of resources.textures) texture.dispose();
}

/** Nivel de detalle de un fragmento según su distancia a la cámara. */
export function chunkLevelFor(
  distanceM: number,
  chunkSizeM: number,
  lodScale: number,
  levels: number,
): number {
  const level0 = chunkSizeM * 1.6 * lodScale;
  const level1 = chunkSizeM * 4 * lodScale;
  const level = distanceM < level0 ? 0 : distanceM < level1 ? 1 : 2;
  return Math.min(level, levels - 1);
}
