import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type ComponentRef, useEffect, useEffectEvent, useRef } from 'react';
import { MOUSE, type PerspectiveCamera, Vector3 } from 'three';

import type { RectangularRegion } from '../geo/region.ts';
import { useWorldStore } from '../state/worldStore';
import {
  CAMERA_LIMITS,
  clampTarget,
  easeInOutCubic,
  enforceClearance,
  type HeightSampler,
  nearPlaneFor,
  type Vec3,
  viewPose,
  type WorldViewId,
} from './worldCamera';

interface WorldCameraRigProps {
  readonly region: RectangularRegion;
  readonly height: HeightSampler;
  readonly detailHalfM: number;
  readonly maxDistanceM: number;
  readonly initialView: WorldViewId;
}

interface Flight {
  readonly fromPosition: Vector3;
  readonly fromTarget: Vector3;
  readonly toPosition: Vector3;
  readonly toTarget: Vector3;
  readonly start: number;
  readonly duration: number;
}

const KEY_PAN_SPEED = 0.6; // fracción de la distancia a la cámara por segundo

/**
 * Cámara orbital del mundo: rotar (botón izquierdo), desplazar sobre el terreno (botón derecho o
 * WASD/flechas), zoom hacia el cursor (rueda), vistas predefinidas con transición suave, y
 * protección contra atravesar el terreno o salir del área de detalle.
 */
export function WorldCameraRig({
  region,
  height,
  detailHalfM,
  maxDistanceM,
  initialView,
}: WorldCameraRigProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const viewRequest = useWorldStore((state) => state.viewRequest);
  const flight = useRef<Flight | null>(null);
  const keys = useRef(new Set<string>());
  const initialized = useRef(false);

  const flyTo = useEffectEvent((view: WorldViewId, immediate: boolean): void => {
    const control = controls.current;
    if (control === null) return;
    const camera = get().camera;
    const pose = viewPose(view, region, height);
    const toPosition = new Vector3(...pose.position);
    const toTarget = new Vector3(...pose.target);
    if (immediate) {
      camera.position.copy(toPosition);
      control.target.copy(toTarget);
      control.update();
      invalidate();
      return;
    }
    flight.current = {
      fromPosition: camera.position.clone(),
      fromTarget: control.target.clone(),
      toPosition,
      toTarget,
      start: performance.now(),
      duration: 1600,
    };
    invalidate();
  });

  useEffect(() => {
    if (initialized.current || controls.current === null) return;
    initialized.current = true;
    flyTo(initialView, true);
  });

  // Solo en desarrollo: acceso para fijar la cámara desde las pruebas de navegador y revisar la
  // escena desde puntos concretos. No existe en el build de producción.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handle = {
      setPose: (position: Vec3, target: Vec3): void => {
        const control = controls.current;
        if (control === null) return;
        flight.current = null;
        get().camera.position.set(...position);
        control.target.set(...target);
        control.update();
        invalidate();
      },
    };
    (globalThis as { __terralabCamera?: typeof handle }).__terralabCamera = handle;
    return () => {
      delete (globalThis as { __terralabCamera?: typeof handle }).__terralabCamera;
    };
  }, [get, invalidate]);

  const requestedView = viewRequest?.view ?? null;
  const requestToken = viewRequest?.token ?? 0;
  useEffect(() => {
    if (requestedView !== null && requestToken > 0) flyTo(requestedView, false);
  }, [requestedView, requestToken]);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        keys.current.add(key);
        invalidate();
      }
    };
    const up = (event: KeyboardEvent): void => {
      keys.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [invalidate]);

  useFrame((state, delta) => {
    const control = controls.current;
    if (control === null) return;
    const camera = state.camera as PerspectiveCamera;
    const active = flight.current;
    if (active !== null) {
      const t = easeInOutCubic((performance.now() - active.start) / active.duration);
      camera.position.lerpVectors(active.fromPosition, active.toPosition, t);
      control.target.lerpVectors(active.fromTarget, active.toTarget, t);
      if (t >= 1) flight.current = null;
      control.update();
      invalidate();
    }
    // Desplazamiento con el teclado en el plano horizontal de la vista.
    if (keys.current.size > 0) {
      const forward = new Vector3().subVectors(control.target, camera.position).setY(0).normalize();
      const right = new Vector3(-forward.z, 0, forward.x);
      const move = new Vector3();
      const k = keys.current;
      if (k.has('w') || k.has('arrowup')) move.add(forward);
      if (k.has('s') || k.has('arrowdown')) move.sub(forward);
      if (k.has('d') || k.has('arrowright')) move.add(right);
      if (k.has('a') || k.has('arrowleft')) move.sub(right);
      const distance = camera.position.distanceTo(control.target);
      move.multiplyScalar(Math.max(4, distance) * KEY_PAN_SPEED * Math.min(delta, 0.1));
      camera.position.add(move);
      control.target.add(move);
      invalidate();
    }
    // Punto de mira dentro del área de detalle y sobre el terreno.
    const target: Vec3 = clampTarget(
      [control.target.x, control.target.y, control.target.z],
      detailHalfM,
    );
    const ground = height(target[0], target[2]);
    if (
      flight.current === null &&
      (target[0] !== control.target.x ||
        target[2] !== control.target.z ||
        Math.abs(control.target.y - ground) > 0.01)
    ) {
      const shift = new Vector3(
        target[0] - control.target.x,
        ground - control.target.y,
        target[2] - control.target.z,
      );
      control.target.add(shift);
      camera.position.add(shift);
    }
    // La cámara nunca queda bajo el terreno ni con una ladera entre ella y el punto de mira.
    const safeY = enforceClearance(
      [camera.position.x, camera.position.y, camera.position.z],
      [control.target.x, control.target.y, control.target.z],
      height,
      CAMERA_LIMITS.clearanceM,
    );
    if (safeY > camera.position.y) camera.position.y = safeY;
    const near = nearPlaneFor(camera.position.y - height(camera.position.x, camera.position.z));
    if (Math.abs(camera.near - near) / near > 0.2) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      screenSpacePanning={false}
      zoomToCursor
      minDistance={CAMERA_LIMITS.minDistanceM}
      maxDistance={maxDistanceM}
      maxPolarAngle={Math.PI * 0.497}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      onStart={() => {
        flight.current = null;
      }}
    />
  );
}
