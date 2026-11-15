import type { Bundle } from './types';

const FILES = ['catalog', 'results', 'climate', 'credits', 'audio', 'manifest'] as const;

/**
 * Carga el paquete precalculado desde el mismo servidor. No consulta NASA, NOAA ni TTS.
 * Rechaza archivos de corridas distintas (build_id) para no mezclar resultados.
 */
export async function loadBundle(signal: AbortSignal): Promise<Bundle> {
  const values = await Promise.all(
    FILES.map(async (name) => {
      let response: Response;
      try {
        response = await fetch(`/raiz/data/${name}.json`, { signal });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error('Sin conexión con el servidor de Raíz. Revise la red e intente de nuevo.', { cause: error });
      }
      if (!response.ok) {
        throw new Error(`El archivo ${name}.json no está disponible (código ${response.status}).`);
      }
      return (await response.json()) as { build_id?: string };
    }),
  );
  const ids = new Set(values.map((v) => v.build_id));
  if (ids.size !== 1 || ids.has(undefined)) {
    throw new Error('Los archivos pertenecen a corridas diferentes. Vuelva a publicar el paquete completo.');
  }
  return Object.fromEntries(FILES.map((name, i) => [name, values[i]])) as unknown as Bundle;
}
