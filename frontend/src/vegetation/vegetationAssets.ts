/**
 * Carga de los modelos GLB de vegetación del catálogo y extracción de cada variante por nivel de
 * detalle, lista para instanciar.
 *
 * Los GLB del pipeline (fase 02) tienen nodos `LOD0…LOD2` con las variantes colocadas en fila y
 * la escala de descuantización de meshopt en el nodo. En lugar de transformar las geometrías
 * (cuantizadas), esa matriz de nodo se combina con la de cada instancia, y la variante se
 * recentra en su propio pie.
 */
import {
  Box3,
  type BufferGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Sphere,
  Vector3,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { type AssetCatalog, assetFileUrl } from '../assets';
import {
  SPECIES,
  SPECIES_ORDER,
  type SpeciesId,
  type SpeciesModel,
} from '../world/vegetationSpecies.ts';

export interface VegetationPart {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  /** Matriz del nodo (descuantización + recentrado) en el espacio del modelo. */
  readonly matrix: Matrix4;
}

export interface VegetationModel {
  readonly key: string;
  /** Partes de cada LOD (una por material). */
  readonly lods: readonly (readonly VegetationPart[])[];
  /** Esfera envolvente del LOD0 en el espacio del modelo (m). */
  readonly bounds: Sphere;
  readonly heightM: number;
}

export type SpeciesModels = Readonly<Record<SpeciesId, readonly VegetationModel[]>>;

export function modelKey(model: SpeciesModel): string {
  return `${model.assetId}|${model.variant}`;
}

function prepareMaterial(material: Material): Material {
  // Hojas con transparencia por mezcla → recorte alfa: se puede instanciar sin ordenar y proyectar
  // sombras recortadas. `alphaToCoverage` suaviza los bordes con el antialiasing (MSAA).
  if (
    material instanceof MeshStandardMaterial &&
    (material.transparent || material.alphaTest > 0)
  ) {
    material.transparent = false;
    material.depthWrite = true;
    material.alphaTest = Math.max(material.alphaTest, 0.45);
    material.alphaToCoverage = true;
  }
  return material;
}

function variantNode(gltf: GLTF, level: number, variant: string): Object3D | null {
  const root = gltf.scene.getObjectByName(`LOD${String(level)}`);
  if (root === undefined) return null;
  const name = level === 0 ? variant : `${variant}_LOD${String(level)}`;
  return root.children.find((child) => child.name === name) ?? null;
}

function partsOf(node: Object3D, recenter: Matrix4): VegetationPart[] {
  node.updateMatrix();
  const parts: VegetationPart[] = [];
  const visit = (object: Object3D, parent: Matrix4): void => {
    object.updateMatrix();
    const matrix = parent.clone().multiply(object.matrix);
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials as Material[]) {
        parts.push({
          geometry: object.geometry as BufferGeometry,
          material: prepareMaterial(material),
          matrix,
        });
      }
    }
    for (const child of object.children) visit(child, matrix);
  };
  visit(node, recenter);
  return parts;
}

function extractModel(gltf: GLTF, model: SpeciesModel): VegetationModel | null {
  const lod0 = variantNode(gltf, 0, model.variant);
  if (lod0 === null) return null;
  // Recentrado horizontal: el pie de la variante queda en el origen del modelo. Los nodos LODn
  // y la escena no tienen transformación, así que el espacio del mundo es el del modelo.
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(lod0, true);
  const center = box.getCenter(new Vector3());
  const recenter = new Matrix4().makeTranslation(-center.x, 0, -center.z);
  const lods: VegetationPart[][] = [];
  for (let level = 0; level < 3; level++) {
    const node = variantNode(gltf, level, model.variant);
    if (node === null) break;
    lods.push(partsOf(node, recenter));
  }
  const recentered = box.clone().translate(new Vector3(-center.x, 0, -center.z));
  return {
    key: modelKey(model),
    lods,
    bounds: recentered.getBoundingSphere(new Sphere()),
    heightM: recentered.max.y,
  };
}

function modelUrl(catalog: AssetCatalog, assetId: string): string {
  const asset = catalog.assets.find((entry) => entry.id === assetId);
  const file = asset?.files.find((candidate) => candidate.format === 'glb');
  if (asset?.status !== 'available' || file === undefined) {
    throw new Error(`Falta el modelo «${assetId}» en el catálogo (ejecuta make assets)`);
  }
  return assetFileUrl(file.path);
}

export interface LoadedVegetation {
  readonly models: SpeciesModels;
  readonly gltfs: readonly GLTF[];
}

export async function loadVegetationModels(catalog: AssetCatalog): Promise<LoadedVegetation> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const assetIds = [
    ...new Set(SPECIES_ORDER.flatMap((id) => SPECIES[id].models.map((m) => m.assetId))),
  ];
  const loaded = new Map<string, GLTF>();
  await Promise.all(
    assetIds.map(async (assetId) => {
      loaded.set(assetId, await loader.loadAsync(modelUrl(catalog, assetId)));
    }),
  );
  const models = {} as Record<SpeciesId, VegetationModel[]>;
  for (const id of SPECIES_ORDER) {
    models[id] = SPECIES[id].models.map((model) => {
      const gltf = loaded.get(model.assetId);
      const extracted = gltf === undefined ? null : extractModel(gltf, model);
      if (extracted === null) {
        throw new Error(`El modelo ${model.assetId} no contiene la variante ${model.variant}`);
      }
      return extracted;
    });
  }
  return { models, gltfs: [...loaded.values()] };
}

export function disposeVegetation(vegetation: LoadedVegetation): void {
  for (const gltf of vegetation.gltfs) {
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      (object.geometry as BufferGeometry).dispose();
      const materials = (
        Array.isArray(object.material) ? object.material : [object.material]
      ) as Material[];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value !== null && typeof value === 'object' && 'isTexture' in value)
            (value as { dispose: () => void }).dispose();
        }
        material.dispose();
      }
    });
  }
}
