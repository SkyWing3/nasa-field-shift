import { useMemo } from 'react';

import { createLocalFrame, formatLength, type GeoPoint, regionCorners } from '../../geo';
import type { RectangularRegion } from '../../geo';
import styles from './Location.module.css';

const GRID_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000] as const;

function gridStep(span: number): number {
  return GRID_STEPS.find((step) => span / step <= 10) ?? 2_000;
}

interface RegionSchematicProps {
  readonly region: RectangularRegion;
  /** Origen del sistema local de la escena (el centro confirmado). */
  readonly origin: GeoPoint;
}

/**
 * Plano de la región en coordenadas locales (metros). Los vértices se convierten de WGS84 al plano
 * ENU del origen con la misma función que usará la escena 3D, así que el dibujo sirve de
 * comprobación visual de la conversión. En el SVG, y = −norte.
 */
export function RegionSchematic({ region, origin }: RegionSchematicProps) {
  const geometry = useMemo(() => {
    const frame = createLocalFrame(origin);
    const corners = regionCorners(region).map((corner) => frame.toEnu(corner));
    const extent = Math.max(
      ...corners.flatMap(({ east, north }) => [Math.abs(east), Math.abs(north)]),
    );
    const half = extent * 1.3;
    const step = gridStep(half * 2);
    const lines: number[] = [];
    for (let value = -Math.floor(half / step) * step; value <= half; value += step)
      lines.push(value);
    return { corners, half, step, lines };
  }, [region, origin]);

  const { corners, half, step, lines } = geometry;
  const font = half * 0.055;
  const points = corners.map(({ east, north }) => `${east},${-north}`).join(' ');

  return (
    <figure className={styles.schematic}>
      <svg
        viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
        role="img"
        aria-label={`Plano de la región en coordenadas locales, cuadrícula de ${formatLength(step)}`}
        data-testid="region-schematic"
      >
        <g className={styles.schematicGrid}>
          {lines.map((value) => (
            <g key={value}>
              <line x1={value} y1={-half} x2={value} y2={half} vectorEffect="non-scaling-stroke" />
              <line x1={-half} y1={value} x2={half} y2={value} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
        <polygon
          className={styles.schematicRegion}
          points={points}
          vectorEffect="non-scaling-stroke"
        />
        <g className={styles.schematicAxes}>
          <line x1={0} y1={0} x2={half * 0.45} y2={0} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={0} x2={0} y2={-half * 0.45} vectorEffect="non-scaling-stroke" />
          <circle r={half * 0.015} />
          <text x={half * 0.47} y={font * 0.35} fontSize={font}>
            +X este
          </text>
          <text x={font * 0.3} y={-half * 0.48} fontSize={font}>
            −Z norte
          </text>
        </g>
        <g
          className={styles.schematicNorth}
          transform={`translate(${half * 0.82} ${-half * 0.78})`}
        >
          <path
            d={`M0 ${-font * 1.6} L${font * 0.6} ${font * 0.4} L0 0 L${-font * 0.6} ${font * 0.4} Z`}
          />
          <text y={font * 1.6} fontSize={font} textAnchor="middle">
            N
          </text>
        </g>
      </svg>
      <figcaption className={styles.subtle}>
        Plano local (ENU) con origen en el centro confirmado · cuadrícula de {formatLength(step)}
      </figcaption>
    </figure>
  );
}
