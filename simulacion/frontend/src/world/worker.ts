/// <reference lib="webworker" />
/**
 * Worker de generación del mundo: ejecuta las etapas pesadas del pipeline (normalización, malla,
 * materiales, elementos geográficos y vegetación) fuera del hilo principal.
 */
import {
  buildWorld,
  transferables,
  type WorldBuild,
  type WorldBuildInput,
  type StageId,
} from './pipeline.ts';
import { type LayerUrls, loadTerrainTextures, type TerrainTextureSet } from './textures.ts';

export interface BuildRequest {
  readonly type: 'build';
  readonly input: WorldBuildInput;
  readonly textures: { readonly layers: readonly LayerUrls[]; readonly resolution: number };
}

export type WorkerMessage =
  | {
      readonly type: 'stage';
      readonly stage: StageId;
      readonly durationMs: number;
      readonly detail: string;
    }
  | {
      readonly type: 'done';
      readonly build: WorldBuild;
      readonly textures: TerrainTextureSet;
      readonly texturesMs: number;
    }
  | { readonly type: 'error'; readonly message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<BuildRequest>) => {
  const request = event.data;
  const run = async (): Promise<void> => {
    const start = performance.now();
    const textures = await loadTerrainTextures(
      request.textures.layers,
      request.textures.resolution,
    );
    const texturesMs = performance.now() - start;
    const build = buildWorld(request.input, (stage, durationMs, detail) => {
      const message: WorkerMessage = {
        type: 'stage',
        stage,
        durationMs,
        detail:
          stage === 'materials'
            ? `${detail}; texturas PBR ${String(textures.layers)} × ${String(textures.resolution)} px en ${Math.round(texturesMs).toString()} ms`
            : detail,
      };
      scope.postMessage(message);
    });
    const done: WorkerMessage = { type: 'done', build, textures, texturesMs };
    scope.postMessage(done, [
      ...transferables(build),
      textures.albedoHeight.buffer as ArrayBuffer,
      textures.normalRoughAo.buffer as ArrayBuffer,
    ]);
  };
  run().catch((error: unknown) => {
    const message: WorkerMessage = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(message);
  });
};
