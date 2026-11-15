import type { ReactNode } from 'react';

import type { WebGLSupport } from '../../scene/webgl';
import { useConnectionStore } from '../../state';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import styles from './StartScreen.module.css';

/** Resumen de la ubicación guardada que se muestra en la pantalla inicial. */
export interface SavedSiteSummary {
  readonly name: string;
  readonly area: string;
  readonly center: string;
}

interface StartScreenProps {
  readonly graphics: WebGLSupport;
  readonly appVersion: string;
  readonly savedSite: SavedSiteSummary | null;
  /** Aviso si se descartó una ubicación guardada no válida. */
  readonly siteWarning: string | null;
  readonly onChooseLocation: () => void;
  readonly onContinue: () => void;
  readonly onEnter: () => void;
  readonly onRetryApi: () => void;
}

type CheckTone = 'ok' | 'error' | 'pending' | 'planned';

interface CheckRowProps {
  readonly name: string;
  readonly detail: string;
  readonly value: string;
  readonly tone: CheckTone;
  readonly action?: ReactNode;
  readonly testId?: string;
}

function CheckRow({ name, detail, value, tone, action, testId }: CheckRowProps) {
  return (
    <li className={`${styles.check ?? ''} ${styles[tone] ?? ''}`} data-testid={testId}>
      <span className={styles.indicator} aria-hidden="true" />
      <span>
        <span className={styles.checkName}>{name}</span>
        <span className={styles.checkDetail}>{detail}</span>
      </span>
      <span className={styles.checkValue}>
        {value}
        {action}
      </span>
    </li>
  );
}

/** Abanico de surcos en perspectiva que convergen en el horizonte (decorativo). */
function Furrows() {
  const lines = Array.from({ length: 29 }, (_, i) => {
    const x = -700 + i * 100;
    return <line key={x} x1={x} y1={600} x2={700} y2={0} />;
  });
  return (
    <svg
      className={styles.furrows}
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {lines}
      </g>
    </svg>
  );
}

export function StartScreen({
  graphics,
  appVersion,
  savedSite,
  siteWarning,
  onChooseLocation,
  onContinue,
  onEnter,
  onRetryApi,
}: StartScreenProps) {
  const api = useConnectionStore((s) => s.api);
  const isChecking = useConnectionStore((s) => s.isChecking);

  const apiCheck: Pick<CheckRowProps, 'value' | 'tone' | 'detail'> =
    api.status === 'online'
      ? { value: 'Conectada', tone: 'ok', detail: `v${api.version} · entorno ${api.environment}` }
      : api.status === 'offline'
        ? { value: 'Sin conexión', tone: 'error', detail: api.message }
        : { value: 'Comprobando…', tone: 'pending', detail: 'Contactando con el servidor' };

  return (
    <div className={styles.screen} data-testid="start-screen">
      <Furrows />
      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="start-title">
          <p className={styles.eyebrow}>Laboratorio de simulación agrícola</p>
          <h1 id="start-title" className={styles.title}>
            TerraLab <span>3D</span>
          </h1>
          <p className={styles.lead}>
            Prepara parcelas, cultiva y compara estrategias de rotación en un entorno 3D, con
            modelos agronómicos explícitos y reproducibles alimentados por datos científicos de la
            NASA.
          </p>
          <div className={styles.cta}>
            {savedSite === null ? (
              <Button
                variant="primary"
                size="large"
                onClick={onChooseLocation}
                disabled={!graphics.supported}
              >
                <Icon name="map" size={18} />
                Elegir la ubicación de la granja
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="large"
                  onClick={onContinue}
                  disabled={!graphics.supported}
                  data-testid="continue-site"
                >
                  Continuar con {savedSite.name}
                </Button>
                <Button
                  variant="secondary"
                  size="large"
                  onClick={onChooseLocation}
                  disabled={!graphics.supported}
                >
                  Cambiar ubicación
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={onEnter} disabled={!graphics.supported}>
              Abrir el laboratorio (escena provisional)
            </Button>
            {graphics.supported ? (
              api.status === 'offline' ? (
                <span className={styles.ctaHint}>
                  Sin la API no hay búsqueda de lugares por nombre: puedes usar coordenadas, el mapa
                  o la región demostrativa. La simulación la necesitará.
                </span>
              ) : null
            ) : (
              <span className={`${styles.ctaHint ?? ''} ${styles.ctaBlocked ?? ''}`} role="alert">
                Tu navegador no ofrece WebGL: no es posible mostrar el mapa ni la escena 3D.
              </span>
            )}
            {siteWarning === null ? null : (
              <span className={styles.ctaHint} role="status">
                {siteWarning}
              </span>
            )}
          </div>
        </section>

        <section className={styles.status} aria-labelledby="status-heading">
          <h2 id="status-heading" className={styles.statusHeading}>
            Estado del sistema
          </h2>
          <ul className={styles.checks}>
            <CheckRow
              name="Motor gráfico"
              detail={graphics.supported ? 'Renderizado acelerado por GPU' : 'WebGL no disponible'}
              value={graphics.supported ? `WebGL ${String(graphics.version)}` : 'No disponible'}
              tone={graphics.supported ? 'ok' : 'error'}
              testId="check-graphics"
            />
            <CheckRow
              name="API de simulación"
              testId="check-api"
              {...apiCheck}
              action={
                api.status === 'offline' ? (
                  <Button
                    variant="ghost"
                    size="small"
                    className={styles.inlineRetry}
                    onClick={onRetryApi}
                    disabled={isChecking}
                    aria-label="Reintentar conexión con la API"
                  >
                    <Icon name="refresh" size={14} />
                  </Button>
                ) : undefined
              }
            />
            <CheckRow
              name="Ubicación de la granja"
              detail={
                savedSite === null
                  ? 'Elige un lugar en el mapa mundial'
                  : `${savedSite.center} · ${savedSite.area}`
              }
              value={savedSite === null ? 'Sin elegir' : 'Guardada'}
              tone={savedSite === null ? 'pending' : 'ok'}
              testId="check-site"
            />
            <CheckRow
              name="Motor agronómico"
              detail="Modelos de cultivo, suelo y agua"
              value="Fase posterior"
              tone="planned"
            />
            <CheckRow
              name="Datos científicos NASA"
              detail="Dato regional de la celda NASA POWER, no medición de la parcela. POWER no mide granizo."
              value="Fase posterior"
              tone="planned"
            />
          </ul>
        </section>
      </div>
      <footer className={styles.footer}>
        <span>TerraLab 3D · v{appVersion}</span>
        <a className={styles.devLink} href="/">
          Raíz · comparar nueve casos
        </a>
        {import.meta.env.DEV ? (
          // Herramienta de desarrollo: no existe en el build de producción.
          <a className={styles.devLink} href="/asset-viewer.html">
            Visualizador de assets (desarrollo)
          </a>
        ) : null}
        <span>Fase 03 · Mapa mundial y ubicación</span>
      </footer>
    </div>
  );
}
