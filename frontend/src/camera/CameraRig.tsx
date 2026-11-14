import { OrbitControls } from '@react-three/drei';

import { CAMERA_CONFIG } from './config';

/**
 * Controles de cámara orbitales con amortiguación y límites que mantienen la vista
 * sobre el terreno. Con `frameloop="demand"`, los controles solicitan nuevos frames
 * solo mientras la cámara se mueve.
 */
export function CameraRig() {
  return (
    <OrbitControls
      makeDefault
      target={CAMERA_CONFIG.target}
      enableDamping
      dampingFactor={CAMERA_CONFIG.dampingFactor}
      minDistance={CAMERA_CONFIG.minDistance}
      maxDistance={CAMERA_CONFIG.maxDistance}
      maxPolarAngle={CAMERA_CONFIG.maxPolarAngle}
    />
  );
}
