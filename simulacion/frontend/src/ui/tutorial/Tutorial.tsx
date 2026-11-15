import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { Icon } from '../components/Icon';
import type { Language } from '../i18n';
import styles from './Tutorial.module.css';
import { audioFile, pick, ui } from './tutorialData';
import type { Reader, TutorialData } from './tutorialData';

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

interface VoiceButtonProps {
  readonly on: boolean;
  readonly onToggle: () => void;
  readonly label: string;
  readonly large?: boolean;
}

/** Botón redondo de lectura en voz alta (estado con aria-pressed y texto). */
function VoiceButton({ on, onToggle, label, large = true }: VoiceButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.voice, large && styles.voiceLarge, on && styles.voiceOn)}
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
      data-testid="voice-toggle"
    >
      <Icon name={on ? 'speaker' : 'speaker-off'} size={large ? 46 : 22} strokeWidth={2} />
    </button>
  );
}

interface WelcomeProps {
  readonly open: boolean;
  readonly data: TutorialData;
  readonly language: Language;
  readonly onLanguage: (language: Language) => void;
  readonly voice: boolean;
  readonly onVoice: (on: boolean) => void;
  readonly withTutorial: boolean;
  readonly onWithTutorial: (on: boolean) => void;
  readonly onStart: (withTutorial: boolean) => void;
  readonly reader: Reader;
}

export function Welcome({
  open,
  data,
  language,
  onLanguage,
  voice,
  onVoice,
  withTutorial,
  onWithTutorial,
  onStart,
  reader,
}: WelcomeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element === null || typeof element.showModal !== 'function') return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  const toggleVoice = () => {
    if (voice) {
      onVoice(false);
      reader.stop();
    } else {
      onVoice(true);
      reader.read('bienvenida', language);
    }
  };
  const voiceState = ui(data, voice ? 'voz_activada' : 'voz_desactivada', language);
  const hasMp3 = audioFile(data, 'bienvenida', language) !== null;
  return (
    <dialog
      ref={dialog}
      className={styles.welcome}
      aria-labelledby="welcome-title"
      aria-describedby="welcome-text"
      lang={language}
      onCancel={(event) => {
        event.preventDefault();
        onStart(false);
      }}
      data-testid="welcome-dialog"
    >
      <p className={styles.brand}>TerraLab 3D · Raíz</p>
      <h2 id="welcome-title" className={styles.welcomeTitle}>
        {ui(data, 'bienvenida_titulo', language)}
      </h2>
      <p id="welcome-text" className={styles.welcomeText}>
        {ui(data, 'bienvenida_texto', language)}
      </p>
      <fieldset className={styles.languages}>
        <legend>{ui(data, 'elige_idioma', language)}</legend>
        <div className={styles.languageGrid}>
          {data.idiomas.map((item) => (
            <button
              key={item.id}
              type="button"
              lang={item.id}
              className={cx(styles.languageOption, language === item.id && styles.languageChosen)}
              aria-pressed={language === item.id}
              onClick={() => {
                onLanguage(item.id);
                if (voice) reader.read('bienvenida', item.id);
              }}
            >
              {item.nombre}
              {data.idiomas_con_audio.includes(item.id) ? (
                <Icon name="speaker" size={14} className={styles.languageAudio} />
              ) : null}
            </button>
          ))}
        </div>
      </fieldset>
      <div className={styles.voiceRow}>
        <VoiceButton
          on={voice}
          onToggle={toggleVoice}
          label={`${ui(data, 'voz', language)}: ${voiceState}`}
        />
        <div>
          <strong>{ui(data, 'voz', language)}</strong>
          <span>{voiceState}</span>
          <small>{ui(data, hasMp3 ? 'aviso_audio' : 'aviso_navegador', language)}</small>
        </div>
      </div>
      <label className={styles.tutorialToggle}>
        <input
          type="checkbox"
          checked={withTutorial}
          onChange={(event) => {
            onWithTutorial(event.target.checked);
          }}
          data-testid="tutorial-checkbox"
        />
        <span className={styles.switch} aria-hidden="true" />
        <span>{ui(data, 'quiero_tutorial', language)}</span>
      </label>
      <button
        type="button"
        className={styles.start}
        onClick={() => {
          onStart(withTutorial);
        }}
        data-testid="welcome-start"
      >
        {ui(data, 'empezar', language)} →
      </button>
      {language === 'es' ? null : <p className={styles.aiNote}>{ui(data, 'aviso_ia', language)}</p>}
    </dialog>
  );
}

interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface TourProps {
  readonly data: TutorialData;
  readonly tour: string;
  readonly language: Language;
  readonly voice: boolean;
  readonly onVoice: (on: boolean) => void;
  readonly reader: Reader;
  readonly onFinish: () => void;
}

const PAD = 10;

export function Tour({ data, tour, language, voice, onVoice, reader, onFinish }: TourProps) {
  const [stops] = useState(() =>
    (data.recorridos[tour] ?? []).filter((stop) => document.querySelector(stop.selector) !== null),
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLElement>(null);
  const stop = stops[index];

  useLayoutEffect(() => {
    if (stop === undefined) return undefined;
    const element = document.querySelector(stop.selector);
    if (element === null) return undefined;
    // Desplazamiento instantáneo: el foco queda bien ubicado al instante y hay menos movimiento.
    // Si cabe, el elemento sube cerca del borde superior y deja espacio a la tarjeta debajo.
    const initial = element.getBoundingClientRect();
    if (initial.height < globalThis.innerHeight - 380) {
      globalThis.scrollTo({ top: globalThis.scrollY + initial.top - 90, behavior: 'instant' });
    } else {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    // Se mide en cada cuadro: sigue el desplazamiento suave y cualquier contenedor con scroll.
    let frame = 0;
    const measure = () => {
      const r = element.getBoundingClientRect();
      setRect((previous) =>
        previous?.top === r.top &&
        previous.left === r.left &&
        previous.width === r.width &&
        previous.height === r.height
          ? previous
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stop]);

  useEffect(() => {
    if (stop === undefined) return;
    card.current?.focus({ preventScroll: true });
    if (voice) reader.read(stop.paso, language);
  }, [stop, voice, language, reader]);

  const finish = useCallback(() => {
    reader.stop();
    onFinish();
  }, [reader, onFinish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      else if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, stops.length - 1));
      else if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [finish, stops.length]);

  if (stop === undefined) return null;
  const step = data.pasos[stop.paso];
  if (step === undefined) return null;
  const last = index === stops.length - 1;
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  const focus: Rect | null =
    rect === null
      ? null
      : {
          top: Math.max(rect.top - PAD, 6),
          left: Math.max(rect.left - PAD, 6),
          width: Math.min(rect.width + 2 * PAD, width - 12),
          height: Math.min(rect.height + 2 * PAD, height - 12),
        };
  const mobile = width < 700;
  const cardWidth = Math.min(420, width - 32);
  let position: CSSProperties = { left: 16, right: 16, bottom: 16 };
  if (focus !== null && !mobile) {
    const left = Math.min(Math.max(focus.left, 16), width - cardWidth - 16);
    const below = height - (focus.top + focus.height) - 34;
    const above = focus.top - 34;
    if (below > 300 && below >= above) {
      position = { top: focus.top + focus.height + 18, left, width: cardWidth, maxHeight: below };
    } else if (above > 300) {
      position = { bottom: height - focus.top + 18, left, width: cardWidth, maxHeight: above };
    } else {
      position = { bottom: 24, right: 24, width: cardWidth };
    }
  }
  const hasMp3 = audioFile(data, stop.paso, language) !== null;
  const voiceState = ui(data, voice ? 'voz_activada' : 'voz_desactivada', language);
  return (
    <div className={styles.tour} lang={language} data-testid="tour">
      <div className={styles.veil} aria-hidden="true" />
      {focus === null ? null : (
        <div className={styles.focus} style={focus} aria-hidden="true">
          <span className={styles.here}>👆 {ui(data, 'aqui', language)}</span>
        </div>
      )}
      <section
        ref={card}
        tabIndex={-1}
        className={cx(styles.card, mobile && styles.cardMobile)}
        style={position}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-purpose"
      >
        <header className={styles.cardHeader}>
          <span className={styles.counter}>
            {ui(data, 'paso', language)
              .replace('{n}', String(index + 1))
              .replace('{total}', String(stops.length))}
          </span>
          <button type="button" className={styles.skip} onClick={finish} data-testid="tour-skip">
            {ui(data, 'saltar', language)} ✕
          </button>
        </header>
        <div className={styles.dots} aria-hidden="true">
          {stops.map((item, i) => (
            <span
              key={item.paso}
              className={cx(i === index && styles.dotCurrent, i < index && styles.dotDone)}
            />
          ))}
        </div>
        <h2 id="tour-title" className={styles.cardTitle}>
          {pick(step.titulo, language)}
        </h2>
        <p className={styles.label}>{ui(data, 'para_que', language)}</p>
        <p id="tour-purpose">{pick(step.para, language)}</p>
        <div className={styles.example}>
          <span aria-hidden="true">💡</span>
          <div>
            <p className={styles.label}>{ui(data, 'ejemplo', language)}</p>
            <p>{pick(step.ejemplo, language)}</p>
          </div>
        </div>
        <div className={styles.audioRow}>
          <VoiceButton
            large={false}
            on={voice}
            label={`${ui(data, 'voz', language)}: ${voiceState}`}
            onToggle={() => {
              if (voice) reader.stop();
              onVoice(!voice);
            }}
          />
          <button
            type="button"
            className={styles.listen}
            onClick={() => {
              reader.read(stop.paso, language);
            }}
          >
            {ui(data, 'escuchar', language)}
          </button>
          <small>{ui(data, hasMp3 ? 'aviso_audio' : 'aviso_navegador', language)}</small>
        </div>
        <footer className={styles.cardFooter}>
          <button
            type="button"
            className={styles.secondary}
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => i - 1);
            }}
          >
            ← {ui(data, 'anterior', language)}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              if (last) finish();
              else setIndex((i) => i + 1);
            }}
            data-testid="tour-next"
          >
            {last ? ui(data, 'terminar', language) : `${ui(data, 'siguiente', language)} →`}
          </button>
        </footer>
      </section>
    </div>
  );
}
