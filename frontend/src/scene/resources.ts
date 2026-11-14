/**
 * Liberación diferida de recursos de GPU por URL.
 *
 * Cada asset cargado se retiene mientras algún componente lo usa. Al soltarlo, la liberación se
 * aplaza a la siguiente vuelta del bucle de eventos: así el doble montaje de `StrictMode`
 * (desmontar y volver a montar en el mismo ciclo) no destruye recursos que siguen en uso.
 */
import { type Material, Mesh, type Object3D, type Texture } from 'three';

const retained = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function retainResource(key: string): void {
  retained.set(key, (retained.get(key) ?? 0) + 1);
  const timer = pending.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    pending.delete(key);
  }
}

export function releaseResource(key: string, dispose: () => void): void {
  const count = (retained.get(key) ?? 1) - 1;
  if (count > 0) {
    retained.set(key, count);
    return;
  }
  retained.delete(key);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      if (!retained.has(key)) dispose();
    }, 0),
  );
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'displacementMap',
] as const;

/** Libera geometrías, materiales y texturas de un grafo de escena. */
export function disposeObject(root: Object3D): void {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const slots = material as Partial<Record<(typeof TEXTURE_SLOTS)[number], Texture | null>>;
      for (const slot of TEXTURE_SLOTS) {
        const texture = slots[slot];
        if (texture) textures.add(texture);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}
