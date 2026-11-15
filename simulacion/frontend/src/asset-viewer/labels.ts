import type { AssetCategory, AssetGroup, AssetKind, AssetStatus } from '../assets';
import styles from './AssetViewer.module.css';

export const CATEGORY_LABELS: Readonly<Record<AssetCategory, string>> = {
  terrain: 'Terreno',
  vegetation: 'Vegetación',
  crop: 'Cultivos',
  environment: 'Entorno',
  lighting: 'Iluminación',
};

export const CATEGORY_ORDER: readonly AssetCategory[] = [
  'terrain',
  'vegetation',
  'crop',
  'environment',
  'lighting',
];

export const GROUP_LABELS: Readonly<Record<AssetGroup, string>> = {
  'agricultural-soil': 'Tierra agrícola',
  'tilled-soil': 'Tierra labrada',
  mud: 'Barro',
  'wet-soil': 'Suelo húmedo',
  'dry-soil': 'Suelo seco',
  'stony-ground': 'Piedras',
  'rural-path': 'Caminos rurales',
  'paved-road': 'Caminos asfaltados',
  'forest-floor': 'Suelo de bosque',
  sand: 'Arena y suelo arenoso',
  snow: 'Nieve',
  'grass-ground': 'Pasto (terreno)',
  grass: 'Pasto',
  shrub: 'Arbustos',
  tree: 'Árboles',
  weed: 'Maleza',
  potato: 'Papa',
  maize: 'Maíz',
  'fava-bean': 'Haba',
  fence: 'Cercas',
  irrigation: 'Riego',
  'farm-object': 'Objetos agrícolas',
  rock: 'Rocas',
  'ground-debris': 'Restos naturales',
  'building-wall': 'Muros de edificaciones',
  'building-roof': 'Techos de edificaciones',
  sky: 'HDRI de exteriores',
};

export const KIND_LABELS: Readonly<Record<AssetKind, string>> = {
  model: 'Modelo 3D',
  material: 'Material PBR',
  hdri: 'HDRI',
};

export const STATUS_LABELS: Readonly<Record<AssetStatus, string>> = {
  available: 'Disponible',
  missing: 'Faltante',
  error: 'Error',
};

/** Clase modificadora de estado (punto de la lista, insignia, resumen). */
export const STATUS_CLASS: Readonly<Record<AssetStatus, string | undefined>> = {
  available: styles.isAvailable,
  missing: styles.isMissing,
  error: styles.isError,
};

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Tamaño en unidades binarias con formato español (1 KB = 1024 B). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })}\u00a0${BYTE_UNITS[unit] ?? 'B'}`;
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('es-ES');
}

export function formatMeters(values: readonly number[]): string {
  return `${values.map((value) => value.toLocaleString('es-ES', { maximumFractionDigits: 2 })).join(' × ')}\u00a0m`;
}
