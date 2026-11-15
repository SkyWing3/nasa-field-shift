/**
 * Unidades físicas explícitas para variables científicas.
 *
 * Cada magnitud se tipa como `Quantity<U>`: un `number` con una "marca" de unidad
 * que solo existe en tiempo de compilación. Así el compilador impide, por ejemplo,
 * pasar una precipitación en mm/d donde se espera una temperatura en °C, sin coste
 * alguno en tiempo de ejecución ni en el JSON intercambiado con la API.
 *
 * Los símbolos siguen, en lo posible, la notación de UCUM (Unified Code for Units
 * of Measure) en ASCII; `UNIT_LABELS` define su representación legible.
 */

export const UNIT_LABELS = {
  /** Temperatura en grados Celsius. */
  degC: '°C',
  /** Tiempo térmico acumulado (grados-día) sobre una temperatura base. */
  'degC.d': '°C·d',
  /** Lámina de agua. 1 mm equivale a 1 L/m². */
  mm: 'mm',
  /** Flujo diario de agua (precipitación, riego, evapotranspiración). */
  'mm/d': 'mm/d',
  /** Radiación solar diaria integrada sobre una superficie horizontal. */
  'MJ/m2/d': 'MJ/m²/d',
  /** Porcentaje (0–100). */
  '%': '%',
  /** Velocidad. */
  'm/s': 'm/s',
  /** Longitud o profundidad. */
  m: 'm',
  /** Superficie. */
  m2: 'm²',
  /** Superficie agrícola. 1 ha = 10 000 m². */
  ha: 'ha',
  /** Contenido volumétrico de agua del suelo (volumen de agua / volumen de suelo). */
  'm3/m3': 'm³/m³',
  /** Masa por unidad de superficie (biomasa, rendimiento) en materia seca. */
  'kg/ha': 'kg/ha',
  /** Nitrógeno elemental por unidad de superficie. */
  'kgN/ha': 'kg N/ha',
  /** Densidad de plantas. */
  'plants/m2': 'plantas/m²',
  /** Índice de área foliar: área de hoja (una cara) por área de suelo. Adimensional. */
  'm2/m2': 'm²/m²',
  /** Concentración másica en suelo (p. ej. carbono orgánico). */
  'g/kg': 'g/kg',
  /** Ángulo en grados sexagesimales (coordenadas geográficas, posición solar). */
  deg: '°',
  /** Días. */
  d: 'd',
  /** pH (adimensional, escala logarítmica). */
  pH: 'pH',
} as const;

export type UnitSymbol = keyof typeof UNIT_LABELS;

declare const unitBrand: unique symbol;

/** Número con unidad física asociada en el sistema de tipos. */
export type Quantity<U extends UnitSymbol> = number & { readonly [unitBrand]: U };

/**
 * Construye una magnitud con su unidad. Rechaza valores no finitos (NaN, ±Infinity),
 * que en un modelo científico indican siempre un error aguas arriba.
 */
export function quantity<U extends UnitSymbol>(value: number, _unit: U): Quantity<U> {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Valor no finito para una magnitud en ${_unit}: ${String(value)}`);
  }
  return value as Quantity<U>;
}

export function unitLabel(unit: UnitSymbol): string {
  return UNIT_LABELS[unit];
}
