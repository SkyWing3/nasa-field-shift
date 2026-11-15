import { useEffect, useState } from 'react';

import type { Language } from '../i18n';
import { Icon } from './Icon';
import styles from './AlertsPanel.module.css';

/**
 * Señales de Raíz para Obrajes (Oruro), para leer y escuchar.
 * Fuente: public/alertas/alertas.json (generado por `python -m raiz_data alarmas`).
 * El nivel se muestra con texto, no solo con color. Quechua y aymara son
 * traducción automática con IA; el audio es voz sintética con revisión de pares
 * pendiente.
 */
type Localized = Partial<Record<Language, string>> & { readonly es: string };

interface AppAlert {
  readonly id: string;
  readonly nivel: 'alerta' | 'atencion' | 'informacion';
  readonly titulo: Localized;
  readonly texto: Localized;
  readonly accion: Localized | null;
  readonly fuente: string;
  readonly datos_hasta?: string;
  readonly vigente_hasta?: string;
  readonly audio?: { readonly es?: string };
}

interface AlertsFile {
  readonly schema: 'raiz-alertas-app-v1';
  readonly zona: string;
  readonly no_es_pronostico: string;
  readonly aviso_audio: string;
  readonly aviso_traduccion: { readonly metodo: string; readonly nota_es: string };
  readonly alertas: readonly AppAlert[];
}

const LEVELS: Record<AppAlert['nivel'], Record<Language, string>> = {
  alerta: {
    es: 'Alerta',
    qu: 'Alerta',
    ay: 'Alerta',
    gn: 'Kyhyjerã',
    en: 'Warning',
    pt: 'Alerta',
    fr: 'Alerte',
  },
  atencion: {
    es: 'Atención',
    qu: 'Qhawariy',
    ay: 'Amuyasim',
    gn: 'Ejesareko',
    en: 'Watch',
    pt: 'Atenção',
    fr: 'Vigilance',
  },
  informacion: {
    es: 'Información',
    qu: 'Willakuy',
    ay: 'Yatiyawi',
    gn: 'Marandu',
    en: 'Information',
    pt: 'Informação',
    fr: 'Information',
  },
};

const UI = {
  heading: {
    es: 'Señales de esta semana · Oruro',
    qu: 'Kay semanapi willakuykuna · Oruro',
    ay: 'Aka semanan yatiyawinaka · Oruro',
    gn: 'Ko semana marandu · Oruro',
    en: 'Signals this week · Oruro',
    pt: 'Sinais desta semana · Oruro',
    fr: 'Signaux de la semaine · Oruro',
  },
  listen: {
    es: 'Escuchar en español',
    qu: 'Castellanopi uyariy',
    ay: 'Castellano arut ist’aña',
    gn: 'Ehendu castellano-pe',
    en: 'Listen in Spanish',
    pt: 'Ouvir em espanhol',
    fr: 'Écouter en espagnol',
  },
  zone: {
    es: '',
    qu: 'Obrajes, muyuriqninkunapas, Oruro (yaqa 50 km suyu). Raízqa manam hamuq pachata willanchu: willakuykunapa unanchankunata rikuchin, NOAA nisqapa willakuynintapas p’unchawninwan.',
    ay: 'Obrajes, jak’apatanakapa, Oruro (niya 50 km suyu). Raízax janiw jutïr pacha yatiykiti: yatiyawinakan uñacht’äwinakap uñacht’ayi, NOAA ukan yatiyawipsa urupampi.',
    gn: 'Obrajes ha ijerére, Oruro (tetã’ỹi ~50 km). Raíz ndohechaukái ára oúva: ohechauka marandu mba’ekuaágui ha omombe’u NOAA marandu arange ndive.',
    en: 'Obrajes and surroundings, Oruro (regional cell of ~50 km). Raíz does not forecast: it shows signals in the data and cites the dated NOAA forecast.',
    pt: 'Obrajes e arredores, Oruro (célula regional de ~50 km). O Raíz não faz previsões: mostra sinais dos dados e cita a previsão da NOAA com data.',
    fr: 'Obrajes et environs, Oruro (cellule régionale d’environ 50 km). Raíz ne fait pas de prévision : il montre des signaux dans les données et cite la prévision datée de la NOAA.',
  },
} as const;

function baseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function pick(text: Localized, language: Language): string {
  return text[language] ?? text.es;
}

function useAlerts(): AlertsFile | null {
  const [data, setData] = useState<AlertsFile | null>(null);
  useEffect(() => {
    if (typeof fetch !== 'function') return undefined;
    const controller = new AbortController();
    fetch(`${baseUrl()}alertas/alertas.json`, { signal: controller.signal, cache: 'no-cache' })
      .then((response) => (response.ok ? (response.json() as Promise<AlertsFile>) : null))
      .then((json) => {
        if (json?.schema !== 'raiz-alertas-app-v1') return;
        const now = Date.now();
        setData({
          ...json,
          alertas: json.alertas.filter(
            (alert) =>
              alert.vigente_hasta === undefined || new Date(alert.vigente_hasta).getTime() >= now,
          ),
        });
      })
      .catch(() => {
        // Sin alarmas publicadas: la pantalla inicial funciona igual.
      });
    return () => {
      controller.abort();
    };
  }, []);
  return data;
}

export function AlertsPanel({ language }: { readonly language: Language }) {
  const data = useAlerts();
  if (data === null) return null;
  const current = data.alertas;
  if (current.length === 0) return null;
  return (
    <section
      className={styles.panel}
      aria-labelledby="alerts-heading"
      aria-live="polite"
      data-testid="alerts-panel"
    >
      <h2 id="alerts-heading" className={styles.heading} lang={language}>
        {UI.heading[language]}
      </h2>
      {language === 'es' ? (
        <p className={styles.meta} lang="es">
          {data.zona}. {data.no_es_pronostico}
        </p>
      ) : (
        <p className={styles.meta} lang={language}>
          {UI.zone[language]}
        </p>
      )}
      <ul className={styles.list}>
        {current.map((alert) => (
          <li key={alert.id} className={`${styles.alert ?? ''} ${styles[alert.nivel] ?? ''}`}>
            <span className={styles.level} lang={language}>
              <Icon name="alert" size={14} />
              {LEVELS[alert.nivel][language]}
            </span>
            <h3 className={styles.title} lang={language}>
              {pick(alert.titulo, language)}
            </h3>
            <p lang={language}>{pick(alert.texto, language)}</p>
            {alert.accion === null ? null : (
              <p className={styles.action} lang={language}>
                {pick(alert.accion, language)}
              </p>
            )}
            {language === 'es' ? null : (
              <p className={styles.note} lang="es">
                {data.aviso_traduccion.metodo} · revisión de hablante pendiente.{' '}
                {data.aviso_traduccion.nota_es} Original: «{alert.titulo.es}. {alert.texto.es}»
              </p>
            )}
            {alert.audio?.es === undefined ? null : (
              <div className={styles.audio} lang="es">
                <span>{UI.listen[language]}</span>
                <audio
                  controls
                  preload="none"
                  src={`${baseUrl()}alertas/${alert.audio.es}`}
                  aria-label={`${UI.listen[language]}: ${alert.titulo.es}`}
                />
                <small>{data.aviso_audio}</small>
              </div>
            )}
            <p className={styles.meta} lang="es">
              Fuente: {alert.fuente}
              {alert.datos_hasta === undefined ? '' : ` · Datos hasta: ${alert.datos_hasta}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
