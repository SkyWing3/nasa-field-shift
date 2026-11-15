/**
 * Contrato del catálogo de assets (`asset-library/catalog.json`).
 *
 * Lo genera `asset-pipeline/` (Node) y lo consume el visualizador (navegador). Este archivo no
 * importa nada para que Node pueda cargarlo directamente con su eliminación de tipos.
 * Todas las magnitudes físicas van en metros (`M`) o bytes; las fechas en ISO 8601.
 */

export const ASSET_CATALOG_SCHEMA_VERSION = 1;

export type AssetKind = 'model' | 'material' | 'hdri';

export type AssetCategory = 'terrain' | 'vegetation' | 'crop' | 'environment' | 'lighting';

export type AssetGroup =
  // Terreno (materiales PBR)
  | 'agricultural-soil'
  | 'tilled-soil'
  | 'mud'
  | 'wet-soil'
  | 'dry-soil'
  | 'stony-ground'
  | 'rural-path'
  | 'paved-road'
  | 'forest-floor'
  | 'sand'
  | 'snow'
  | 'grass-ground'
  // Vegetación
  | 'grass'
  | 'shrub'
  | 'tree'
  | 'weed'
  // Cultivos
  | 'potato'
  | 'maize'
  | 'fava-bean'
  // Entorno
  | 'fence'
  | 'irrigation'
  | 'farm-object'
  | 'rock'
  | 'ground-debris'
  | 'building-wall'
  | 'building-roof'
  // Iluminación
  | 'sky';

/**
 * - `available`: descargado, procesado y comprobado.
 * - `missing`: no existe un recurso gratuito con licencia compatible descargable sin intervención.
 * - `error`: seleccionado, pero falló la descarga, el procesado o la validación.
 */
export type AssetStatus = 'available' | 'missing' | 'error';

export type AssetProvider = 'Poly Haven' | 'ambientCG' | 'Sketchfab';

export type LicenseId = 'CC0-1.0' | 'CC-BY-4.0';

export interface AssetLicense {
  readonly id: LicenseId;
  readonly name: string;
  readonly url: string;
  readonly attributionRequired: boolean;
  /** Página donde se verificó la licencia y fecha de verificación (ISO 8601). */
  readonly verifiedAt: string;
  readonly verificationUrl: string;
}

export interface AssetSource {
  readonly provider: AssetProvider;
  readonly providerAssetId: string;
  readonly pageUrl: string;
}

export type AssetFileRole = 'model' | 'albedo' | 'normal' | 'orm' | 'height' | 'environment';

export type AssetFileFormat = 'glb' | 'webp' | 'hdr';

export interface AssetFile {
  /** Ruta relativa a la raíz de `asset-library/`, siempre con `/`. */
  readonly path: string;
  readonly role: AssetFileRole;
  readonly format: AssetFileFormat;
  readonly bytes: number;
  readonly sha256: string;
  /** Resolución en píxeles para imágenes y entornos. */
  readonly width?: number;
  readonly height?: number;
}

export interface ModelLod {
  readonly level: number;
  /** Nombre del nodo raíz del nivel dentro del GLB (`LOD0`, `LOD1`…). */
  readonly nodeName: string;
  readonly triangles: number;
  readonly vertices: number;
  /** Primitivas renderizables: aproximación de las llamadas de dibujo del nivel. */
  readonly drawCalls: number;
}

export interface ModelTexture {
  readonly slot: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly bytes: number;
}

export interface ModelMaterial {
  readonly name: string;
  readonly alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  readonly doubleSided: boolean;
  readonly textures: readonly ModelTexture[];
}

/**
 * Comparación con las dimensiones que publica la fuente en sus metadatos. Es informativa: Poly
 * Haven mide su escena .blend completa, que puede incluir objetos que el glTF no exporta.
 */
export type PublishedSizeCheck = 'match' | 'differs' | 'unavailable';

export interface ModelInfo {
  readonly lods: readonly ModelLod[];
  /** Nombres de las variantes (nodos con malla) dentro de cada nivel; un conjunto puede traer varias. */
  readonly variants: readonly string[];
  /** Tamaño del modelo procesado (eje Y hacia arriba), en metros. */
  readonly sizeM: readonly [number, number, number];
  /** Tamaño del glTF de origen antes de procesarlo, en metros. */
  readonly sourceGltfSizeM: readonly [number, number, number];
  /** Tamaño publicado en los metadatos de la fuente (convertido a ejes glTF), si existe. */
  readonly publishedSizeM: readonly [number, number, number] | null;
  readonly publishedSizeCheck: PublishedSizeCheck;
  readonly sourceTriangles: number;
  readonly materials: readonly ModelMaterial[];
  /** Estimación de memoria de GPU de las texturas descomprimidas (RGBA8 con mipmaps). */
  readonly gpuTextureBytes: number;
}

export interface MaterialInfo {
  /** Tamaño real que cubre una repetición de la textura, en metros, si la fuente lo publica. */
  readonly tileSizeM: readonly [number, number] | null;
  readonly resolutions: readonly number[];
  readonly gpuTextureBytes: number;
}

export interface HdriInfo {
  readonly resolutions: readonly number[];
  readonly capturedAt: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly whiteBalanceK: number | null;
  readonly timeOfDay: string | null;
  readonly weather: string | null;
}

export interface AssetAlternative {
  readonly title: string;
  readonly provider: string;
  readonly url: string;
  /** Licencia tal como la declara la fuente; se debe volver a verificar al descargar. */
  readonly license: string;
  readonly requires: string;
  readonly notes: string;
}

export interface MissingInfo {
  readonly reason: string;
  readonly alternatives: readonly AssetAlternative[];
}

export interface ValidationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GltfValidatorSummary {
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly hints: number;
}

export interface AssetValidation {
  readonly checks: readonly ValidationCheck[];
  /** Informe de Khronos glTF-Validator sobre el GLB final (solo modelos). */
  readonly gltfValidator: GltfValidatorSummary | null;
}

export interface AssetEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: AssetKind;
  readonly category: AssetCategory;
  readonly group: AssetGroup;
  readonly status: AssetStatus;
  readonly source: AssetSource | null;
  readonly authors: readonly string[];
  readonly license: AssetLicense | null;
  readonly files: readonly AssetFile[];
  readonly sizeBytes: number;
  readonly model: ModelInfo | null;
  readonly material: MaterialInfo | null;
  readonly hdri: HdriInfo | null;
  readonly missing: MissingInfo | null;
  readonly error: string | null;
  readonly validation: AssetValidation;
}

export interface AssetCatalog {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly pipelineVersion: string;
  readonly assets: readonly AssetEntry[];
}
