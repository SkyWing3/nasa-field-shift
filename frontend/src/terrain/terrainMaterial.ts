/**
 * Material PBR del terreno: `MeshStandardMaterial` de Three.js (iluminación física, sombras,
 * niebla e IBL del HDRI) con un sombreador de mezcla de materiales inyectado.
 *
 * Por fragmento:
 * 1. Pesos de las 8 capas desde los mapas de mezcla (detalle y contexto, con transición).
 * 2. Caminos, cauces y agua de OSM desde los campos de distancia (bordes nítidos con ruido).
 * 3. Se eligen las 3 capas con más peso y se muestrean (albedo+altura, normal+rugosidad+AO) con
 *    gradientes explícitos, a dos escalas para disimular la repetición.
 * 4. Mezcla por altura: en las transiciones aparece primero el material con más relieve (las
 *    piedras asoman entre la tierra), en lugar de un fundido uniforme.
 */
import { type DataArrayTexture, type DataTexture, MeshStandardMaterial, type Texture } from 'three';

export interface TerrainMaterialTextures {
  readonly albedoHeight: DataArrayTexture;
  readonly normalRoughAo: DataArrayTexture;
  readonly tileSizeM: Float32Array;
  readonly weightsA: DataTexture;
  readonly weightsB: DataTexture;
  readonly fieldInfo: DataTexture;
  readonly featureField: DataTexture;
  readonly contextWeightsA: DataTexture;
  readonly contextWeightsB: DataTexture;
}

export interface TerrainMaterialOptions {
  readonly textures: TerrainMaterialTextures;
  readonly detailSizeM: number;
  readonly contextSizeM: number;
  readonly fieldAngleRad: number;
  readonly isContext: boolean;
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vTerrainWorld;
`;

const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_PARS = /* glsl */ `
precision highp sampler2DArray;
varying vec3 vTerrainWorld;
uniform sampler2DArray tAlbedoHeight;
uniform sampler2DArray tNormalRoughAo;
uniform float uTile[8];
uniform sampler2D tWeightsA;
uniform sampler2D tWeightsB;
uniform sampler2D tFieldInfo;
uniform sampler2D tFeatureField;
uniform sampler2D tCtxWeightsA;
uniform sampler2D tCtxWeightsB;
uniform float uDetailSize;
uniform float uContextSize;
uniform float uFieldAngle;
uniform float uIsContext;

float terrainHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float terrainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x),
    mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Ruido fractal suave (3 octavas giradas): variación de gran escala sin cuadrícula visible.
float terrainFbm(vec2 p) {
  const mat2 r1 = mat2(0.8, 0.6, -0.6, 0.8);
  float n = 0.5 * terrainNoise(p);
  n += 0.3 * terrainNoise(r1 * p * 2.03 + 17.1);
  n += 0.2 * terrainNoise(r1 * r1 * p * 4.07 + 31.7);
  return n;
}

// Color medio de una capa (último nivel de mipmap): sustituye a la textura a gran distancia,
// donde su repetición sería visible.
vec3 terrainAverage(int layer) {
  return textureLod(tAlbedoHeight, vec3(0.5, 0.5, float(layer)), 12.0).rgb;
}

void terrainApply(inout float w[8], int layer, float amount) {
  if (amount <= 0.0) return;
  for (int i = 0; i < 8; i++) w[i] *= (1.0 - amount);
  w[layer] += amount;
}

// Muestra una capa con rotación de UV (surcos) y una segunda escala girada (antirrepetición).
void terrainLayer(int layer, vec2 world, vec2 dx, vec2 dy, float rotation, float macroMix,
                  out vec4 albedoHeight, out vec4 normalRoughAo, out mat2 rot) {
  float tile = uTile[layer];
  float c = cos(rotation);
  float s = sin(rotation);
  rot = mat2(c, s, -s, c);
  vec2 uv = rot * world / tile;
  vec2 gx = rot * dx / tile;
  vec2 gy = rot * dy / tile;
  albedoHeight = textureGrad(tAlbedoHeight, vec3(uv, float(layer)), gx, gy);
  normalRoughAo = textureGrad(tNormalRoughAo, vec3(uv, float(layer)), gx, gy);
  // Variación: misma escala, girada 127° y desplazada, mezclada con ruido de unos 5 m. Rompe la
  // periodicidad del mosaico sin perder el detalle (técnica de variación de texturas).
  const mat2 varRot = mat2(-0.6018, 0.7986, -0.7986, -0.6018);
  vec2 uv2 = varRot * uv + vec2(0.37, 0.71);
  vec3 variation = textureGrad(tAlbedoHeight, vec3(uv2, float(layer)), varRot * gx, varRot * gy).rgb;
  albedoHeight.rgb = mix(albedoHeight.rgb, variation, macroMix);
}
`;

const FRAGMENT_SAMPLE = /* glsl */ `
vec2 terrainP = vTerrainWorld.xz;
// Coordenadas de textura del mundo: u hacia el este, v hacia el norte (z = −norte).
vec2 terrainWorldUv = vec2(terrainP.x, -terrainP.y);
vec2 terrainDx = dFdx(terrainWorldUv);
vec2 terrainDy = dFdy(terrainWorldUv);
vec2 terrainUvD = (terrainP + 0.5 * uDetailSize) / uDetailSize;
vec2 terrainUvC = (terrainP + 0.5 * uContextSize) / uContextSize;
float terrainEdge = max(abs(terrainP.x), abs(terrainP.y));
float terrainDetail = uIsContext > 0.5 ? 0.0
  : 1.0 - smoothstep(0.5 * uDetailSize - 300.0, 0.5 * uDetailSize - 5.0, terrainEdge);
vec4 terrainWa = texture(tCtxWeightsA, terrainUvC);
vec4 terrainWb = texture(tCtxWeightsB, terrainUvC);
vec4 terrainField = vec4(0.0, 0.5, 1.0, 0.0);
vec4 terrainDist = vec4(24.0);
if (terrainDetail > 0.0) {
  terrainWa = mix(terrainWa, texture(tWeightsA, terrainUvD), terrainDetail);
  terrainWb = mix(terrainWb, texture(tWeightsB, terrainUvD), terrainDetail);
  terrainField = texture(tFieldInfo, terrainUvD);
  terrainDist = texture(tFeatureField, terrainUvD) * 32.0 - 8.0;
}
float terrainW[8] = float[8](terrainWa.x, terrainWa.y, terrainWa.z, terrainWa.w,
                              terrainWb.x, terrainWb.y, terrainWb.z, terrainWb.w);
float terrainN1 = terrainNoise(terrainP * 0.8) - 0.5;
float terrainN2 = terrainFbm(terrainP * 0.021);
float terrainCamDist = length(vTerrainWorld - cameraPosition);
float terrainFar = smoothstep(30.0, 300.0, terrainCamDist);
float terrainPaved = (1.0 - smoothstep(-0.25, 0.25, terrainDist.x + terrainN1 * 0.15)) * terrainDetail;
float terrainDirt = (1.0 - smoothstep(-0.5, 0.6, terrainDist.y + terrainN1 * 0.7)) * terrainDetail;
float terrainShoulder = (1.0 - smoothstep(0.0, 1.4, terrainDist.x + terrainN1 * 0.6)) * (1.0 - terrainPaved) * terrainDetail;
float terrainBed = (1.0 - smoothstep(-0.4, 0.6, terrainDist.z + terrainN1 * 0.5)) * terrainDetail;
float terrainWater = (1.0 - smoothstep(-0.15, 0.2, terrainDist.w + terrainN1 * 0.1)) * terrainDetail;
terrainApply(terrainW, 2, max(terrainDirt, terrainShoulder * 0.75));
terrainApply(terrainW, 5, terrainBed * 0.35);
terrainApply(terrainW, 6, terrainBed * 0.65);
terrainApply(terrainW, 7, terrainPaved);

// Las tres capas con más peso.
int terrainI0 = 0; int terrainI1 = 1; int terrainI2 = 2;
float terrainA0 = -1.0; float terrainA1 = -1.0; float terrainA2 = -1.0;
for (int i = 0; i < 8; i++) {
  float v = terrainW[i];
  if (v > terrainA0) { terrainA2 = terrainA1; terrainI2 = terrainI1; terrainA1 = terrainA0; terrainI1 = terrainI0; terrainA0 = v; terrainI0 = i; }
  else if (v > terrainA1) { terrainA2 = terrainA1; terrainI2 = terrainI1; terrainA1 = v; terrainI1 = i; }
  else if (v > terrainA2) { terrainA2 = v; terrainI2 = i; }
}
float terrainMacro = smoothstep(0.3, 0.7, terrainFbm(terrainP * 0.19));
float terrainFurrow = uFieldAngle + (terrainField.r > 0.5 ? 1.5707963 : 0.0);
vec4 terrainAh0; vec4 terrainNr0; mat2 terrainR0;
vec4 terrainAh1; vec4 terrainNr1; mat2 terrainR1;
vec4 terrainAh2; vec4 terrainNr2; mat2 terrainR2;
terrainLayer(terrainI0, terrainWorldUv, terrainDx, terrainDy, terrainI0 == 1 ? terrainFurrow : 0.0, terrainMacro, terrainAh0, terrainNr0, terrainR0);
terrainLayer(terrainI1, terrainWorldUv, terrainDx, terrainDy, terrainI1 == 1 ? terrainFurrow : 0.0, terrainMacro, terrainAh1, terrainNr1, terrainR1);
terrainLayer(terrainI2, terrainWorldUv, terrainDx, terrainDy, terrainI2 == 1 ? terrainFurrow : 0.0, terrainMacro, terrainAh2, terrainNr2, terrainR2);

// Mezcla por altura.
float terrainDepth = 0.3;
float terrainB0 = terrainA0 + terrainAh0.a * 0.5;
float terrainB1 = terrainA1 > 0.004 ? terrainA1 + terrainAh1.a * 0.5 : -1.0;
float terrainB2 = terrainA2 > 0.004 ? terrainA2 + terrainAh2.a * 0.5 : -1.0;
float terrainTop = max(terrainB0, max(terrainB1, terrainB2)) - terrainDepth;
float terrainF0 = max(terrainB0 - terrainTop, 0.0);
float terrainF1 = max(terrainB1 - terrainTop, 0.0);
float terrainF2 = max(terrainB2 - terrainTop, 0.0);
float terrainSum = max(terrainF0 + terrainF1 + terrainF2, 1e-4);
terrainF0 /= terrainSum; terrainF1 /= terrainSum; terrainF2 /= terrainSum;

vec3 terrainAlbedo = terrainAh0.rgb * terrainF0 + terrainAh1.rgb * terrainF1 + terrainAh2.rgb * terrainF2;
// A distancia: color medio de las capas con variación de ruido de gran escala (sin repetición).
vec3 terrainAvg = terrainAverage(terrainI0) * terrainF0 + terrainAverage(terrainI1) * terrainF1 + terrainAverage(terrainI2) * terrainF2;
terrainAvg *= 0.86 + 0.28 * terrainFbm(terrainP * 0.09);
terrainAlbedo = mix(terrainAlbedo, terrainAvg, terrainFar * 0.97);
vec4 terrainNra = terrainNr0 * terrainF0 + terrainNr1 * terrainF1 + terrainNr2 * terrainF2;
vec2 terrainNxy0 = transpose(terrainR0) * (terrainNr0.xy * 2.0 - 1.0);
vec2 terrainNxy1 = transpose(terrainR1) * (terrainNr1.xy * 2.0 - 1.0);
vec2 terrainNxy2 = transpose(terrainR2) * (terrainNr2.xy * 2.0 - 1.0);
vec2 terrainNxy = (terrainNxy0 * terrainF0 + terrainNxy1 * terrainF1 + terrainNxy2 * terrainF2) * (1.0 - 0.8 * terrainFar);
float terrainRough = terrainNra.b;
float terrainAo = terrainNra.a;

// Variación de tono por campo (procedural) y a gran escala; cauces más oscuros (humedad).
float terrainCrop = terrainW[0] + terrainW[1];
terrainAlbedo *= mix(1.0, 0.92 + 0.16 * terrainField.g, terrainCrop * terrainDetail);
terrainAlbedo *= 0.88 + 0.24 * terrainN2;
terrainAlbedo *= 1.0 - 0.22 * terrainBed;
// Lámina de agua en cauces permanentes y masas de agua de OSM.
terrainAlbedo = mix(terrainAlbedo, vec3(0.05, 0.055, 0.045), terrainWater);
// Agua turbia de canal: brillo moderado (una rugosidad muy baja refleja el horizonte en blanco).
terrainRough = mix(terrainRough, 0.32, terrainWater);
terrainNxy = mix(terrainNxy, vec2(terrainN1 * 0.06, terrainNoise(terrainP * 2.3) * 0.06 - 0.03), terrainWater);
terrainAo = mix(terrainAo, 1.0, terrainWater);

diffuseColor.rgb = terrainAlbedo;
`;

const FRAGMENT_NORMAL = /* glsl */ `
{
  // Base tangente en el mundo: T hacia el este y B hacia el norte, proyectados sobre la normal.
  vec3 terrainNw = normalize(inverseTransformDirection(normal, viewMatrix));
  vec3 terrainT = normalize(vec3(1.0, 0.0, 0.0) - terrainNw * terrainNw.x);
  vec3 terrainB = normalize(cross(terrainNw, terrainT));
  vec3 terrainTn = vec3(terrainNxy, sqrt(max(1.0 - dot(terrainNxy, terrainNxy), 0.0)));
  vec3 terrainPert = normalize(terrainT * terrainTn.x + terrainB * terrainTn.y + terrainNw * terrainTn.z);
  normal = normalize((viewMatrix * vec4(terrainPert, 0.0)).xyz);
}
`;

const FRAGMENT_AO = /* glsl */ `
reflectedLight.indirectDiffuse *= terrainAo;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), terrainAo, material.roughness);
#endif
`;

export function createTerrainMaterial(options: TerrainMaterialOptions): MeshStandardMaterial {
  const { textures } = options;
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.name = options.isContext ? 'terreno-contexto' : 'terreno-detalle';
  const uniforms: Record<string, { value: unknown }> = {
    tAlbedoHeight: { value: textures.albedoHeight },
    tNormalRoughAo: { value: textures.normalRoughAo },
    uTile: { value: Array.from(textures.tileSizeM) },
    tWeightsA: { value: textures.weightsA },
    tWeightsB: { value: textures.weightsB },
    tFieldInfo: { value: textures.fieldInfo },
    tFeatureField: { value: textures.featureField },
    tCtxWeightsA: { value: textures.contextWeightsA },
    tCtxWeightsB: { value: textures.contextWeightsB },
    uDetailSize: { value: options.detailSizeM },
    uContextSize: { value: options.contextSizeM },
    uFieldAngle: { value: options.fieldAngleRad },
    uIsContext: { value: options.isContext ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <project_vertex>', VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', FRAGMENT_SAMPLE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrainRough;')
      .replace('#include <normal_fragment_maps>', FRAGMENT_NORMAL)
      .replace('#include <aomap_fragment>', FRAGMENT_AO);
  };
  material.customProgramCacheKey = () => 'terralab-terrain-v1';
  material.userData.terrainUniforms = uniforms;
  return material;
}

/** Texturas que posee el material (para liberarlas). */
export function terrainMaterialTextures(textures: TerrainMaterialTextures): Texture[] {
  return [
    textures.albedoHeight,
    textures.normalRoughAo,
    textures.weightsA,
    textures.weightsB,
    textures.fieldInfo,
    textures.featureField,
    textures.contextWeightsA,
    textures.contextWeightsB,
  ];
}
