/**
 * Suelo PROVISIONAL de la Fase 01.
 *
 * Es un plano con material PBR sin texturas cuyo único fin es verificar el
 * pipeline de renderizado (iluminación, sombras, cámara). No representa el
 * terreno final: el terreno con relieve y texturas PBR de alta resolución se
 * construirá en la fase de entorno y está registrado como recurso pendiente en
 * docs/ASSETS.md.
 */

const GROUND_SIZE_M = 1200;

export function ProvisionalGround() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow name="provisional-ground">
      <planeGeometry args={[GROUND_SIZE_M, GROUND_SIZE_M]} />
      <meshStandardMaterial color="#6b5a45" roughness={0.96} metalness={0} />
    </mesh>
  );
}
