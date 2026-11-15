import { Sky } from '@react-three/drei';
import { useMemo } from 'react';

import { PROVISIONAL_CLEAR_MORNING, type VisualSkyConditions } from './presets';
import { sunDirection, type Vector3Tuple } from './sun';

interface SkyLightingProps {
  readonly conditions?: VisualSkyConditions;
}

/** Distancia a la que se coloca la luz direccional; solo afecta a la cámara de sombras. */
const SUN_LIGHT_DISTANCE = 120;

/**
 * Cielo atmosférico procedural + iluminación natural básica (sol y relleno de cielo).
 * Componente puramente visual: no lee ni escribe estado de simulación.
 */
export function SkyLighting({ conditions = PROVISIONAL_CLEAR_MORNING }: SkyLightingProps) {
  const sun = useMemo(
    () => sunDirection(conditions.sunElevation, conditions.sunAzimuth),
    [conditions.sunElevation, conditions.sunAzimuth],
  );
  const lightPosition = useMemo<Vector3Tuple>(
    () => [sun[0] * SUN_LIGHT_DISTANCE, sun[1] * SUN_LIGHT_DISTANCE, sun[2] * SUN_LIGHT_DISTANCE],
    [sun],
  );

  return (
    <>
      <Sky
        distance={4500}
        sunPosition={sun}
        turbidity={conditions.turbidity}
        rayleigh={conditions.rayleigh}
        mieCoefficient={conditions.mieCoefficient}
        mieDirectionalG={conditions.mieDirectionalG}
      />
      <fog attach="fog" args={[conditions.hazeColor, conditions.hazeNear, conditions.hazeFar]} />
      <hemisphereLight
        args={[conditions.skyFillColor, conditions.groundFillColor, conditions.skyFillIntensity]}
      />
      <directionalLight
        position={lightPosition}
        intensity={conditions.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
    </>
  );
}
