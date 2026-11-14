import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';

import { type AssetEntry, assetFileUrl } from '../../assets';
import { useViewerStore } from '../viewerStore';
import { HdriPreview } from './HdriPreview';
import { MaterialSample } from './MaterialSample';
import { ModelAsset } from './ModelAsset';
import { RenderLoop } from './RenderLoop';
import { StageBoundary } from './StageBoundary';
import { ViewerLighting } from './ViewerLighting';

function AssetStage({ asset }: { readonly asset: AssetEntry }) {
  switch (asset.kind) {
    case 'model': {
      const file = asset.files.find((candidate) => candidate.role === 'model');
      if (file === undefined) throw new Error('El catálogo no indica el archivo GLB del modelo');
      return <ModelAsset asset={asset} url={assetFileUrl(file.path)} />;
    }
    case 'material':
      return <MaterialSample asset={asset} />;
    case 'hdri':
      return <HdriPreview />;
  }
}

interface ViewerCanvasProps {
  readonly asset: AssetEntry | null;
  readonly lightingHdri: AssetEntry | null;
}

export function ViewerCanvas({ asset, lightingHdri }: ViewerCanvasProps) {
  const autoRotate = useViewerStore((state) => state.autoRotate);
  const showGrid = useViewerStore((state) => state.showGrid);
  const fpsRunning = useViewerStore((state) => state.fps.status === 'running');
  const attempt = useViewerStore((state) => state.attempt);
  const failLoading = useViewerStore((state) => state.failLoading);
  const renderable = asset?.status === 'available' ? asset : null;

  return (
    <Canvas
      // Bajo demanda salvo al medir FPS o con rotación automática.
      frameloop={autoRotate || fpsRunning ? 'always' : 'demand'}
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 35, position: [3, 2, 4], near: 0.01, far: 2000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <RenderLoop />
      <ViewerLighting
        hdri={renderable?.kind === 'hdri' ? renderable : lightingHdri}
        showSunShadowCatcher={renderable?.kind !== 'material'}
      />
      {showGrid ? (
        <Grid
          position={[0, -0.002, 0]}
          cellSize={1}
          sectionSize={5}
          cellThickness={0.6}
          sectionThickness={1}
          cellColor="#4a5a4c"
          sectionColor="#7d8f6c"
          fadeDistance={60}
          fadeStrength={1.5}
          infiniteGrid
        />
      ) : null}
      {renderable === null ? null : (
        <StageBoundary key={`${renderable.id}:${attempt}`} onError={failLoading}>
          <Suspense fallback={null}>
            <AssetStage asset={renderable} />
          </Suspense>
        </StageBoundary>
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate} />
    </Canvas>
  );
}
