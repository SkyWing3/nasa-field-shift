import { useLoader, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Mesh } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { AssetEntry } from '../../assets';
import { useViewerStore } from '../viewerStore';
import { setActiveLod } from './activeLod';
import { applyLodMode, buildLod } from './lod';
import { disposeObject, releaseResource, retainResource } from '../../scene/resources';
import { useFitCamera } from './useFitCamera';
import { applyViewMode } from './viewModes';

/** Decodificador meshopt empaquetado con Three.js: sin descargas desde CDN. */
function configureLoader(loader: GLTFLoader): void {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

interface ModelAssetProps {
  readonly asset: AssetEntry;
  readonly url: string;
}

export function ModelAsset({ asset, url }: ModelAssetProps) {
  const gltf = useLoader(GLTFLoader, url, configureLoader);
  const viewMode = useViewerStore((state) => state.viewMode);
  const lodMode = useViewerStore((state) => state.lodMode);
  const finishLoading = useViewerStore((state) => state.finishLoading);
  const invalidate = useThree((state) => state.invalidate);

  const built = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return buildLod(clone, asset.model?.lods.map((lod) => lod.nodeName) ?? []);
  }, [gltf, asset]);

  useEffect(() => {
    retainResource(url);
    return () => {
      releaseResource(url, () => {
        disposeObject(gltf.scene);
        useLoader.clear(GLTFLoader, url);
      });
    };
  }, [gltf, url]);

  useEffect(() => {
    applyLodMode(built, lodMode);
    setActiveLod(built, lodMode);
    invalidate();
    return () => {
      setActiveLod(null);
    };
  }, [built, lodMode, invalidate]);

  useEffect(() => {
    const restore = applyViewMode(built.lod, viewMode);
    invalidate();
    return restore;
  }, [built, viewMode, invalidate]);

  useLayoutEffect(() => {
    finishLoading();
  }, [built, finishLoading]);

  useFitCamera(built.lod);

  return <primitive object={built.lod} />;
}
