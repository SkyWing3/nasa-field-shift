import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  DataUtils,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Fog,
  Object3D,
  Vector3,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

import { releaseResource, retainResource } from '../scene/resources';
import {
  acesFilmic,
  bandRadiance,
  type EquirectImage,
  findSun,
  type SunEstimate,
} from './hdrAnalysis';

export interface SkyInfo {
  readonly sun: SunEstimate;
  readonly fogColor: Color;
}

interface WorldSkyProps {
  readonly hdriUrl: string;
  readonly exposure: number;
  readonly shadowMapSize: number;
  readonly shadowExtentM: number;
  /** Distancia sin niebla y distancia a la que la niebla es total (m). */
  readonly fogNearM: number;
  readonly fogFarM: number;
  readonly onSkyInfo?: (info: SkyInfo) => void;
}

const SUN_INTENSITY = 3.4;
const ENVIRONMENT_INTENSITY = 1.0;
const LIGHT_DISTANCE = 900;

function toImage(texture: { readonly image: unknown }): EquirectImage {
  const { width, height, data } = texture.image as { width: number; height: number; data: unknown };
  if (data instanceof Float32Array) return { width, height, data, channels: 4 };
  const half = data as Uint16Array;
  const out = new Float32Array(half.length);
  for (let k = 0; k < half.length; k++) out[k] = DataUtils.fromHalfFloat(half[k] ?? 0);
  return { width, height, data: out, channels: 4 };
}

/**
 * Cielo e iluminación: HDRI del catálogo como fondo e iluminación ambiental (IBL), sol
 * direccional alineado con el sol del HDRI y con sombras que siguen al punto de mira, y niebla
 * del color del horizonte del propio HDRI. Es ambientación visual, no el clima del lugar.
 */
export function WorldSky({
  hdriUrl,
  exposure,
  shadowMapSize,
  shadowExtentM,
  fogNearM,
  fogFarM,
  onSkyInfo,
}: WorldSkyProps) {
  const texture = useLoader(HDRLoader, hdriUrl);
  const get = useThree((state) => state.get);
  const controls = useThree((state) => state.controls) as { target?: Vector3 } | null;
  const invalidate = useThree((state) => state.invalidate);

  // Luz y objetivo propios (creados aquí, no por el reconciliador): se orientan en cada fotograma
  // según el sol del HDRI y el punto de mira de la cámara.
  const light = useMemo(() => {
    const created = new DirectionalLight('#ffffff', SUN_INTENSITY);
    created.name = 'sol';
    created.castShadow = true;
    created.target = new Object3D();
    const shadow = created.shadow;
    shadow.mapSize.set(shadowMapSize, shadowMapSize);
    shadow.bias = -0.0003;
    shadow.normalBias = 0.04;
    const camera = shadow.camera;
    camera.left = -shadowExtentM;
    camera.right = shadowExtentM;
    camera.top = shadowExtentM;
    camera.bottom = -shadowExtentM;
    camera.near = LIGHT_DISTANCE - 600;
    camera.far = LIGHT_DISTANCE + 600;
    camera.updateProjectionMatrix();
    return created;
  }, [shadowMapSize, shadowExtentM]);

  const info = useMemo<SkyInfo>(() => {
    const image = toImage(texture);
    const sun = findSun(image);
    const horizon = bandRadiance(image, 0, 4);
    const [r, g, b] = acesFilmic(horizon, exposure);
    // La niebla se mezcla después del tone mapping: su color es el del horizonte ya mapeado.
    return { sun, fogColor: new Color().setRGB(r, g, b) };
  }, [texture, exposure]);

  // Copia propia (comparte la imagen) para fijar el mapeo sin modificar el recurso de la caché.
  const environment = useMemo(() => {
    const copy = texture.clone();
    copy.mapping = EquirectangularReflectionMapping;
    copy.needsUpdate = true;
    return copy;
  }, [texture]);

  useEffect(() => {
    const { scene, gl } = get();
    scene.environment = environment;
    scene.background = environment;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    scene.fog = new Fog(info.fogColor, fogNearM, fogFarM);
    gl.toneMappingExposure = exposure;
    onSkyInfo?.(info);
    invalidate();
    return () => {
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
    };
  }, [environment, get, info, exposure, fogNearM, fogFarM, onSkyInfo, invalidate]);

  // El HDR original se libera de forma diferida y solo si nadie más lo usa (ver scene/resources).
  useEffect(() => {
    retainResource(hdriUrl);
    return () => {
      environment.dispose();
      releaseResource(hdriUrl, () => {
        texture.dispose();
        useLoader.clear(HDRLoader, hdriUrl);
      });
    };
  }, [environment, texture, hdriUrl]);

  useEffect(
    () => () => {
      light.dispose();
    },
    [light],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Solo en desarrollo: diagnóstico de la luz para las pruebas de navegador.
    (globalThis as { __terralabSky?: () => unknown }).__terralabSky = () => ({
      sun: info.sun,
      fog: info.fogColor.getHexString(),
      light: {
        position: light.position.toArray().map((v) => Math.round(v)),
        target: light.target.position.toArray().map((v) => Math.round(v)),
        shadowMap:
          light.shadow.map === null ? null : [light.shadow.map.width, light.shadow.map.height],
        shadowsEnabled: get().gl.shadowMap.enabled,
      },
    });
  }, [info, get, light]);

  const sunDirection = useMemo(() => new Vector3(...info.sun.direction).normalize(), [info]);
  const snapped = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const focus = controls?.target ?? new Vector3();
    // Se ajusta el centro de la sombra a la rejilla de texels para evitar parpadeos al moverse.
    const texel = (2 * shadowExtentM) / shadowMapSize;
    snapped.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
    light.target.position.copy(snapped);
    light.position.copy(snapped).addScaledVector(sunDirection, LIGHT_DISTANCE);
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={light.target} />
      <primitive object={light} />
    </>
  );
}
