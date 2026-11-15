import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';

import type { AssetCatalog } from '../assets';
import type { GeneratedWorld } from '../world/generate.ts';
import type { ScatterContext } from '../world/scatter.ts';
import { bakeImpostor, disposeImpostor, type Impostor } from './impostor.ts';
import {
  disposeVegetation,
  type LoadedVegetation,
  loadVegetationModels,
} from './vegetationAssets.ts';
import { VegetationRenderer, type VegetationStats } from './vegetationRenderer.ts';

interface VegetationLayerProps {
  readonly world: GeneratedWorld;
  readonly catalog: AssetCatalog;
  readonly onReady?: () => void;
  readonly onError?: (message: string) => void;
  readonly onStats?: (stats: VegetationStats) => void;
}

/** Vegetación ambiental: carga los modelos, hornea los impostores y actualiza las instancias. */
export function VegetationLayer({
  world,
  catalog,
  onReady,
  onError,
  onStats,
}: VegetationLayerProps) {
  const invalidate = useThree((state) => state.invalidate);
  const get = useThree((state) => state.get);
  const [renderer, setRenderer] = useState<VegetationRenderer | null>(null);

  // Carga de modelos, horneado de impostores (dibuja en la GPU) y creación del gestor de
  // instancias, todo fuera del render; el estado se actualiza al terminar la carga asíncrona.
  useEffect(() => {
    let cancelled = false;
    let created: {
      vegetation: LoadedVegetation;
      impostors: Impostor[];
      instance: VegetationRenderer;
    } | null = null;
    loadVegetationModels(catalog).then(
      (vegetation) => {
        if (cancelled) {
          disposeVegetation(vegetation);
          return;
        }
        const build = world.build;
        const scatter: ScatterContext = {
          seed: world.seed,
          sizeM: build.detail.sizeM,
          heightfield: build.detail,
          landCover: build.landCover,
          featureField: build.featureField,
          buildingMask: build.buildingMask,
          region: world.region,
          mosaic: build.mosaic,
          features: build.localFeatures,
          density: world.quality.vegetationDensity,
        };
        const impostors = vegetation.models.tree.map((model) => bakeImpostor(get().gl, model));
        const instance = new VegetationRenderer({
          models: vegetation.models,
          far: build.far,
          impostors,
          scatter,
          heightfield: build.detail,
          lodScale: world.quality.lodScale,
          groundCoverRadiusM: world.quality.groundCoverRadiusM,
          grassDensity: world.quality.grassDensity,
        });
        created = { vegetation, impostors, instance };
        if (import.meta.env.DEV) {
          // Solo en desarrollo: lectura de los atlas de impostores para revisarlos.
          (globalThis as { __terralabImpostors?: () => string[] }).__terralabImpostors = () =>
            impostors.flatMap((impostor) =>
              [impostor.albedo].map((target) => {
                const { width, height } = target;
                const pixels = new Uint8Array(width * height * 4);
                get().gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (context === null) return '';
                const image = context.createImageData(width, height);
                for (let y = 0; y < height; y++) {
                  // Las filas del render target empiezan abajo.
                  image.data.set(
                    pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4),
                    y * width * 4,
                  );
                }
                context.putImageData(image, 0, 0);
                return canvas.toDataURL('image/png');
              }),
            );
          // Solo en desarrollo: posiciones de árboles para revisar LOD e impostores en las pruebas.
          (globalThis as { __terralabTrees?: () => number[][] }).__terralabTrees = () => {
            const set = build.far.tree;
            return Array.from({ length: Math.min(set.count, 4000) }, (_, k) => [
              set.data[k * 6] ?? 0,
              set.data[k * 6 + 1] ?? 0,
              set.data[k * 6 + 2] ?? 0,
            ]);
          };
        }
        setRenderer(instance);
        onReady?.();
        invalidate();
      },
      (error: unknown) => {
        if (!cancelled) onError?.(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
      setRenderer(null);
      if (created !== null) {
        created.instance.dispose();
        for (const impostor of created.impostors) disposeImpostor(impostor);
        disposeVegetation(created.vegetation);
      }
    };
  }, [catalog, world, get, onReady, onError, invalidate]);

  useFrame(({ camera }) => {
    if (renderer?.update(camera) === true) onStats?.(renderer.currentStats);
  });

  return renderer === null ? null : <primitive object={renderer.group} />;
}
