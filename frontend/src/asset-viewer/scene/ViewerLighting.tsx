import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { MathUtils } from 'three';

import type { AssetEntry } from '../../assets';
import { quantity } from '../../domain';
import { sunDirection } from '../../weather-visual/sun';
import { useViewerStore } from '../viewerStore';
import { hdriFileUrl } from './assetFiles';

const NEUTRAL_BACKGROUND = '#1b201d';

interface ViewerLightingProps {
  /** HDRI que ilumina la escena (el elegido o el asset HDRI seleccionado). */
  readonly hdri: AssetEntry | null;
  readonly showSunShadowCatcher: boolean;
}

export function ViewerLighting({ hdri, showSunShadowCatcher }: ViewerLightingProps) {
  const lighting = useViewerStore((state) => state.lighting);
  const stageRadius = useViewerStore((state) => state.stageRadius);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    get().gl.toneMappingExposure = lighting.exposure;
    invalidate();
  }, [get, lighting.exposure, invalidate]);

  const url = hdri === null ? null : hdriFileUrl(hdri, lighting.hdriResolution);
  const rotation = useMemo(
    () => [0, MathUtils.degToRad(lighting.rotationDeg), 0] as [number, number, number],
    [lighting.rotationDeg],
  );
  const sun = useMemo(() => {
    const [x, y, z] = sunDirection(
      quantity(lighting.sunElevationDeg, 'deg'),
      quantity(lighting.sunAzimuthDeg, 'deg'),
    );
    const distance = Math.max(stageRadius * 4, 5);
    return [x * distance, y * distance, z * distance] as [number, number, number];
  }, [lighting.sunElevationDeg, lighting.sunAzimuthDeg, stageRadius]);
  const shadowExtent = Math.max(stageRadius * 1.5, 1);

  return (
    <>
      {url === null ? (
        <>
          {/* Sin HDRI en el catálogo: luz neutra de inspección, identificada en la interfaz. */}
          <color attach="background" args={[NEUTRAL_BACKGROUND]} />
          <hemisphereLight args={['#e4e9ef', '#3a3226', 1.4]} />
        </>
      ) : (
        <Suspense fallback={null}>
          {lighting.background === 'neutral' ? (
            <color attach="background" args={[NEUTRAL_BACKGROUND]} />
          ) : null}
          <Environment
            files={url}
            background={lighting.background !== 'neutral'}
            backgroundBlurriness={lighting.background === 'blurred' ? 0.35 : 0}
            environmentIntensity={lighting.environmentIntensity}
            environmentRotation={rotation}
            backgroundRotation={rotation}
          />
        </Suspense>
      )}
      {lighting.sunEnabled ? (
        <directionalLight
          position={sun}
          intensity={lighting.sunIntensity}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-shadowExtent}
          shadow-camera-right={shadowExtent}
          shadow-camera-top={shadowExtent}
          shadow-camera-bottom={-shadowExtent}
          shadow-camera-near={0.01}
          shadow-camera-far={stageRadius * 10 + 10}
        />
      ) : null}
      {lighting.sunEnabled && showSunShadowCatcher ? (
        // Receptor de sombras invisible: solo muestra la sombra proyectada sobre el suelo.
        <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
          <planeGeometry args={[shadowExtent * 4, shadowExtent * 4]} />
          <shadowMaterial opacity={0.4} />
        </mesh>
      ) : null}
    </>
  );
}
