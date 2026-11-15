import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Raycaster, Vector2 } from 'three';

import type { LocalFrame } from '../geo/localFrame.ts';
import { useWorldStore } from '../state/worldStore';
import type { GeneratedWorld } from '../world/generate.ts';
import { raycastHeightfield } from '../world/heightfield.ts';
import { describeTerrainPoint } from './terrainQuery';

const CLICK_TOLERANCE_PX = 5;
const CLICK_MAX_MS = 450;

/**
 * Selección de un punto del terreno con un clic (sin arrastrar). La intersección se calcula sobre
 * el campo de alturas (exacto respecto a la malla más fina), no sobre los triángulos dibujados.
 */
export function TerrainPicker({
  world,
  frame,
}: {
  readonly world: GeneratedWorld;
  readonly frame: LocalFrame;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const select = useWorldStore((state) => state.select);

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let down: { x: number; y: number; time: number } | null = null;
    const onDown = (event: PointerEvent): void => {
      down =
        event.button === 0 ? { x: event.clientX, y: event.clientY, time: performance.now() } : null;
    };
    const onUp = (event: PointerEvent): void => {
      if (down === null || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.time < CLICK_MAX_MS;
      down = null;
      if (moved > CLICK_TOLERANCE_PX || !quick) return;
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const { origin, direction } = raycaster.ray;
      const o = [origin.x, origin.y, origin.z] as const;
      const d = [direction.x, direction.y, direction.z] as const;
      const hit =
        raycastHeightfield(world.build.detail, o, d) ??
        raycastHeightfield(world.build.context, o, d);
      select(hit === null ? null : describeTerrainPoint(world, frame, hit.x, hit.z));
      invalidate();
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, world, frame, select, invalidate]);

  return null;
}
