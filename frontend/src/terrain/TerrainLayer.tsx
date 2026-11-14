import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Color, Mesh, MeshStandardMaterial } from 'three';

import type { GeneratedWorld } from '../world/generate.ts';
import {
  chunkLevelFor,
  createTerrainResources,
  disposeTerrainResources,
  type TerrainChunkResource,
  type TerrainResources,
} from './terrainResources.ts';

interface ChunkMeshProps {
  readonly chunk: TerrainChunkResource;
  readonly material: MeshStandardMaterial;
  readonly name: string;
  readonly ref: (mesh: Mesh | null) => void;
}

function ChunkMesh({ chunk, material, name, ref }: ChunkMeshProps) {
  const first = chunk.levels[0];
  if (first === undefined) return null;
  return <mesh ref={ref} geometry={first} material={material} receiveShadow name={name} />;
}

interface TerrainLayerProps {
  readonly world: GeneratedWorld;
  readonly lodScale: number;
  readonly fogColor: Color;
  readonly onResources?: (resources: TerrainResources) => void;
}

/**
 * Terreno del mundo: 64 fragmentos con nivel de detalle por distancia (la GPU descarta los que
 * quedan fuera de la cámara), el anillo de contexto y el anillo exterior bajo la niebla.
 */
export function TerrainLayer({ world, lodScale, fogColor, onResources }: TerrainLayerProps) {
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const resources = useMemo(
    () => createTerrainResources(world, Math.min(8, anisotropy)),
    [world, anisotropy],
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  const chunkSizeM = world.extent.chunkSizeM;

  useEffect(() => {
    onResources?.(resources);
    return () => {
      disposeTerrainResources(resources);
    };
  }, [resources, onResources]);

  useEffect(() => {
    resources.apronMaterial.color.copy(fogColor);
  }, [resources, fogColor]);

  useFrame(({ camera }) => {
    resources.chunks.forEach((chunk, index) => {
      const mesh = meshes.current[index];
      if (mesh === null || mesh === undefined) return;
      const level = chunkLevelFor(
        camera.position.distanceTo(chunk.center),
        chunkSizeM,
        lodScale,
        chunk.levels.length,
      );
      const geometry = chunk.levels[level];
      if (geometry !== undefined && mesh.geometry !== geometry) mesh.geometry = geometry;
    });
  });

  return (
    <group name="terreno">
      {resources.chunks.map((chunk, index) => (
        <ChunkMesh
          // Los fragmentos son estáticos: su índice es estable mientras exista el mundo.
          key={index}
          ref={(mesh) => {
            meshes.current[index] = mesh;
          }}
          chunk={chunk}
          material={resources.detailMaterial}
          name={`fragmento-${String(index)}`}
        />
      ))}
      <mesh
        geometry={resources.context}
        material={resources.contextMaterial}
        receiveShadow
        name="contexto"
      />
      <mesh geometry={resources.apron} material={resources.apronMaterial} name="horizonte" />
    </group>
  );
}
