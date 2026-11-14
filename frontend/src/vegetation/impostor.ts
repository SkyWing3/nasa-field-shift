/**
 * Impostores de árboles: a partir de unos cientos de metros, cada árbol se dibuja como un
 * rectángulo orientado a la cámara con una imagen del propio modelo, en lugar de sus ~11 000
 * triángulos del LOD2.
 *
 * Al cargar, cada modelo se fotografía (color base, sin iluminar) desde 8 direcciones y 2 alturas
 * en un atlas de 8 × 2, con el color medio del follaje como fondo para que los mipmaps no
 * oscurezcan los bordes. El impostor se ilumina con el sol y el HDRI como una superficie orientada
 * a la cámara, con un factor medio de autosombreado del follaje. Es una aproximación: se probó un
 * mapa de normales horneado, pero oscurecía los árboles vistos desde arriba y se descartó
 * (docs/PROGRESS.md, fase 04).
 */
import {
  type Material,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
  LinearMipmapLinearFilter,
  LinearFilter,
  DoubleSide,
  Color,
} from 'three';

import type { VegetationModel } from './vegetationAssets.ts';

export const IMPOSTOR_AZIMUTHS = 8;
export const IMPOSTOR_ELEVATIONS_DEG = [6, 42] as const;
const CELL_PX = 256;
const CELL_INSET = 0.04;

export interface Impostor {
  readonly albedo: WebGLRenderTarget;
  readonly material: MeshStandardMaterial;
  readonly geometry: PlaneGeometry;
  /** Centro de la esfera envolvente sobre el pie (m) y su radio (m), sin escalar. */
  readonly centerY: number;
  readonly radius: number;
}

/** Dirección desde el centro del modelo hacia la cámara de cada fotograma. */
export function impostorViewDirection(azimuthIndex: number, elevationIndex: number): Vector3 {
  const azimuth = (azimuthIndex / IMPOSTOR_AZIMUTHS) * Math.PI * 2;
  const elevation = ((IMPOSTOR_ELEVATIONS_DEG[elevationIndex] ?? 0) * Math.PI) / 180;
  return new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
}

function mapOf(material: Material): Texture | null {
  return material instanceof MeshStandardMaterial ? material.map : null;
}

const FALLBACK_FOLIAGE = new Color(0.2, 0.25, 0.12);

/**
 * Color medio (ponderado por el alfa) de la textura con más transparencia del modelo: las hojas.
 * Se usa como fondo del atlas para que los mipmaps no oscurezcan los bordes del follaje.
 */
function foliageColor(parts: readonly { readonly material: Material }[]): Color {
  const leaves = parts.map((part) => mapOf(part.material)).find((map) => map !== null);
  const image = leaves?.image as CanvasImageSource | undefined;
  if (image === undefined || typeof OffscreenCanvas === 'undefined')
    return FALLBACK_FOLIAGE.clone();
  const canvas = new OffscreenCanvas(32, 32);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return FALLBACK_FOLIAGE.clone();
  context.drawImage(image, 0, 0, 32, 32);
  const data = context.getImageData(0, 0, 32, 32).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let k = 0; k < data.length; k += 4) {
    const a = (data[k + 3] ?? 0) / 255;
    r += (data[k] ?? 0) * a;
    g += (data[k + 1] ?? 0) * a;
    b += (data[k + 2] ?? 0) * a;
    weight += a;
  }
  if (weight === 0) return FALLBACK_FOLIAGE.clone();
  // El color de borrado se interpreta en el espacio de trabajo lineal: se convierte desde sRGB.
  return new Color().setRGB(r / weight / 255, g / weight / 255, b / weight / 255, SRGBColorSpace);
}

/** Hornea el atlas de un modelo (LOD1 si existe) y crea el material instanciable del impostor. */
export function bakeImpostor(renderer: WebGLRenderer, model: VegetationModel): Impostor {
  const parts = model.lods[1] ?? model.lods[0] ?? [];
  const radius = model.bounds.radius;
  const center = model.bounds.center;
  const width = CELL_PX * IMPOSTOR_AZIMUTHS;
  const height = CELL_PX * IMPOSTOR_ELEVATIONS_DEG.length;
  const albedo = new WebGLRenderTarget(width, height, { depthBuffer: true, generateMipmaps: true });
  albedo.texture.colorSpace = SRGBColorSpace;
  albedo.texture.minFilter = LinearMipmapLinearFilter;
  albedo.texture.magFilter = LinearFilter;

  const albedoScene = new Scene();
  const created: Material[] = [];
  for (const part of parts) {
    const source = part.material;
    const map = mapOf(source);
    const base = new MeshBasicMaterial({
      map,
      color: source instanceof MeshStandardMaterial ? source.color : new Color('#ffffff'),
      alphaTest: map === null ? 0 : 0.45,
      side: DoubleSide,
    });
    created.push(base);
    const mesh = new Mesh(part.geometry, base);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(part.matrix);
    albedoScene.add(mesh);
  }

  const camera = new OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 6);
  const previousTarget = renderer.getRenderTarget();
  const previousClear = new Color();
  renderer.getClearColor(previousClear);
  const previousAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;
  // Cada fotograma se dibuja en su celda del atlas: sin borrado automático y con tijera en el
  // propio render target (en un render target, la tijera es una propiedad del destino).
  renderer.autoClear = false;
  const inset = Math.round(CELL_PX * CELL_INSET);
  for (const [target, scene, clear] of [[albedo, albedoScene, foliageColor(parts)]] as const) {
    target.scissorTest = false;
    target.viewport.set(0, 0, width, height);
    renderer.setRenderTarget(target);
    renderer.setClearColor(clear, 0);
    renderer.clear();
    target.scissorTest = true;
    for (let e = 0; e < IMPOSTOR_ELEVATIONS_DEG.length; e++) {
      for (let a = 0; a < IMPOSTOR_AZIMUTHS; a++) {
        const direction = impostorViewDirection(a, e);
        camera.position.copy(center).addScaledVector(direction, radius * 3);
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateMatrixWorld();
        const cell = new Vector4(
          a * CELL_PX + inset,
          e * CELL_PX + inset,
          CELL_PX - 2 * inset,
          CELL_PX - 2 * inset,
        );
        target.viewport.copy(cell);
        target.scissor.copy(cell);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }
    }
    target.scissorTest = false;
    target.viewport.set(0, 0, width, height);
  }
  renderer.autoClear = previousAutoClear;
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClear, previousAlpha);
  for (const material of created) material.dispose();

  const material = createImpostorMaterial(albedo.texture, center.y, radius);
  return { albedo, material, geometry: new PlaneGeometry(1, 1), centerY: center.y, radius };
}

const IMPOSTOR_VERTEX_PARS = /* glsl */ `
uniform float uImpostorCenterY;
uniform float uImpostorRadius;
varying vec2 vImpostorUv;
`;

// Sustituye la orientación y la proyección: rectángulo esférico orientado a la cámara, con el
// fotograma del atlas elegido por la dirección de la vista respecto al giro de cada ejemplar.
const IMPOSTOR_BEGIN_NORMAL = /* glsl */ `
vec3 impostorPos = instanceMatrix[3].xyz;
float impostorScale = length(instanceMatrix[0].xyz);
float impostorYaw = atan(-instanceMatrix[0].z, instanceMatrix[0].x);
vec3 impostorCenter = impostorPos + vec3(0.0, uImpostorCenterY * impostorScale, 0.0);
vec3 impostorView = normalize(cameraPosition - impostorCenter);
vec3 impostorRight = normalize(cross(vec3(0.0, 1.0, 0.0), impostorView));
vec3 impostorUp = cross(impostorView, impostorRight);
float impostorAz = atan(impostorView.x, impostorView.z) - impostorYaw;
impostorAz = mod(impostorAz, 6.2831853);
float impostorCol = mod(floor(impostorAz / (6.2831853 / ${String(IMPOSTOR_AZIMUTHS)}.0) + 0.5), ${String(IMPOSTOR_AZIMUTHS)}.0);
float impostorRow = impostorView.y > sin(radians(24.0)) ? 1.0 : 0.0;
vec2 impostorCell = uv * (1.0 - 2.0 * ${CELL_INSET.toFixed(3)}) + ${CELL_INSET.toFixed(3)};
vImpostorUv = (vec2(impostorCol, impostorRow) + impostorCell) / vec2(${String(IMPOSTOR_AZIMUTHS)}.0, ${String(IMPOSTOR_ELEVATIONS_DEG.length)}.0);
vec3 objectNormal = impostorView;
`;

const IMPOSTOR_PROJECT = /* glsl */ `
vec3 impostorWorld = impostorCenter + (impostorRight * position.x + impostorUp * position.y) * (2.0 * uImpostorRadius * impostorScale);
vec4 mvPosition = viewMatrix * vec4(impostorWorld, 1.0);
gl_Position = projectionMatrix * mvPosition;
`;

function createImpostorMaterial(
  albedo: Texture,
  centerY: number,
  radius: number,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: albedo,
    // Autosombreado medio del follaje: sin él, el rectángulo orientado a la cámara se ilumina
    // como una superficie plana y el árbol lejano parece más claro que su versión 3D.
    color: new Color(0.55, 0.55, 0.55),
    envMapIntensity: 0.55,
    roughness: 1,
    metalness: 0,
    // Umbral bajo: en los mipmaps el alfa de las hojas se promedia y el árbol se encogería.
    alphaTest: 0.28,
    alphaToCoverage: true,
  });
  material.name = 'impostor-arbol';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uImpostorCenterY = { value: centerY };
    shader.uniforms.uImpostorRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${IMPOSTOR_VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', IMPOSTOR_BEGIN_NORMAL)
      // La normal ya está en el mundo: solo se lleva al espacio de la vista.
      .replace(
        '#include <defaultnormal_vertex>',
        'vec3 transformedNormal = normalize(mat3(viewMatrix) * objectNormal);',
      )
      .replace('#include <project_vertex>', IMPOSTOR_PROJECT)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvMapUv = vImpostorUv;');
  };
  material.customProgramCacheKey = () => `terralab-impostor-${radius.toFixed(3)}`;
  return material;
}

export function disposeImpostor(impostor: Impostor): void {
  impostor.albedo.dispose();
  impostor.material.dispose();
  impostor.geometry.dispose();
}

/** Matriz de instancia del impostor: posición, giro y escala (sin la matriz del nodo). */
export function impostorInstanceMatrix(
  target: Matrix4,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
): Matrix4 {
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  return target.set(c, 0, s, x, 0, scale, 0, y, -s, 0, c, z, 0, 0, 0, 1);
}
