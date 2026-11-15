/** Lectura defensiva de JSON de terceros: falla con un mensaje claro si la forma no es la esperada. */

export type JsonRecord = Readonly<Record<string, unknown>>;

export function asRecord(value: unknown, context: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${context}: se esperaba un objeto`);
  }
  return value as JsonRecord;
}

export function asString(value: unknown, context: string): string {
  if (typeof value !== 'string') throw new TypeError(`${context}: se esperaba un texto`);
  return value;
}

export function asNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${context}: se esperaba un número finito`);
  }
  return value;
}

export function asArray(value: unknown, context: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context}: se esperaba una lista`);
  return value;
}

export function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Serialización estable (claves ordenadas) para archivos versionados. */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}
