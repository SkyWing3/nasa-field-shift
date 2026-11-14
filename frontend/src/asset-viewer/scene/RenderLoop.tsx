import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

import { type RenderStats, useViewerStore } from '../viewerStore';
import { activeLodLevel } from './activeLod';

/** Duración de la medición de FPS, en milisegundos. */
export const FPS_WINDOW_MS = 3000;

function sameStats(a: RenderStats | null, b: RenderStats): boolean {
  return (
    a !== null &&
    a.drawCalls === b.drawCalls &&
    a.triangles === b.triangles &&
    a.geometries === b.geometries &&
    a.textures === b.textures &&
    a.programs === b.programs &&
    a.lodLevel === b.lodLevel
  );
}

/**
 * Asume el render (prioridad 1) para leer `renderer.info` justo después de dibujar el fotograma
 * y para medir FPS en una ventana fija. Las estadísticas se comparan en cada fotograma (con render
 * bajo demanda el último fotograma debe registrarse siempre) y solo se publican si cambian.
 */
export function RenderLoop() {
  const fpsStatus = useViewerStore((state) => state.fps.status);
  const fpsWindow = useRef<{ start: number; frames: number } | null>(null);

  useEffect(() => {
    fpsWindow.current = null;
  }, [fpsStatus]);

  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    const now = performance.now();
    const store = useViewerStore.getState();

    const stats: RenderStats = {
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      lodLevel: activeLodLevel(),
    };
    if (!sameStats(store.stats, stats)) store.setStats(stats);

    if (store.fps.status === 'running') {
      fpsWindow.current ??= { start: now, frames: -1 };
      fpsWindow.current.frames++;
      const elapsed = now - fpsWindow.current.start;
      if (elapsed >= FPS_WINDOW_MS && fpsWindow.current.frames > 0) {
        const { frames } = fpsWindow.current;
        store.finishFps({ fps: (frames * 1000) / elapsed, frameMs: elapsed / frames, frames });
      }
    }
  }, 1);

  return null;
}
