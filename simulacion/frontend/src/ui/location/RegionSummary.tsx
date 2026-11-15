import type { RegionMetrics } from '../../geo/metrics.ts';
import { formatArea, formatAzimuth, formatDegrees, formatDms, formatLength } from '../../geo';
import styles from './Location.module.css';

const CORNER_LABELS = ['V1', 'V2', 'V3', 'V4'] as const;

interface RegionSummaryProps {
  readonly metrics: RegionMetrics;
  readonly center: { readonly latitude: number; readonly longitude: number };
  /** Muestra la tabla de vértices desplegada (pantalla de preparación). */
  readonly cornersOpen?: boolean;
}

/** Medidas geodésicas de la región: centro, superficie, lados, orientación y vértices. */
export function RegionSummary({ metrics, center, cornersOpen = false }: RegionSummaryProps) {
  const [south, east] = metrics.sideLengthsM;
  return (
    <>
      <dl className={styles.metrics} data-testid="region-metrics">
        <div>
          <dt>Centro</dt>
          <dd data-testid="region-center">
            {formatDegrees(center.latitude)}, {formatDegrees(center.longitude)}
            <span className={styles.subtle}>
              {formatDms(center.latitude, 'lat')} · {formatDms(center.longitude, 'lon')}
            </span>
          </dd>
        </div>
        <div>
          <dt>Superficie</dt>
          <dd data-testid="region-area">
            {formatArea(metrics.areaM2)}
            <span className={styles.subtle}>geodésica sobre el elipsoide WGS84</span>
          </dd>
        </div>
        <div>
          <dt>Dimensiones</dt>
          <dd data-testid="region-dimensions">
            {formatLength(south ?? 0)} × {formatLength(east ?? 0)}
            <span className={styles.subtle}>ancho × largo, longitud geodésica de los lados</span>
          </dd>
        </div>
        <div>
          <dt>Orientación</dt>
          <dd data-testid="region-orientation">
            {formatAzimuth(metrics.orientationDeg)}
            <span className={styles.subtle}>azimut del lado largo desde el norte verdadero</span>
          </dd>
        </div>
        <div>
          <dt>Perímetro</dt>
          <dd>{formatLength(metrics.perimeterM)}</dd>
        </div>
      </dl>
      <details className={styles.corners} open={cornersOpen}>
        <summary>Coordenadas del perímetro</summary>
        <table data-testid="region-corners">
          <thead>
            <tr>
              <th scope="col">Vértice</th>
              <th scope="col">Latitud</th>
              <th scope="col">Longitud</th>
            </tr>
          </thead>
          <tbody>
            {metrics.corners.map((corner, index) => (
              <tr key={CORNER_LABELS[index]}>
                <th scope="row">{CORNER_LABELS[index]}</th>
                <td>{formatDegrees(corner.latitude)}</td>
                <td>{formatDegrees(corner.longitude)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.subtle}>
          V1 es la esquina suroeste del rectángulo sin girar; el resto sigue el sentido antihorario.
        </p>
      </details>
    </>
  );
}
