/**
 * Modos de inspección de materiales: sustituyen temporalmente el material de cada malla por uno
 * que muestra un único mapa (albedo, normal, rugosidad, metalicidad, oclusión) o la malla.
 */
import {
  type Material,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three';

export type ViewMode = 'pbr' | 'albedo' | 'normal' | 'roughness' | 'metalness' | 'ao' | 'wireframe';

export const VIEW_MODES: readonly { readonly id: ViewMode; readonly label: string }[] = [
  { id: 'pbr', label: 'PBR' },
  { id: 'albedo', label: 'Albedo' },
  { id: 'normal', label: 'Normal' },
  { id: 'roughness', label: 'Rugosidad' },
  { id: 'metalness', label: 'Metalicidad' },
  { id: 'ao', label: 'Oclusión' },
  { id: 'wireframe', label: 'Malla' },
];

const CHANNEL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Muestra los datos del mapa sin conversión de color ni tono: es la vista de datos en bruto.
const CHANNEL_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform bool hasMap;
  uniform int channel;
  uniform float factor;
  uniform vec3 fallback;
  uniform mat3 mapTransform;
  uniform sampler2D alphaSource;
  uniform bool useAlphaTest;
  uniform float alphaTest;
  uniform mat3 alphaTransform;
  varying vec2 vUv;
  void main() {
    if (useAlphaTest) {
      float alpha = texture2D(alphaSource, (alphaTransform * vec3(vUv, 1.0)).xy).a;
      if (alpha < alphaTest) discard;
    }
    vec3 color = fallback;
    if (hasMap) {
      vec4 texel = texture2D(map, (mapTransform * vec3(vUv, 1.0)).xy);
      color = channel < 0 ? texel.rgb : vec3(texel[channel] * factor);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function textureMatrix(texture: Texture | null): Matrix3 {
  if (texture === null) return new Matrix3();
  texture.updateMatrix();
  return texture.matrix.clone();
}

function channelMaterial(
  source: MeshStandardMaterial,
  map: Texture | null,
  channel: number,
  factor: number,
  fallback: Vector3,
): ShaderMaterial {
  const alphaSource = source.map;
  const useAlphaTest = source.alphaTest > 0 && alphaSource !== null;
  return new ShaderMaterial({
    vertexShader: CHANNEL_VERTEX,
    fragmentShader: CHANNEL_FRAGMENT,
    side: source.side,
    toneMapped: false,
    uniforms: {
      map: { value: map },
      hasMap: { value: map !== null },
      channel: { value: channel },
      factor: { value: factor },
      fallback: { value: fallback },
      mapTransform: { value: textureMatrix(map) },
      alphaSource: { value: alphaSource },
      useAlphaTest: { value: useAlphaTest },
      alphaTest: { value: source.alphaTest },
      alphaTransform: { value: textureMatrix(alphaSource) },
    },
  });
}

/** Crea el material de inspección para un modo, o `null` si el material no es PBR. */
export function createViewModeMaterial(source: Material, mode: ViewMode): Material | null {
  if (mode === 'pbr') return null;
  if (mode === 'wireframe') {
    return new MeshBasicMaterial({ color: 0xd8b36a, wireframe: true });
  }
  if (!(source instanceof MeshStandardMaterial)) return null;
  switch (mode) {
    case 'albedo':
      return new MeshBasicMaterial({
        map: source.map,
        color: source.color,
        alphaTest: source.alphaTest,
        side: source.side,
        toneMapped: false,
      });
    case 'normal':
      return channelMaterial(source, source.normalMap, -1, 1, new Vector3(0.5, 0.5, 1));
    case 'roughness': {
      const value = source.roughness;
      return channelMaterial(
        source,
        source.roughnessMap,
        1,
        value,
        new Vector3(value, value, value),
      );
    }
    case 'metalness': {
      const value = source.metalness;
      return channelMaterial(
        source,
        source.metalnessMap,
        2,
        value,
        new Vector3(value, value, value),
      );
    }
    case 'ao':
      return channelMaterial(source, source.aoMap, 0, 1, new Vector3(1, 1, 1));
  }
}

/** Aplica un modo a todas las mallas y devuelve la función que restaura los materiales. */
export function applyViewMode(root: Object3D, mode: ViewMode): () => void {
  const restored: (() => void)[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    const original = mesh.material;
    const sources = Array.isArray(original) ? original : [original];
    const overrides = sources.map((material) => createViewModeMaterial(material, mode));
    if (overrides.every((material) => material === null)) return;
    const replacement = sources.map((material, index) => overrides[index] ?? material);
    mesh.material = Array.isArray(original) ? replacement : (replacement[0] ?? original);
    restored.push(() => {
      mesh.material = original;
      for (const material of overrides) material?.dispose();
    });
  });
  return () => {
    for (const restore of restored) restore();
  };
}
