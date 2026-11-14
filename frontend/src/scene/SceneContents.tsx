import { CameraRig } from '../camera';
import { ProvisionalGround } from '../terrain';
import { SkyLighting } from '../weather-visual';

/**
 * Composición de la escena 3D. Cada módulo aporta su capa (clima visual, terreno,
 * cámara; vegetación en fases posteriores). Solo lectura: ningún componente de la
 * escena escribe estado de simulación.
 */
export function SceneContents() {
  return (
    <>
      <SkyLighting />
      <ProvisionalGround />
      <CameraRig />
    </>
  );
}
