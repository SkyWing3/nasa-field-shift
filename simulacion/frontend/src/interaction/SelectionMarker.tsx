import { Line } from '@react-three/drei';

import { useWorldStore } from '../state/worldStore';

/** Marcador de la interfaz sobre el punto seleccionado (anillo y línea vertical). */
export function SelectionMarker() {
  const selection = useWorldStore((state) => state.selection);
  if (selection === null) return null;
  const { x, y, z } = selection;
  return (
    <group position={[x, y, z]} name="seleccion">
      <mesh rotation-x={-Math.PI / 2} position-y={0.15} renderOrder={2}>
        <ringGeometry args={[1.6, 2.2, 48]} />
        <meshBasicMaterial color="#f2c14e" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <Line
        points={[
          [0, 0.1, 0],
          [0, 12, 0],
        ]}
        color="#f2c14e"
        lineWidth={2}
      />
    </group>
  );
}
