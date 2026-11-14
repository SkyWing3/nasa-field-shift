import { useLayoutEffect, useRef, useState } from 'react';
import { Color, type Group, LinearSRGBColorSpace } from 'three';

import { useViewerStore } from '../viewerStore';
import { useFitCamera } from './useFitCamera';

/** Gris neutro del 18 % de reflectancia (referencia fotográfica), en espacio lineal. */
const GREY_18 = new Color().setRGB(0.18, 0.18, 0.18, LinearSRGBColorSpace);

/**
 * Esferas de calibración de iluminación (difusa gris 18 % y cromo), práctica estándar de
 * look-dev para evaluar un HDRI. No representan ningún asset del juego.
 */
export function HdriPreview() {
  const finishLoading = useViewerStore((state) => state.finishLoading);
  const group = useRef<Group>(null);
  const [mounted, setMounted] = useState<Group | null>(null);

  useLayoutEffect(() => {
    setMounted(group.current);
    finishLoading();
  }, [finishLoading]);

  useFitCamera(mounted);

  return (
    <group ref={group}>
      <mesh position={[-0.6, 0.5, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 96, 48]} />
        <meshStandardMaterial color={GREY_18} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0.6, 0.5, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 96, 48]} />
        <meshStandardMaterial color="#ffffff" roughness={0.04} metalness={1} />
      </mesh>
    </group>
  );
}
