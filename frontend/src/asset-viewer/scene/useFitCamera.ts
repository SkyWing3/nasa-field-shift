import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { Box3, MathUtils, type Object3D, PerspectiveCamera, Sphere, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';

import { useViewerStore } from '../viewerStore';

const VIEW_DIRECTION = new Vector3(1, 0.55, 1.25).normalize();

/** Encuadra el objeto con la cámara y fija el objetivo de la órbita en su centro. */
export function useFitCamera(object: Object3D | null): void {
  const get = useThree((state) => state.get);
  // Solo para volver a encuadrar cuando los controles se montan tras el objeto.
  const controlsReady = useThree((state) => state.controls !== null);
  const invalidate = useThree((state) => state.invalidate);
  const resetToken = useViewerStore((state) => state.cameraResetToken);
  const setStageRadius = useViewerStore((state) => state.setStageRadius);

  useLayoutEffect(() => {
    const { camera } = get();
    const controls = get().controls as OrbitControls | null;
    if (object === null || !(camera instanceof PerspectiveCamera)) return;
    const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.05);
    const distance = (radius / Math.sin(MathUtils.degToRad(camera.fov) / 2)) * 1.1;
    camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
    camera.near = Math.max(0.005, distance / 1000);
    camera.far = distance * 400;
    camera.updateProjectionMatrix();
    if (controls !== null) {
      controls.target.copy(sphere.center);
      controls.minDistance = radius * 0.2;
      controls.maxDistance = distance * 40;
      controls.update();
    } else {
      camera.lookAt(sphere.center);
    }
    setStageRadius(radius);
    invalidate();
  }, [object, get, controlsReady, invalidate, resetToken, setStageRadius]);
}
