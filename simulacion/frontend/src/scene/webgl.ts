/**
 * Detección de soporte WebGL sin dependencias de Three.js, para poder ejecutarse en
 * la pantalla inicial antes de cargar el motor gráfico.
 */

export type WebGLSupport =
  | { readonly supported: true; readonly version: 2 | 1 }
  | { readonly supported: false; readonly version: null };

export function detectWebGLSupport(doc: Document = document): WebGLSupport {
  const canvas = doc.createElement('canvas');
  try {
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      gl2.getExtension('WEBGL_lose_context')?.loseContext();
      return { supported: true, version: 2 };
    }
    const gl1 = canvas.getContext('webgl');
    if (gl1) {
      gl1.getExtension('WEBGL_lose_context')?.loseContext();
      return { supported: true, version: 1 };
    }
  } catch {
    // Algunos navegadores lanzan en lugar de devolver null cuando WebGL está bloqueado.
  }
  return { supported: false, version: null };
}
