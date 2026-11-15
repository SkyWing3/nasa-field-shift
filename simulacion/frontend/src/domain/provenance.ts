import type { IsoDateTime } from './time';

/**
 * Procedencia de un dato (ADR-005). Toda magnitud que alimenta o sale del motor
 * agronómico debe poder rastrearse hasta su origen, y los valores sintéticos deben
 * distinguirse siempre de los datos reales.
 */
export type ProvenanceKind =
  /** Medición directa (estación, sensor, muestreo de suelo). */
  | 'observed'
  /** Producto de reanálisis o teledetección (p. ej. conjuntos de datos satelitales). */
  | 'reanalysis'
  /** Salida calculada por el motor agronómico de TerraLab. */
  | 'model-output'
  /** Parámetro tomado de la literatura científica. */
  | 'literature'
  /** Valor introducido o supuesto por el usuario. */
  | 'user-assumption'
  /** Valor sintético (pruebas, demostraciones). Nunca debe presentarse como real. */
  | 'synthetic';

export interface DataProvenance {
  readonly kind: ProvenanceKind;
  /** Organización, instrumento o componente que origina el dato. */
  readonly source: string;
  /** Producto o conjunto de datos concreto, si aplica. */
  readonly product?: string;
  /** Versión del producto o del motor que generó el dato. */
  readonly version?: string;
  /** Cita bibliográfica o URL de la documentación de referencia. */
  readonly reference?: string;
  /** Momento en que se obtuvo el dato. */
  readonly retrievedAt?: IsoDateTime;
  readonly notes?: string;
}
