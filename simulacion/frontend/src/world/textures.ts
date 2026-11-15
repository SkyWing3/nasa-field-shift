/**
 * Empaquetado de los materiales PBR del catálogo en dos texturas de array (una capa por material):
 *
 * - `albedoHeight`: RGB = albedo (sRGB), A = altura del relieve (para mezclar por altura).
 * - `normalRoughAo`: RG = normal en espacio tangente, B = rugosidad, A = oclusión ambiental.
 *
 * Así el sombreador del terreno usa 2 texturas para los 10 materiales del bioma. Se ejecuta en el worker
 * (`createImageBitmap` + `OffscreenCanvas`) para no bloquear la interfaz.
 */
import { type AssetCatalog, assetFileUrl } from '../assets';
import { type BiomeProfile, TERRAIN_ROLES } from './biome.ts';

export interface TerrainTextureSet {
  readonly resolution: number;
  readonly layers: number;
  readonly albedoHeight: Uint8Array;
  readonly normalRoughAo: Uint8Array;
  /** Tamaño real de cada textura en metros (catálogo; 2 m si la fuente no lo publica). */
  readonly tileSizeM: Float32Array;
}

export interface LayerUrls {
  readonly id: string;
  readonly albedo: string;
  readonly normal: string;
  readonly orm: string;
  readonly height: string;
  readonly tileSizeM: number;
}

export const FALLBACK_TILE_M = 2;

/** Materiales del catálogo de cada capa del terreno para un bioma, en el orden de las capas. */
export function biomeLayerIds(profile: BiomeProfile): string[] {
  return TERRAIN_ROLES.map((role) => profile.layers[role]);
}

export function terrainLayerUrls(
  catalog: AssetCatalog,
  resolution: number,
  layerIds: readonly string[],
  base?: string,
): LayerUrls[] {
  return layerIds.map((id) => {
    const asset = catalog.assets.find((entry) => entry.id === id);
    if (asset?.status !== 'available') {
      throw new Error(`Falta el material de terreno «${id}» en el catálogo (ejecuta make assets)`);
    }
    // La versión más pequeña que no sea inferior a la resolución pedida; se reduce en el worker.
    const file = (role: string): string => {
      const candidates = asset.files
        .filter((candidate) => candidate.role === role && (candidate.width ?? 0) >= resolution)
        .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
      const found = candidates[0];
      if (found === undefined) {
        throw new Error(`Falta el mapa ${role} de ${id} a ${String(resolution)} px o más`);
      }
      return assetFileUrl(found.path, base);
    };
    return {
      id,
      albedo: file('albedo'),
      normal: file('normal'),
      orm: file('orm'),
      height: file('height'),
      tileSizeM: asset.material?.tileSizeM?.[0] ?? FALLBACK_TILE_M,
    };
  });
}

async function readPixels(
  url: string,
  resolution: number,
  fetchFn: typeof fetch,
): Promise<Uint8ClampedArray> {
  const response = await fetchFn(url);
  if (!response.ok)
    throw new Error(`No se pudo descargar ${url} (HTTP ${String(response.status)})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
    resizeWidth: resolution,
    resizeHeight: resolution,
    resizeQuality: 'high',
  });
  const canvas = new OffscreenCanvas(resolution, resolution);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('OffscreenCanvas 2D no disponible');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, resolution, resolution).data;
}

export async function loadTerrainTextures(
  layers: readonly LayerUrls[],
  resolution: number,
  fetchFn: typeof fetch = fetch,
): Promise<TerrainTextureSet> {
  const layerBytes = resolution * resolution * 4;
  const albedoHeight = new Uint8Array(layerBytes * layers.length);
  const normalRoughAo = new Uint8Array(layerBytes * layers.length);
  const tileSizeM = new Float32Array(layers.length);
  await Promise.all(
    layers.map(async (layer, index) => {
      const [albedo, normal, orm, height] = await Promise.all([
        readPixels(layer.albedo, resolution, fetchFn),
        readPixels(layer.normal, resolution, fetchFn),
        readPixels(layer.orm, resolution, fetchFn),
        readPixels(layer.height, resolution, fetchFn),
      ]);
      const offset = index * layerBytes;
      for (let p = 0; p < resolution * resolution; p++) {
        const k = p * 4;
        albedoHeight[offset + k] = albedo[k] ?? 0;
        albedoHeight[offset + k + 1] = albedo[k + 1] ?? 0;
        albedoHeight[offset + k + 2] = albedo[k + 2] ?? 0;
        albedoHeight[offset + k + 3] = height[k] ?? 128;
        normalRoughAo[offset + k] = normal[k] ?? 128;
        normalRoughAo[offset + k + 1] = normal[k + 1] ?? 128;
        // ORM del pipeline: R = oclusión, G = rugosidad, B = metalicidad (glTF).
        normalRoughAo[offset + k + 2] = orm[k + 1] ?? 200;
        normalRoughAo[offset + k + 3] = orm[k] ?? 255;
      }
      tileSizeM[index] = layer.tileSizeM;
    }),
  );
  return { resolution, layers: layers.length, albedoHeight, normalRoughAo, tileSizeM };
}
