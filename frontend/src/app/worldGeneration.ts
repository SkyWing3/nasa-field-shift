/**
 * Controlador de la generación del mundo: conecta el pipeline (`world/generate`) con el estado.
 * Cada ejecución tiene un identificador: los resultados de una ejecución cancelada o sustituida
 * por otra se descartan.
 */
import { fetchCatalog } from '../assets';
import type { RectangularRegion } from '../geo';
import { useWorldStore } from '../state/worldStore';
import { generateWorld, WorldGenerationError } from '../world/generate';
import { WORLD_QUALITIES } from '../world/quality';
import { simulationClient } from './services';

let currentRun = 0;

export function startWorldGeneration(
  region: RectangularRegion,
  allowProcedural: boolean,
): () => void {
  const run = ++currentRun;
  const controller = new AbortController();
  const store = useWorldStore.getState();
  store.begin();
  const isCurrent = (): boolean => run === currentRun && !controller.signal.aborted;

  void (async () => {
    try {
      const catalogResult = await fetchCatalog(controller.signal);
      if (catalogResult.status !== 'ready') {
        throw new WorldGenerationError(
          'worker',
          catalogResult.status === 'not-generated'
            ? 'Falta la biblioteca de assets: ejecuta «make assets».'
            : `No se pudo leer el catálogo de assets: ${catalogResult.message}`,
        );
      }
      const world = await generateWorld({
        client: simulationClient,
        region,
        quality: WORLD_QUALITIES[useWorldStore.getState().quality],
        catalog: catalogResult.catalog,
        allowProcedural,
        signal: controller.signal,
        onStage: (event) => {
          if (isCurrent()) useWorldStore.getState().stage(event);
        },
      });
      if (isCurrent()) useWorldStore.getState().succeed(world, catalogResult.catalog);
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof WorldGenerationError) {
        useWorldStore
          .getState()
          .fail({ kind: error.kind, message: error.message, failedSources: error.failedSources });
      } else {
        useWorldStore.getState().fail({
          kind: 'unexpected',
          message: error instanceof Error ? error.message : String(error),
          failedSources: [],
        });
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
