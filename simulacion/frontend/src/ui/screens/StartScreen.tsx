import { useState } from 'react';
import type { ReactNode } from 'react';

import { withLanguage } from '../../config/env';
import type { WebGLSupport } from '../../scene/webgl';
import { useConnectionStore } from '../../state';
import { AlertsPanel } from '../components/AlertsPanel';
import { Button, ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { isLanguage, isLanguageConfigured, LANGUAGES, translate, useLanguage } from '../i18n';
import { Tour, Welcome } from '../tutorial/Tutorial';
import { ui, useReader, useTutorialData, useVoicePreference } from '../tutorial/tutorialData';
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
  /** Comparador de rotaciones de Raíz publicado (se abre en otra pestaña). */
  readonly comparatorUrl: string;
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
  comparatorUrl,
}: StartScreenProps) {
  const api = useConnectionStore((s) => s.api);
  const isChecking = useConnectionStore((s) => s.isChecking);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !isLanguageConfigured());
  const [language, setLanguage] = useLanguage();
  const [voice, setVoice] = useVoicePreference();
  const [withTutorial, setWithTutorial] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [tutorialChosen, setTutorialChosen] = useState(false);
  const tutorial = useTutorialData();
  const reader = useReader(tutorial);

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
          <div className={styles.languageRow}>
            <label className={styles.language} data-tour="idioma">
              <span>{translate('language', language)}</span>
              <select
                value={language}
                onChange={(event) => {
                  if (isLanguage(event.target.value)) setLanguage(event.target.value);
                }}
                data-testid="language-select"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.id} value={item.id} lang={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {tutorial === null ? null : (
              <button
                type="button"
                className={styles.tutorialButton}
                onClick={() => {
                  setWelcomeOpen(true);
                }}
                data-testid="open-tutorial"
              >
                <Icon name="speaker" size={16} />
                {ui(tutorial, 'ver_tutorial', language)}
              </button>
            )}
          </div>
          {language === 'es' ? null : (
            <p className={styles.ctaHint} role="note">
              <span lang={language}>{translate('aiNotice', language)}</span>{' '}
              <span lang="es">{translate('aiNotice', 'es')}</span>
            </p>
          )}
          <p className={styles.eyebrow} lang={language}>
            {translate('eyebrow', language)}
          </p>
          <h1 id="start-title" className={styles.title}>
            TerraLab <span>3D</span>
          </h1>
          <p className={styles.lead} lang={language}>
            {translate('lead', language)}
          </p>
          <div className={styles.cta}>
            {savedSite === null ? (
              <Button
                variant="primary"
                size="large"
                onClick={onChooseLocation}
                data-tour="ubicacion"
                disabled={!graphics.supported}
              >
                <Icon name="map" size={18} />
                {translate('chooseLocation', language)}
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="large"
                  onClick={onContinue}
                  data-tour="ubicacion"
                  disabled={!graphics.supported}
                  data-testid="continue-site"
                >
                  {translate('continueWith', language, { name: savedSite.name })}
                </Button>
                <Button
                  variant="secondary"
                  size="large"
                  onClick={onChooseLocation}
                  disabled={!graphics.supported}
                >
                  {translate('changeLocation', language)}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              onClick={onEnter}
              disabled={!graphics.supported}
              data-tour="laboratorio"
            >
              {translate('openLab', language)}
            </Button>
            <ButtonLink
              variant="secondary"
              size="large"
              href={withLanguage(comparatorUrl, language, {
                voz: voice ? 'si' : 'no',
                ...(tutorialChosen ? { tutorial: 'si' } : {}),
              })}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="compare-rotations"
              data-tour="comparar"
            >
              <Icon name="layers" size={18} />
              {translate('compare', language)}
            </ButtonLink>
            <span className={styles.ctaHint} lang={language}>
              {translate('compareHint', language)}
            </span>
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

        <section className={styles.status} aria-labelledby="status-heading" data-tour="estado">
          <h2 id="status-heading" className={styles.statusHeading}>
            {translate('systemStatus', language)}
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
              detail="Series meteorológicas y de suelo"
              value="Fase posterior"
              tone="planned"
            />
          </ul>
        </section>
      </div>
      <AlertsPanel language={language} />
      {tutorial === null ? null : (
        <Welcome
          open={welcomeOpen}
          data={tutorial}
          language={language}
          onLanguage={setLanguage}
          voice={voice}
          onVoice={setVoice}
          withTutorial={withTutorial}
          onWithTutorial={setWithTutorial}
          reader={reader}
          onStart={(wants) => {
            setWelcomeOpen(false);
            reader.stop();
            setTutorialChosen(wants);
            if (wants) setTourActive(true);
          }}
        />
      )}
      {tutorial !== null && tourActive ? (
        <Tour
          data={tutorial}
          tour="simulacion"
          language={language}
          voice={voice}
          onVoice={setVoice}
          reader={reader}
          onFinish={() => {
            setTourActive(false);
          }}
        />
      ) : null}
      <footer className={styles.footer}>
        <span>TerraLab 3D · v{appVersion}</span>
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
