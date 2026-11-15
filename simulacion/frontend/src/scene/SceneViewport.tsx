import { Canvas, type RootState } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { CAMERA_CONFIG } from '../camera';
import { useSceneStore } from '../state';
import { ErrorBoundary, ErrorState, LoadingIndicator } from '../ui';
import { SceneContents } from './SceneContents';
import styles from './SceneViewport.module.css';
import { useResourceProgress } from './useResourceProgress';
import { detectWebGLSupport } from './webgl';

/**
 * Exposición del tone mapping (ACES Filmic, el predeterminado de R3F). El cielo
 * procedural produce radiancias altas; con exposición 1 el horizonte se satura.
 */
const TONE_MAPPING_EXPOSURE = 0.62;

const SCENE_ERROR_COPY = {
  'webgl-unsupported': {
    title: 'WebGL no disponible',
    body: 'Este navegador o dispositivo no permite renderizar gráficos 3D. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari con la aceleración por hardware activada.',
  },
  'context-lost': {
    title: 'Se perdió el contexto gráfico',
    body: 'La GPU reinició el contexto WebGL (por falta de memoria o un cambio de controlador). Reinicia la escena para continuar.',
  },
  'render-error': {
    title: 'Error al renderizar la escena',
    body: 'Se produjo un error inesperado en el motor gráfico.',
  },
} as const;

function ResourceLoadingOverlay() {
  const { active, progress, loaded, total, failed } = useResourceProgress();
  const sceneStatus = useSceneStore((s) => s.status.kind);
  if (!active && sceneStatus !== 'initializing') return null;
  return (
    <div className={styles.overlay}>
      <LoadingIndicator
        label={active ? 'Cargando recursos 3D' : 'Inicializando escena'}
        {...(active ? { progress, detail: `${String(loaded)} de ${String(total)} recursos` } : {})}
        {...(failed.length > 0
          ? { warning: `${String(failed.length)} recurso(s) no se pudieron cargar` }
          : {})}
      />
    </div>
  );
}

/**
 * Lienzo 3D con su ciclo de vida (detección de WebGL, inicialización, pérdida de
 * contexto y errores de renderizado) reflejado en `sceneStore`.
 *
 * La escena se renderiza bajo demanda (`frameloop="demand"`): solo se dibujan
 * frames cuando algo cambia. La simulación nunca depende de este bucle (ADR-003).
 */
export function SceneViewport() {
  const status = useSceneStore((s) => s.status);
  const beginInitialization = useSceneStore((s) => s.beginInitialization);
  const markReady = useSceneStore((s) => s.markReady);
  const fail = useSceneStore((s) => s.fail);
  const resetScene = useSceneStore((s) => s.reset);
  const [graphics] = useState(detectWebGLSupport);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (graphics.supported) {
      beginInitialization();
    } else {
      fail('webgl-unsupported', 'No se pudo crear un contexto WebGL.');
    }
    return resetScene;
  }, [graphics.supported, attempt, beginInitialization, fail, resetScene]);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.toneMappingExposure = TONE_MAPPING_EXPOSURE;
      gl.domElement.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          fail('context-lost', 'Evento webglcontextlost recibido.');
        },
        { once: true },
      );
      markReady();
    },
    [fail, markReady],
  );

  const restart = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div className={styles.viewport} data-testid="scene-viewport" data-scene-status={status.kind}>
      {graphics.supported && status.kind !== 'error' ? (
        <ErrorBoundary
          key={attempt}
          onError={(error) => {
            fail('render-error', error.message);
          }}
          fallback={() => null}
        >
          <Canvas
            className={styles.canvas}
            // PCF: PCFSoftShadowMap se eliminó en Three.js r18x y R3F lo usa con `shadows`.
            shadows="percentage"
            dpr={[1, 2]}
            frameloop="demand"
            camera={{
              fov: CAMERA_CONFIG.fov,
              near: CAMERA_CONFIG.near,
              far: CAMERA_CONFIG.far,
              position: CAMERA_CONFIG.initialPosition,
            }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={handleCreated}
            aria-label="Vista 3D de la granja"
          >
            <Suspense fallback={null}>
              <SceneContents />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      ) : null}

      <ResourceLoadingOverlay />

      {status.kind === 'error' ? (
        <div className={styles.overlay}>
          <ErrorState
            title={SCENE_ERROR_COPY[status.reason].title}
            detail={status.message}
            {...(status.reason === 'webgl-unsupported'
              ? {}
              : { onRetry: restart, retryLabel: 'Reiniciar escena' })}
          >
            {SCENE_ERROR_COPY[status.reason].body}
          </ErrorState>
        </div>
      ) : null}

      {status.kind === 'ready' ? (
        <p className={styles.badge}>
          <strong>Escena provisional.</strong> Suelo y cielo de validación técnica; el entorno
          fotorrealista se construirá en la fase de escena.
        </p>
      ) : null}
    </div>
  );
}
