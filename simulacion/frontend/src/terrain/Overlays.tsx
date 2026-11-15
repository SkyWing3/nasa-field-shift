import { Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';

import type { RectangularRegion } from '../geo/region.ts';
import { regionCornersEnu } from '../geo/region.ts';
import type { LocalFeatures } from '../world/features.ts';
import { heightAt, type Heightfield } from '../world/heightfield.ts';

const LIFT_M = 0.4;

function drape(
  hf: Heightfield,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  stepM: number,
  out: number[],
): void {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / stepM));
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps;
    const t1 = (s + 1) / steps;
    const x0 = ax + (bx - ax) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const z1 = az + (bz - az) * t1;
    out.push(x0, heightAt(hf, x0, z0) + LIFT_M, z0, x1, heightAt(hf, x1, z1) + LIFT_M, z1);
  }
}

/** Contorno de la región reservada para la granja, ajustado al relieve. */
export function RegionOutline({
  region,
  heightfield,
}: {
  readonly region: RectangularRegion;
  readonly heightfield: Heightfield;
}) {
  const points = useMemo(() => {
    const corners = regionCornersEnu(region).map(([e, n]) => [e, -n] as const);
    const out: [number, number, number][] = [];
    corners.forEach(([ax, az], k) => {
      const [bx, bz] = corners[(k + 1) % corners.length] ?? [ax, az];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const z = az + ((bz - az) * s) / steps;
        out.push([x, heightAt(heightfield, x, z) + LIFT_M, z]);
      }
    });
    return out;
  }, [region, heightfield]);
  return <Line points={points} color="#f2c14e" lineWidth={2.5} name="limite-granja" />;
}

const OVERLAY_COLORS: Readonly<Record<string, [number, number, number]>> = {
  paved: [0.95, 0.42, 0.2],
  unpaved: [0.98, 0.85, 0.35],
  path: [0.85, 0.85, 0.75],
  waterway: [0.3, 0.65, 1],
  water: [0.3, 0.85, 1],
  building: [0.92, 0.45, 0.9],
  landuse: [0.55, 0.9, 0.5],
  railway: [0.7, 0.7, 0.7],
};

/** Elementos de OpenStreetMap resaltados sobre el terreno (para distinguir lo que es dato real). */
export function FeatureOverlay({
  features,
  heightfield,
}: {
  readonly features: LocalFeatures;
  readonly heightfield: Heightfield;
}) {
  const object = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const add = (category: string, ring: Float32Array, step: number): void => {
      const color = OVERLAY_COLORS[category] ?? [1, 1, 1];
      const before = positions.length;
      const count = ring.length / 2;
      for (let k = 0; k < count - 1; k++) {
        drape(
          heightfield,
          ring[k * 2] ?? 0,
          ring[k * 2 + 1] ?? 0,
          ring[k * 2 + 2] ?? 0,
          ring[k * 2 + 3] ?? 0,
          step,
          positions,
        );
      }
      for (let v = before; v < positions.length; v += 3) colors.push(...color);
    };
    for (const line of features.lines) {
      const category =
        line.kind === 'waterway' || line.kind === 'railway'
          ? line.kind
          : line.kind === 'path'
            ? 'path'
            : line.paved === true
              ? 'paved'
              : 'unpaved';
      add(category, line.points, 6);
    }
    for (const polygon of features.polygons) add(polygon.kind, polygon.ring, 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const material = new LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      transparent: true,
      opacity: 0.95,
    });
    const segments = new LineSegments(geometry, material);
    segments.name = 'datos-osm';
    segments.renderOrder = 3;
    return segments;
  }, [features, heightfield]);
  useEffect(
    () => () => {
      object.geometry.dispose();
      object.material.dispose();
    },
    [object],
  );
  return <primitive object={object} />;
}
