import { useMemo } from 'react';

import {
  createLocalFrame,
  formatDegrees,
  formatLength,
  type RegionPreset,
  tangentPlaneDrop,
} from '../../geo';
import { regionMetrics } from '../../geo/metrics.ts';
import type { SavedSite } from '../../persistence';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { RegionSchematic } from '../location/RegionSchematic';
import { RegionSummary } from '../location/RegionSummary';
import styles from './FarmScreen.module.css';

interface FarmScreenProps {
  readonly site: SavedSite;
  readonly preset: RegionPreset | null;
  readonly onEdit: () => void;
  readonly onGenerateWorld: () => void;
  readonly onEnterWorkspace: () => void;
  readonly onHome: () => void;
}

/** Paso final del flujo de ubicación: resumen de la región y del marco local de la granja. */
export function FarmScreen({
  site,
  preset,
  onEdit,
  onGenerateWorld,
  onEnterWorkspace,
  onHome,
}: FarmScreenProps) {
  const metrics = useMemo(() => regionMetrics(site.region), [site.region]);
  const farthest = useMemo(() => {
    const frame = createLocalFrame(site.frameOrigin);
    return Math.max(
      ...metrics.corners.map((corner) => {
        const { east, north } = frame.toEnu(corner);
        return Math.hypot(east, north);
      }),
    );
  }, [metrics, site.frameOrigin]);

  return (
    <div className={styles.screen} data-testid="farm-screen">
      <header className={styles.header}>
        <Button variant="ghost" size="small" onClick={onHome} aria-label="Volver al inicio">
          <Icon name="home" size={16} />
        </Button>
        <div>
          <p className={styles.eyebrow}>Preparación de la granja</p>
          <h1 className={styles.title} data-testid="farm-name">
            {site.name}
          </h1>
          {preset !== null ? <p className={styles.locality}>{preset.locality}</p> : null}
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onEdit} data-testid="edit-location">
            <Icon name="map" size={16} />
            Modificar en el mapa
          </Button>
          <Button variant="ghost" onClick={onEnterWorkspace}>
            Laboratorio (escena provisional)
          </Button>
          <Button variant="primary" onClick={onGenerateWorld} data-testid="generate-world">
            Generar mundo 3D
          </Button>
        </div>
      </header>

      {preset !== null ? (
        <p className={styles.disclaimer} data-testid="demo-disclaimer">
          {preset.disclaimer}
        </p>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="plan-heading">
            <h2 id="plan-heading" className={styles.cardTitle}>
              Plano de la zona de trabajo
            </h2>
            <RegionSchematic region={site.region} origin={site.frameOrigin} />
          </section>

          <section className={styles.card} aria-labelledby="frame-heading">
            <h2 id="frame-heading" className={styles.cardTitle}>
              Sistema de coordenadas de la escena
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Origen fijo</dt>
                <dd data-testid="frame-origin">
                  {formatDegrees(site.frameOrigin.latitude)},{' '}
                  {formatDegrees(site.frameOrigin.longitude)}
                </dd>
              </div>
              <div>
                <dt>Ejes (metros)</dt>
                <dd>+X este · +Y arriba · −Z norte</dd>
              </div>
              <div>
                <dt>Conversión</dt>
                <dd>Plano tangente local ENU al elipsoide WGS84 (vía coordenadas ECEF)</dd>
              </div>
              <div>
                <dt>Curvatura</dt>
                <dd>
                  En el vértice más lejano ({formatLength(farthest)}), la superficie queda{' '}
                  {formatLength(tangentPlaneDrop(farthest))} por debajo del plano. Las distancias
                  horizontales coinciden con las geodésicas con un error relativo inferior a 1 ppm.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="next-heading">
            <h2 id="next-heading" className={styles.cardTitle}>
              Siguiente paso
            </h2>
            <p className={styles.next}>
              «Generar mundo 3D» construye el terreno con el relieve real (NASADEM), la cobertura
              del suelo (ESA WorldCover), los caminos y el agua de OpenStreetMap, materiales y
              vegetación del catálogo, con este origen y esta región reservada para las parcelas.
              Las mecánicas de cultivo llegarán en fases posteriores.
            </p>
          </section>
        </div>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className={styles.cardTitle}>
              Medidas
            </h2>
            <RegionSummary metrics={metrics} center={site.region.center} cornersOpen />
          </section>

          {preset !== null ? (
            <section className={styles.card} aria-labelledby="verification-heading">
              <h2 id="verification-heading" className={styles.cardTitle}>
                Verificación de la región demostrativa
              </h2>
              <ul className={styles.sources}>
                {preset.verification.map((record) => (
                  <li key={record.source}>
                    <a href={record.url} target="_blank" rel="noreferrer noopener">
                      {record.source}
                    </a>
                    <span>{record.detail}</span>
                    <span className={styles.checked}>Comprobado el {record.checkedOn}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
