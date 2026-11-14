export type ApiErrorKind =
  /** No se pudo contactar con el servidor (caído, CORS, sin red). */
  | 'network'
  /** El servidor no respondió dentro del tiempo límite. */
  | 'timeout'
  /** El servidor respondió con un código HTTP de error. */
  | 'http'
  /** La respuesta no cumple el contrato esperado. */
  | 'invalid-response'
  /** La petición fue cancelada por quien la inició. */
  | 'aborted';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Mensaje `detail` que envía FastAPI en las respuestas de error, si lo hay. */
  readonly detail: string | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown; detail?: string | null },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.kind = kind;
    this.status = options?.status ?? null;
    this.detail = options?.detail ?? null;
  }
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':
        return 'No se pudo conectar con la API. Comprueba que el backend está en ejecución.';
      case 'timeout':
        return 'La API no respondió a tiempo.';
      case 'http':
        return `La API respondió con un error (HTTP ${String(error.status)}).`;
      case 'invalid-response':
        return 'La API devolvió una respuesta con un formato inesperado.';
      case 'aborted':
        return 'La petición se canceló.';
    }
  }
  return 'Error desconocido al comunicarse con la API.';
}
