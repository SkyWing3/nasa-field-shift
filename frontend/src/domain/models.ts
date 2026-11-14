/**
 * Modelo de dominio de TerraLab 3D — esquema v0.
 *
 * Estas interfaces describen *qué* estado existe y en qué unidades. No implementan
 * ningún modelo agronómico: los valores los producirá el motor del backend (fases
 * posteriores) o fuentes de datos con procedencia declarada. Se revisarán cuando se
 * implemente el motor; cualquier cambio de esquema incrementará `schemaVersion`.
 *
 * Convención espacial: coordenadas locales de la granja en metros, eje X hacia el
 * este y eje Z hacia el sur (convención de Three.js, Y hacia arriba).
 */

import type { CropGrowthStage } from './growthStage';
import type { DataProvenance } from './provenance';
import type { IsoDate } from './time';
import type { Quantity } from './units';

export type FarmId = string;
export type PlotId = string;
export type CropId = string;
export type ScenarioId = string;

export interface GeoLocation {
  /** Latitud WGS84, positiva al norte. Rango [-90, 90]. */
  readonly latitude: Quantity<'deg'>;
  /** Longitud WGS84, positiva al este. Rango [-180, 180]. */
  readonly longitude: Quantity<'deg'>;
  /** Altitud sobre el nivel del mar. */
  readonly elevation: Quantity<'m'>;
}

/** Condiciones meteorológicas diarias en la ubicación de la granja. */
export interface WeatherState {
  readonly date: IsoDate;
  /** Temperatura mínima del aire a 2 m. */
  readonly airTemperatureMin: Quantity<'degC'>;
  /** Temperatura máxima del aire a 2 m. */
  readonly airTemperatureMax: Quantity<'degC'>;
  /** Temperatura media del aire a 2 m. */
  readonly airTemperatureMean: Quantity<'degC'>;
  /** Precipitación total del día. */
  readonly precipitation: Quantity<'mm/d'>;
  /** Radiación solar global de onda corta incidente en superficie, integrada en el día. */
  readonly shortwaveRadiation: Quantity<'MJ/m2/d'>;
  /** Humedad relativa media a 2 m. */
  readonly relativeHumidity: Quantity<'%'>;
  /** Velocidad media del viento a 2 m de altura. */
  readonly windSpeed2m: Quantity<'m/s'>;
  /** Evapotranspiración de referencia (ET0). Magnitud derivada; `null` si no se ha calculado. */
  readonly referenceEvapotranspiration: Quantity<'mm/d'> | null;
  readonly provenance: DataProvenance;
}

export interface SoilLayerState {
  /** Profundidad del techo de la capa desde la superficie. */
  readonly topDepth: Quantity<'m'>;
  /** Profundidad de la base de la capa desde la superficie. */
  readonly bottomDepth: Quantity<'m'>;
  /** Contenido volumétrico de agua actual. */
  readonly volumetricWaterContent: Quantity<'m3/m3'>;
  /** Contenido de agua a capacidad de campo. */
  readonly fieldCapacity: Quantity<'m3/m3'>;
  /** Contenido de agua en el punto de marchitez permanente. */
  readonly permanentWiltingPoint: Quantity<'m3/m3'>;
  /** Contenido de agua a saturación. */
  readonly saturation: Quantity<'m3/m3'>;
  /** Temperatura media de la capa; `null` si no se modela. */
  readonly temperature: Quantity<'degC'> | null;
}

export type SoilSurfaceCondition = 'untilled' | 'tilled' | 'seedbed' | 'residue-covered';

export interface SoilState {
  /** Capas ordenadas de la superficie hacia abajo, contiguas y sin solapamiento. */
  readonly layers: readonly SoilLayerState[];
  readonly surfaceCondition: SoilSurfaceCondition;
  /** Carbono orgánico del horizonte superficial; `null` si no se dispone del dato. */
  readonly organicCarbon: Quantity<'g/kg'> | null;
  /** Nitrógeno mineral disponible en el perfil; `null` si no se modela. */
  readonly mineralNitrogen: Quantity<'kgN/ha'> | null;
  /** pH del horizonte superficial; `null` si no se dispone del dato. */
  readonly pH: Quantity<'pH'> | null;
  readonly provenance: DataProvenance;
}

export type CropStatus = 'growing' | 'mature' | 'harvested' | 'failed';

export interface Crop {
  readonly id: CropId;
  /** Identificador de especie del catálogo de cultivos (se definirá con el motor). */
  readonly speciesId: string;
  readonly cultivar: string | null;
  readonly sowingDate: IsoDate;
  readonly plantDensity: Quantity<'plants/m2'>;
  readonly growthStage: CropGrowthStage;
  /** Tiempo térmico acumulado desde la siembra. */
  readonly thermalTimeSinceSowing: Quantity<'degC.d'>;
  readonly leafAreaIndex: Quantity<'m2/m2'>;
  /** Biomasa aérea en materia seca. */
  readonly aboveGroundBiomass: Quantity<'kg/ha'>;
  /** Profundidad efectiva de enraizamiento. */
  readonly rootDepth: Quantity<'m'>;
  readonly status: CropStatus;
}

export interface PlotVertex {
  readonly x: Quantity<'m'>;
  readonly z: Quantity<'m'>;
}

export interface Plot {
  readonly id: PlotId;
  readonly name: string;
  /** Polígono simple del contorno, en orden antihorario visto desde arriba. */
  readonly boundary: readonly PlotVertex[];
  readonly area: Quantity<'m2'>;
  readonly soil: SoilState;
  /** Cultivo en pie; `null` si la parcela está en barbecho o sin sembrar. */
  readonly crop: Crop | null;
}

export interface Farm {
  readonly id: FarmId;
  readonly name: string;
  readonly location: GeoLocation;
  readonly plots: readonly Plot[];
}

/** Paso de tiempo de la simulación en notación de duración ISO 8601 (ADR-003). */
export type SimulationTimeStep = 'P1D';

/** Definición reproducible de un experimento de simulación. */
export interface SimulationScenario {
  readonly id: ScenarioId;
  readonly schemaVersion: 0;
  readonly name: string;
  readonly description: string;
  readonly initialFarm: Farm;
  readonly startDate: IsoDate;
  /** Fecha final inclusiva. */
  readonly endDate: IsoDate;
  readonly timeStep: SimulationTimeStep;
  /** Semilla para cualquier componente estocástico; garantiza la reproducibilidad. */
  readonly randomSeed: number;
}

/** Instantánea del estado de una simulación en una fecha dada. */
export interface SimulationState {
  readonly scenarioId: ScenarioId;
  /** Versión del motor agronómico que produjo este estado. */
  readonly engineVersion: string;
  readonly currentDate: IsoDate;
  /** Días simulados transcurridos desde `startDate`. */
  readonly elapsed: Quantity<'d'>;
  readonly farm: Farm;
  /** Meteorología del día actual; `null` si aún no hay datos para esa fecha. */
  readonly weather: WeatherState | null;
}
