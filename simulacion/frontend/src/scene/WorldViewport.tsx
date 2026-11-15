import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACESFilmicToneMapping, Color } from 'three';

import type { AssetCatalog } from '../assets';
import { WorldCameraRig } from '../camera/WorldCameraRig';
import { TerrainPicker } from '../interaction/TerrainPicker';
import { SelectionMarker } from '../interaction/SelectionMarker';
import { useWorldStore } from '../state/worldStore';
import { FeatureOverlay, RegionOutline } from '../terrain/Overlays';
import { TerrainLayer } from '../terrain/TerrainLayer';
import type { TerrainResources } from '../terrain/terrainResources';
import { VegetationLayer } from '../vegetation/VegetationLayer';
import type { VegetationStats } from '../vegetation/vegetationRenderer';
import { type SkyInfo, WorldSky } from '../weather-visual/WorldSky';
import type { GeneratedWorld } from '../world/generate';
import { containsPoint, heightAt } from '../world/heightfield';
import { createSceneFrame } from '../world/pipeline';
import styles from './SceneViewport.module.css';

export const WORLD_EXPOSURE = 1.12;
const DEFAULT_FOG = new Color('#9fb3c1');

interface WorldViewportProps {
  readonly world: GeneratedWorld;
  readonly catalog: AssetCatalog;
  readonly hdriUrl: string;
  readonly onSceneReady: (durationMs: number, detail: string) => void;
  readonly onSceneError: (message: string) => void;
}

/** Espera a que cielo, terreno y vegetación estén listos y a que se dibujen dos fotogramas. */
function ReadyProbe({ ready, onReady }: { readonly ready: boolean; readonly onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (ready) invalidate();
  }, [ready, invalidate]);
  useFrame(() => {
    if (!ready || done.current) return;
    frames.current++;
    if (frames.current >= 2) {
      done.current = true;
      onReady();
    } else invalidate();
  });
  return null;
}

/** Estadísticas reales del renderizador (llamadas de dibujo, triángulos, FPS en movimiento). */
function PerfMonitor({ vegetation }: { readonly vegetation: RefObject<VegetationStats | null> }) {
  const gl = useThree((state) => state.gl);
  const setStats = useWorldStore((state) => state.setStats);
  const frames = useRef(0);
  const last = useRef({ calls: 0, triangles: 0 });
  useFrame(() => {
    frames.current++;
    // Valores del fotograma anterior (el contador se reinicia en cada render).
    last.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const veg = vegetation.current;
      setStats({
        fps: frames.current,
        drawCalls: last.current.calls,
        triangles: last.current.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        vegetationVisible: veg === null ? 0 : Object.values(veg.visible).reduce((a, b) => a + b, 0),
        impostors: veg?.impostors ?? 0,
      });
      frames.current = 0;
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [gl, setStats, vegetation]);
  return null;
}

export function WorldViewport({
  world,
  catalog,
  hdriUrl,
  onSceneReady,
  onSceneError,
}: WorldViewportProps) {
  const quality = world.quality;
  const showOsm = useWorldStore((state) => state.showOsm);
  const showRegion = useWorldStore((state) => state.showRegion);
  const [sky, setSky] = useState<SkyInfo | null>(null);
  const [vegetationReady, setVegetationReady] = useState(false);
  const [terrain, setTerrain] = useState<TerrainResources | null>(null);
  const vegetationStats = useRef<VegetationStats | null>(null);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const frame = useMemo(
    () => createSceneFrame(world.region, world.build.originElevationM),
    [world],
  );
  const height = useCallback(
    (x: number, z: number) =>
      containsPoint(world.build.detail, x, z)
        ? heightAt(world.build.detail, x, z)
        : heightAt(world.build.context, x, z),
    [world],
  );
  const detailHalf = world.build.detail.sizeM / 2;
  const contextHalf = world.build.context.sizeM / 2;
  // La niebla es total antes del borde del contexto visto desde cualquier punto del área de detalle.
  const fogFar = contextHalf - detailHalf - 200;

  const handleVegetationError = useCallback(
    (message: string) => {
      onSceneError(`No se pudo cargar la vegetación: ${message}`);
    },
    [onSceneError],
  );
  const handleVegetationReady = useCallback(() => {
    setVegetationReady(true);
  }, []);
  const handleReady = useCallback(() => {
    const instances = Object.values(world.build.stats.instances).reduce((a, b) => a + b, 0);
    onSceneReady(
      performance.now() - start.current,
      `${String(world.build.chunks.length)} fragmentos de terreno, ${String(instances)} plantas y rocas distribuidas, texturas del terreno ${Math.round((terrain?.textureBytes ?? 0) / 1_048_576).toString()} MB`,
    );
  }, [onSceneReady, world, terrain]);

  return (
    <div className={styles.viewport} data-testid="world-viewport">
      <Canvas
        className={styles.canvas}
        shadows="percentage"
        dpr={[1, quality.maxPixelRatio]}
        frameloop="demand"
        camera={{ fov: 50, near: 0.5, far: 70_000, position: [400, 300, 600] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = WORLD_EXPOSURE;
          gl.domElement.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault();
              onSceneError('Se perdió el contexto gráfico (WebGL). Vuelve a generar el mundo.');
            },
            { once: true },
          );
        }}
        aria-label="Mundo 3D de la granja"
      >
        <WorldCameraRig
          region={world.region}
          height={height}
          detailHalfM={detailHalf}
          maxDistanceM={Math.min(5_500, fogFar * 0.8)}
          initialView="farm"
        />
        <Suspense fallback={null}>
          <WorldSky
            hdriUrl={hdriUrl}
            exposure={WORLD_EXPOSURE}
            shadowMapSize={quality.shadowMapSize}
            shadowExtentM={quality.shadowExtentM}
            fogNearM={fogFar * 0.45}
            fogFarM={fogFar}
            onSkyInfo={setSky}
          />
        </Suspense>
        <TerrainLayer
          world={world}
          lodScale={quality.lodScale}
          fogColor={sky?.fogColor ?? DEFAULT_FOG}
          onResources={setTerrain}
        />
        <VegetationLayer
          world={world}
          catalog={catalog}
          onReady={handleVegetationReady}
          onError={handleVegetationError}
          onStats={(stats) => {
            vegetationStats.current = stats;
          }}
        />
        {showRegion ? (
          <RegionOutline region={world.region} heightfield={world.build.detail} />
        ) : null}
        {showOsm && world.build.localFeatures !== null ? (
          <FeatureOverlay features={world.build.localFeatures} heightfield={world.build.detail} />
        ) : null}
        <SelectionMarker />
        <TerrainPicker world={world} frame={frame} />
        <PerfMonitor vegetation={vegetationStats} />
        <ReadyProbe
          ready={sky !== null && vegetationReady && terrain !== null}
          onReady={handleReady}
        />
      </Canvas>
    </div>
  );
}
