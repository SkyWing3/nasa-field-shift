/**
 * Geodesia y sistema de coordenadas local (sin dependencias de React, del mapa ni de Three.js).
 * Ver docs/ARCHITECTURE.md §9 y ADR-029. Las medidas geodésicas (GeographicLib) se importan
 * desde `geo/metrics.ts` y `geo/geodesic.ts` para no cargarlas en la pantalla inicial.
 */
export { formatArea, formatAzimuth, formatDegrees, formatDms, formatLength } from './format.ts';
export type { Enu, LocalFrame, ScenePosition } from './localFrame.ts';
export { createLocalFrame, enuToScene, sceneToEnu, tangentPlaneDrop } from './localFrame.ts';
export { parseCoordinates } from './parse.ts';
export type { RegionPreset, VerificationRecord } from './presets.ts';
export { COCHABAMBA_DEMO_PRESET, findPreset, REGION_PRESETS } from './presets.ts';
export type { RectangularRegion, RegionProblem } from './region.ts';
export {
  clampRegion,
  createRegion,
  normalizeOrientation,
  REGION_LIMITS,
  REGION_PROBLEM_MESSAGES,
  regionCorners,
  regionCornersEnu,
  regionFromDiagonal,
  validateRegion,
} from './region.ts';
export type { GeodeticPosition, GeoPoint } from './wgs84.ts';
export { geoPoint, normalizeLongitude, WGS84 } from './wgs84.ts';
