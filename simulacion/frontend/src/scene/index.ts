/**
 * Módulo de escena 3D. `SceneViewport` arrastra Three.js y debe importarse de forma
 * diferida (ver `app/WorkspaceScreen.tsx`); `webgl` es ligero y apto para la carga inicial.
 */
export { detectWebGLSupport } from './webgl';
export type { WebGLSupport } from './webgl';
