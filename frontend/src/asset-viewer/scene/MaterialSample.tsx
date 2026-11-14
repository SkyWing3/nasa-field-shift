import { useLoader, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type Group,
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';

import type { AssetEntry } from '../../assets';
import { useViewerStore } from '../viewerStore';
import {
  DISPLACEMENT_SCALE_M,
  FALLBACK_TILE_M,
  materialTextureUrls,
  SAMPLE_SIZE_M,
} from './assetFiles';
import { releaseResource, retainResource } from '../../scene/resources';
import { useFitCamera } from './useFitCamera';
import { applyViewMode } from './viewModes';

interface MaterialSampleProps {
  readonly asset: AssetEntry;
}

/** Material PBR de terreno aplicado a una superficie de muestra de 4 × 4 m. */
export function MaterialSample({ asset }: MaterialSampleProps) {
  const resolution = useViewerStore((state) => state.materialResolution);
  const displacement = useViewerStore((state) => state.displacement);
  const viewMode = useViewerStore((state) => state.viewMode);
  const finishLoading = useViewerStore((state) => state.finishLoading);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);
  const [mounted, setMounted] = useState<Group | null>(null);

  const urls = useMemo(() => materialTextureUrls(asset, resolution), [asset, resolution]);
  const loaded = useLoader(TextureLoader, urls);

  // Copias propias (comparten la imagen) con repetición a escala real y espacio de color correcto.
  const [tileX, tileY] = asset.material?.tileSizeM ?? [FALLBACK_TILE_M, FALLBACK_TILE_M];
  const textures = useMemo(
    () =>
      loaded.map((source, index) => {
        const texture = source.clone();
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.repeat.set(SAMPLE_SIZE_M / tileX, SAMPLE_SIZE_M / tileY);
        texture.anisotropy = maxAnisotropy;
        texture.colorSpace = index === 0 ? SRGBColorSpace : NoColorSpace;
        texture.needsUpdate = true;
        return texture;
      }),
    [loaded, tileX, tileY, maxAnisotropy],
  );
  const [albedo, normal, orm, height] = textures as [Texture, Texture, Texture, Texture];

  useEffect(() => {
    for (const url of urls) retainResource(url);
    return () => {
      urls.forEach((url, index) => {
        releaseResource(url, () => {
          loaded[index]?.dispose();
          useLoader.clear(TextureLoader, url);
        });
      });
    };
  }, [urls, loaded]);

  useEffect(
    () => () => {
      for (const texture of textures) texture.dispose();
    },
    [textures],
  );

  const geometry = useMemo(
    () => new PlaneGeometry(SAMPLE_SIZE_M, SAMPLE_SIZE_M, 256, 256).rotateX(-Math.PI / 2),
    [],
  );
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        // ORM empaquetado: three.js lee la oclusión en R, la rugosidad en G y la metalicidad en B.
        aoMap: orm,
        roughnessMap: orm,
        metalnessMap: orm,
        roughness: 1,
        metalness: 1,
        displacementMap: displacement ? height : null,
        displacementScale: DISPLACEMENT_SCALE_M,
        displacementBias: -DISPLACEMENT_SCALE_M / 2,
      }),
    [albedo, normal, orm, height, displacement],
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  useEffect(() => {
    if (group.current === null) return undefined;
    const restore = applyViewMode(group.current, viewMode);
    invalidate();
    return restore;
  }, [material, viewMode, invalidate]);

  useLayoutEffect(() => {
    setMounted(group.current);
    finishLoading();
  }, [loaded, finishLoading]);

  useFitCamera(mounted);

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} receiveShadow castShadow />
    </group>
  );
}
