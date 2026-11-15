/**
 * Contratos de la API de TerraLab y su validación en tiempo de ejecución.
 * Los tipos deben mantenerse alineados con los esquemas Pydantic de `backend/app/schemas`.
 */

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: string;
  readonly version: string;
  readonly environment: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    value.status === 'ok' &&
    typeof value.service === 'string' &&
    typeof value.version === 'string' &&
    typeof value.environment === 'string'
  );
}

export type PlaceKind = 'populated-place' | 'administrative' | 'other';

export interface PlaceResult {
  readonly id: string;
  readonly name: string;
  readonly region: string | null;
  readonly countryCode: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly kind: PlaceKind;
  readonly population: number | null;
}

export interface GeocodingInfo {
  readonly provider: string;
  readonly attribution: string;
  readonly attributionUrl: string;
  readonly available: boolean;
}

export interface GeocodingResults {
  readonly provider: string;
  readonly attribution: string;
  readonly attributionUrl: string;
  readonly query: string;
  readonly results: readonly PlaceResult[];
}

const PLACE_KINDS: readonly PlaceKind[] = ['populated-place', 'administrative', 'other'];
const isNullableString = (value: unknown): boolean => value === null || typeof value === 'string';
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function isPlaceResult(value: unknown): value is PlaceResult {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.region) &&
    isNullableString(value.countryCode) &&
    isFiniteNumber(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    isFiniteNumber(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    PLACE_KINDS.includes(value.kind as PlaceKind) &&
    (value.population === null || isFiniteNumber(value.population))
  );
}

function hasAttribution(value: Record<string, unknown>): boolean {
  return (
    typeof value.provider === 'string' &&
    typeof value.attribution === 'string' &&
    typeof value.attributionUrl === 'string'
  );
}

export function isGeocodingInfo(value: unknown): value is GeocodingInfo {
  return isRecord(value) && hasAttribution(value) && typeof value.available === 'boolean';
}

export function isGeocodingResults(value: unknown): value is GeocodingResults {
  return (
    isRecord(value) &&
    hasAttribution(value) &&
    typeof value.query === 'string' &&
    Array.isArray(value.results) &&
    value.results.every(isPlaceResult)
  );
}

// ── Mundo 3D (backend/app/schemas/world.py) ─────────────────────────────────────────────────

export interface DatasetMeta {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly attribution: string;
  readonly citation: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly sourceUrl: string;
  readonly resolutionM: number | null;
  readonly verticalDatum: string | null;
  readonly acquired: string;
  readonly notes: string;
}

export interface WorldDatasets {
  readonly elevation: DatasetMeta;
  readonly landcover: DatasetMeta;
  readonly landcoverClasses: readonly { readonly code: number; readonly label: string }[];
  readonly features: DatasetMeta;
  readonly imagery: DatasetMeta;
  readonly featuresLiveEnabled: boolean;
  readonly offline: boolean;
}

export interface RasterGrid {
  readonly dataset: string;
  readonly west: number;
  readonly north: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly width: number;
  readonly height: number;
  readonly encoding: 'float32le' | 'uint8';
  readonly data: string;
  readonly stats: {
    readonly min: number | null;
    readonly max: number | null;
    readonly voidFraction: number;
  };
  readonly level: number;
  readonly tiles: readonly string[];
  readonly tilesMissing: readonly string[];
}

export type GeoFeatureKind =
  | 'road'
  | 'track'
  | 'path'
  | 'waterway'
  | 'water'
  | 'building'
  | 'landuse'
  | 'railway'
  | 'place';

type Coordinate = readonly [number, number];

export interface GeoFeature {
  readonly id: string;
  readonly kind: GeoFeatureKind;
  readonly subtype: string;
  readonly geometryType: 'Point' | 'LineString' | 'Polygon';
  readonly coordinates: readonly Coordinate[];
  /** Agujeros de un polígono (p. ej. islas de un lago). */
  readonly holes: readonly (readonly Coordinate[])[];
  readonly tags: Readonly<Record<string, string>>;
}

export interface GeoFeatures {
  readonly origin: 'vectortiles' | 'snapshot' | 'overpass';
  /** Zoom de las teselas vectoriales (solo con origen `vectortiles`). */
  readonly zoom: number | null;
  readonly snapshotId: string;
  readonly osmTimestamp: string | null;
  readonly fetchedAt: string;
  readonly bbox: readonly [number, number, number, number];
  readonly features: readonly GeoFeature[];
}

const FEATURE_KINDS: readonly GeoFeatureKind[] = [
  'road',
  'track',
  'path',
  'waterway',
  'water',
  'building',
  'landuse',
  'railway',
  'place',
];
const FEATURE_ORIGINS: readonly GeoFeatures['origin'][] = ['vectortiles', 'snapshot', 'overpass'];
const GEOMETRY_TYPES: readonly GeoFeature['geometryType'][] = ['Point', 'LineString', 'Polygon'];

function isDatasetMeta(value: unknown): value is DatasetMeta {
  return (
    isRecord(value) &&
    [
      'id',
      'name',
      'provider',
      'attribution',
      'citation',
      'license',
      'licenseUrl',
      'sourceUrl',
    ].every((key) => typeof value[key] === 'string') &&
    (value.resolutionM === null || isFiniteNumber(value.resolutionM)) &&
    isNullableString(value.verticalDatum) &&
    typeof value.acquired === 'string' &&
    typeof value.notes === 'string'
  );
}

export function isWorldDatasets(value: unknown): value is WorldDatasets {
  return (
    isRecord(value) &&
    isDatasetMeta(value.elevation) &&
    isDatasetMeta(value.landcover) &&
    isDatasetMeta(value.features) &&
    isDatasetMeta(value.imagery) &&
    Array.isArray(value.landcoverClasses) &&
    value.landcoverClasses.every(
      (item) => isRecord(item) && isFiniteNumber(item.code) && typeof item.label === 'string',
    ) &&
    typeof value.featuresLiveEnabled === 'boolean' &&
    typeof value.offline === 'boolean'
  );
}

export function isRasterGrid(value: unknown): value is RasterGrid {
  if (!isRecord(value) || !isRecord(value.stats)) return false;
  const { stats } = value;
  return (
    typeof value.dataset === 'string' &&
    isFiniteNumber(value.west) &&
    isFiniteNumber(value.north) &&
    isFiniteNumber(value.pixelWidth) &&
    value.pixelWidth > 0 &&
    isFiniteNumber(value.pixelHeight) &&
    value.pixelHeight > 0 &&
    Number.isInteger(value.width) &&
    (value.width as number) > 0 &&
    Number.isInteger(value.height) &&
    (value.height as number) > 0 &&
    (value.encoding === 'float32le' || value.encoding === 'uint8') &&
    typeof value.data === 'string' &&
    (stats.min === null || isFiniteNumber(stats.min)) &&
    (stats.max === null || isFiniteNumber(stats.max)) &&
    isFiniteNumber(stats.voidFraction) &&
    Number.isInteger(value.level) &&
    Array.isArray(value.tiles) &&
    Array.isArray(value.tilesMissing)
  );
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

export function isGeoFeature(value: unknown): value is GeoFeature {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    FEATURE_KINDS.includes(value.kind as GeoFeatureKind) &&
    typeof value.subtype === 'string' &&
    GEOMETRY_TYPES.includes(value.geometryType as GeoFeature['geometryType']) &&
    Array.isArray(value.coordinates) &&
    value.coordinates.every(isCoordinate) &&
    Array.isArray(value.holes) &&
    value.holes.every((hole) => Array.isArray(hole) && hole.every(isCoordinate)) &&
    isRecord(value.tags) &&
    Object.values(value.tags).every((tag) => typeof tag === 'string')
  );
}

export function isGeoFeatures(value: unknown): value is GeoFeatures {
  return (
    isRecord(value) &&
    FEATURE_ORIGINS.includes(value.origin as GeoFeatures['origin']) &&
    (value.zoom === null || Number.isInteger(value.zoom)) &&
    typeof value.snapshotId === 'string' &&
    isNullableString(value.osmTimestamp) &&
    typeof value.fetchedAt === 'string' &&
    Array.isArray(value.bbox) &&
    value.bbox.length === 4 &&
    value.bbox.every(isFiniteNumber) &&
    Array.isArray(value.features) &&
    value.features.every(isGeoFeature)
  );
}
