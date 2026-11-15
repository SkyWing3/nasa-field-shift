/**
 * Procesado de modelos glTF para la web con glTF-Transform:
 * limpieza (sin mezclar variantes) → LOD en el mismo GLB con texturas compartidas → texturas
 * WebP → compresión meshopt → validación Khronos y comprobaciones de escala.
 *
 * Se conserva el origen del autor: en Poly Haven Y = 0 es el suelo (raíces y bases de roca quedan
 * por debajo a propósito) y el pivote de los árboles está en el tronco.
 */
import path from 'node:path';

import {
  type Document,
  Logger,
  type Mesh,
  type Node,
  NodeIO,
  Primitive,
  type Texture,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import {
  center,
  dedup,
  flatten,
  getBounds,
  join,
  listTextureSlots,
  meshopt,
  prune,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

import type {
  AssetFile,
  GltfValidatorSummary,
  ModelInfo,
  ModelLod,
  ModelMaterial,
  ModelTexture,
  ValidationCheck,
} from '../../src/assets/catalogSchema.ts';
import type { ModelSelection } from '../selection.ts';
import { hashBytes, safeJoin, toPosixRelative, writeFileAtomic } from './files.ts';
import { validateGlb } from './gltfValidation.ts';
import { blenderMmToGltfMeters, compareSizes, sizeOfBounds, type Vec3 } from './scale.ts';
import { simplifyPrimitiveWithAttributes } from './simplify.ts';
import type { SourceMetadata } from './sources.ts';
import { WEBP_COLOR, WEBP_DATA } from './webp.ts';

/** Error máximo de simplificación (fracción del radio de la malla) por nivel. */
const LOD_ERROR = [0.01, 0.03, 0.08] as const;
/** La simplificación del LOD0 puede recortar extremos finos: tolerancia de tamaño frente al origen. */
const SIZE_TOLERANCE = 0.03;
/** Tolerancia para considerar que coinciden las dimensiones publicadas por la fuente. */
const PUBLISHED_SIZE_TOLERANCE = 0.05;

let ioInstance: Promise<NodeIO> | null = null;

function getIO(): Promise<NodeIO> {
  ioInstance ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
    return new NodeIO()
      .setLogger(new Logger(Logger.Verbosity.ERROR))
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });
  })();
  return ioInstance;
}

interface GeometryCount {
  triangles: number;
  vertices: number;
  drawCalls: number;
}

function countPrimitive(primitive: Primitive): GeometryCount {
  const vertices = primitive.getAttribute('POSITION')?.getCount() ?? 0;
  const indexCount = primitive.getIndices()?.getCount() ?? vertices;
  const triangles =
    primitive.getMode() === Primitive.Mode.TRIANGLES ? Math.floor(indexCount / 3) : 0;
  return { triangles, vertices, drawCalls: 1 };
}

function countSubtree(root: Node): GeometryCount {
  const total: GeometryCount = { triangles: 0, vertices: 0, drawCalls: 0 };
  root.traverse((node) => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const count = countPrimitive(primitive);
      total.triangles += count.triangles;
      total.vertices += count.vertices;
      total.drawCalls += count.drawCalls;
    }
  });
  return total;
}

function meshNodesOf(root: Node): Node[] {
  const nodes: Node[] = [];
  root.traverse((node) => {
    if (node.getMesh() !== null) nodes.push(node);
  });
  return nodes;
}

/** Copia una primitiva con accesores propios (la simplificación modifica los datos in situ). */
function clonePrimitiveDeep(primitive: Primitive): Primitive {
  const copy = primitive.clone();
  for (const semantic of primitive.listSemantics()) {
    const accessor = primitive.getAttribute(semantic);
    if (accessor !== null) copy.setAttribute(semantic, accessor.clone());
  }
  const indices = primitive.getIndices();
  if (indices !== null) copy.setIndices(indices.clone());
  return copy;
}

function simplifyMeshes(meshes: Iterable<Mesh>, ratio: number, error: number): void {
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      simplifyPrimitiveWithAttributes(primitive, ratio, error);
    }
  }
}

function buildLod(
  document: Document,
  lod0: Node,
  level: number,
  ratio: number,
  error: number,
): Node {
  const lodRoot = document.createNode(`LOD${level}`);
  const meshCopies = new Map<Mesh, Mesh>();
  for (const node of meshNodesOf(lod0)) {
    const sourceMesh = node.getMesh();
    if (sourceMesh === null) continue;
    let mesh = meshCopies.get(sourceMesh);
    if (mesh === undefined) {
      mesh = document.createMesh(`${sourceMesh.getName()}_LOD${level}`);
      for (const primitive of sourceMesh.listPrimitives()) {
        mesh.addPrimitive(clonePrimitiveDeep(primitive));
      }
      simplifyMeshes([mesh], ratio, error);
      meshCopies.set(sourceMesh, mesh);
    }
    lodRoot.addChild(
      document
        .createNode(`${node.getName()}_LOD${level}`)
        .setMesh(mesh)
        .setMatrix(node.getWorldMatrix()),
    );
  }
  return lodRoot;
}

/** Quita el sufijo `_LOD0` de los nombres de Poly Haven: los niveles los define el pipeline. */
function stripSourceLodSuffix(document: Document): void {
  const root = document.getRoot();
  for (const property of [...root.listNodes(), ...root.listMeshes()]) {
    property.setName(property.getName().replace(/_LOD0$/i, ''));
  }
}

const SLOT_LABELS: Readonly<Record<string, string>> = {
  baseColorTexture: 'baseColor',
  normalTexture: 'normal',
  occlusionTexture: 'occlusion',
  metallicRoughnessTexture: 'metallicRoughness',
  emissiveTexture: 'emissive',
};

function describeMaterials(document: Document): ModelMaterial[] {
  return document
    .getRoot()
    .listMaterials()
    .map((material) => {
      const textures: ModelTexture[] = [];
      const slots: readonly (readonly [string, Texture | null])[] = [
        ['baseColorTexture', material.getBaseColorTexture()],
        ['normalTexture', material.getNormalTexture()],
        ['occlusionTexture', material.getOcclusionTexture()],
        ['metallicRoughnessTexture', material.getMetallicRoughnessTexture()],
        ['emissiveTexture', material.getEmissiveTexture()],
      ];
      for (const [slot, texture] of slots) {
        if (texture === null) continue;
        const size = texture.getSize();
        textures.push({
          slot: SLOT_LABELS[slot] ?? slot,
          width: size?.[0] ?? 0,
          height: size?.[1] ?? 0,
          mimeType: texture.getMimeType(),
          bytes: texture.getImage()?.byteLength ?? 0,
        });
      }
      return {
        name: material.getName(),
        alphaMode: material.getAlphaMode(),
        doubleSided: material.getDoubleSided(),
        textures,
      };
    });
}

const COLOR_SLOTS = /^(baseColorTexture|emissiveTexture)$/;

/**
 * Recodifica todas las texturas a WebP sin superar `maxSize` (conservando potencias de dos).
 * Se usa `sharp` directamente porque `textureCompress` no expone el submuestreo inteligente.
 */
async function encodeTexturesAsWebp(document: Document, maxSize: number): Promise<void> {
  document.createExtension(EXTTextureWebP).setRequired(true);
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (image === null) continue;
    const isColor = listTextureSlots(texture).some((slot) => COLOR_SLOTS.test(slot));
    const encoded = await sharp(image)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp(isColor ? WEBP_COLOR : WEBP_DATA)
      .toBuffer();
    const uri = texture.getURI();
    texture
      .setImage(new Uint8Array(encoded))
      .setMimeType('image/webp')
      .setURI(uri === '' ? '' : uri.replace(/\.[a-z0-9]+$/i, '.webp'));
  }
}

/** Memoria de GPU de texturas RGBA8 sin comprimir con su cadena de mipmaps (≈ 4/3). */
export function estimateGpuTextureBytes(sizes: Iterable<readonly [number, number]>): number {
  let total = 0;
  for (const [width, height] of sizes) total += Math.round((width * height * 4 * 4) / 3);
  return total;
}

const isPowerOfTwo = (value: number): boolean => value > 0 && (value & (value - 1)) === 0;

export interface ProcessedModel {
  readonly file: AssetFile;
  readonly info: ModelInfo;
  readonly checks: readonly ValidationCheck[];
  readonly gltfValidator: GltfValidatorSummary;
}

export async function processModel(
  selection: ModelSelection,
  sourceGltf: string,
  metadata: SourceMetadata,
  libraryDir: string,
): Promise<ProcessedModel> {
  const io = await getIO();
  const document = await io.read(sourceGltf);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (scene === undefined) throw new Error('El glTF de origen no contiene escenas');

  const sourceBounds = getBounds(scene);
  const sourceGltfSizeM = sizeOfBounds(sourceBounds.min, sourceBounds.max);
  const sourceTriangles = scene
    .listChildren()
    .reduce((sum, child) => sum + countSubtree(child).triangles, 0);

  // 1. Limpieza: un nodo por variante con sus primitivas unidas por material (sin mezclar
  //    variantes entre sí) y vértices soldados para poder simplificar.
  stripSourceLodSuffix(document);
  await document.transform(dedup(), flatten(), join({ keepMeshes: true }), weld(), prune());
  if (selection.pivot === 'base') {
    // Solo se desplaza en Y: el punto más bajo pasa a Y = 0 y X/Z conservan el origen del autor.
    await document.transform(center({ pivot: [0, getBounds(scene).min[1], 0] }));
  }

  // 2. LOD0: agrupa el contenido y lo simplifica solo si supera el presupuesto.
  const lod0 = document.createNode('LOD0');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    lod0.addChild(child);
  }
  scene.addChild(lod0);
  const variants = meshNodesOf(lod0).map((node) => node.getName());
  const original = countSubtree(lod0);
  if (original.triangles > selection.lod0MaxTriangles) {
    const meshes = new Set(meshNodesOf(lod0).flatMap((node) => node.getMesh() ?? []));
    simplifyMeshes(meshes, selection.lod0MaxTriangles / original.triangles, LOD_ERROR[0]);
  }

  // 3. Niveles adicionales a partir del LOD0, con texturas y materiales compartidos.
  selection.lodRatios.forEach((ratio, index) => {
    const level = index + 1;
    scene.addChild(buildLod(document, lod0, level, ratio, LOD_ERROR[level] ?? 0.1));
  });
  await document.transform(prune());

  // 4. Medidas (antes de cuantizar).
  const bounds = getBounds(lod0);
  const sizeM = sizeOfBounds(bounds.min, bounds.max);
  const preserved = compareSizes(sizeM, sourceGltfSizeM, SIZE_TOLERANCE);
  const publishedSizeM = blenderMmToGltfMeters(metadata.dimensionsMm);
  const published =
    publishedSizeM === null ? null : compareSizes(sizeM, publishedSizeM, PUBLISHED_SIZE_TOLERANCE);
  const lods: ModelLod[] = scene.listChildren().map((node, level) => ({
    level,
    nodeName: node.getName(),
    ...countSubtree(node),
  }));

  // 5. Texturas a WebP con ajustes distintos para color y para datos (normal, ORM).
  await encodeTexturesAsWebp(document, selection.maxTextureSize);
  const materials = describeMaterials(document);
  const textureSizes = root
    .listTextures()
    .map((texture) => texture.getSize())
    .filter((size): size is [number, number] => size !== null);

  // 6. Compresión de geometría (cuantización + EXT_meshopt_compression) y validación final.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const glb = await io.writeBinary(document);
  const outputPath = safeJoin(libraryDir, path.join('models', selection.id, `${selection.id}.glb`));
  await writeFileAtomic(outputPath, glb);
  const validation = await validateGlb(glb, path.basename(outputPath));

  const height = sizeM[1];
  const baseY = bounds.min[1];
  const [minHeight, maxHeight] = selection.heightRangeM;
  const lod0Triangles = lods[0]?.triangles ?? 0;
  const checks: ValidationCheck[] = [
    {
      name: 'glTF-Validator de Khronos sin errores',
      passed: validation.summary.errors === 0,
      detail:
        validation.summary.errors === 0
          ? `0 errores, ${validation.summary.warnings} avisos, ${validation.summary.infos} informativos (validador ${validation.validatorVersion})`
          : validation.errorMessages.slice(0, 5).join(' | '),
    },
    {
      name: `Escala del glTF de origen conservada (±${SIZE_TOLERANCE * 100} %)`,
      passed: preserved.status === 'ok',
      detail: `Procesado ${formatSize(sizeM)} · origen ${formatSize(sourceGltfSizeM)} · diferencia máx. ${percent(preserved.maxRelativeError)}`,
    },
    {
      name: `Altura plausible en metros para su tipo (${minHeight}–${maxHeight} m)`,
      passed: height >= minHeight && height <= maxHeight,
      detail: `Altura ${height.toFixed(3)} m`,
    },
    selection.pivot === 'base'
      ? {
          name: 'Apoyado en el suelo (punto más bajo en Y = 0)',
          passed: Math.abs(baseY) <= 0.005,
          detail: `Punto más bajo a ${baseY.toFixed(4)} m`,
        }
      : {
          name: 'Origen del autor en el suelo (Y = 0)',
          // Nada flota sobre el suelo y lo enterrado (raíces, base de rocas) es menos de la mitad.
          passed: baseY <= 0.01 && baseY >= -0.5 * height,
          detail: `Punto más bajo a ${baseY.toFixed(3)} m (${percent(-baseY / height)} de la altura bajo el suelo)`,
        },
    {
      name: 'LOD0 dentro del presupuesto de triángulos',
      passed: lod0Triangles <= selection.lod0MaxTriangles * 1.05,
      detail: `${formatCount(lod0Triangles)} de ${formatCount(selection.lod0MaxTriangles)} (origen: ${formatCount(sourceTriangles)})`,
    },
    {
      name: 'Cada LOD reduce triángulos',
      passed: lods.every(
        (lod, index) => index === 0 || lod.triangles < (lods[index - 1]?.triangles ?? 0),
      ),
      detail: lods.map((lod) => `LOD${lod.level}: ${formatCount(lod.triangles)}`).join(' · '),
    },
    {
      name: `Texturas ≤ ${selection.maxTextureSize} px y potencia de dos`,
      passed: textureSizes.every(
        ([width, textureHeight]) =>
          width <= selection.maxTextureSize &&
          textureHeight <= selection.maxTextureSize &&
          isPowerOfTwo(width) &&
          isPowerOfTwo(textureHeight),
      ),
      detail: [...new Set(textureSizes.map(([width, h]) => `${width}×${h}`))].join(', '),
    },
  ];

  return {
    file: {
      path: toPosixRelative(libraryDir, outputPath),
      role: 'model',
      format: 'glb',
      bytes: glb.byteLength,
      sha256: hashBytes(glb),
    },
    info: {
      lods,
      variants,
      sizeM: roundVec(sizeM),
      sourceGltfSizeM: roundVec(sourceGltfSizeM),
      publishedSizeM: publishedSizeM === null ? null : roundVec(publishedSizeM),
      publishedSizeCheck:
        published === null ? 'unavailable' : published.status === 'ok' ? 'match' : 'differs',
      sourceTriangles,
      materials,
      gpuTextureBytes: estimateGpuTextureBytes(textureSizes),
    },
    checks,
    gltfValidator: validation.summary,
  };
}

const round = (value: number, decimals = 3): number => Number(value.toFixed(decimals));
const roundVec = (vector: Vec3): Vec3 => [round(vector[0]), round(vector[1]), round(vector[2])];
const formatSize = (vector: Vec3): string =>
  `${vector.map((value) => value.toFixed(3)).join(' × ')} m`;
const formatCount = (value: number): string => value.toLocaleString('es-ES');
const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;
