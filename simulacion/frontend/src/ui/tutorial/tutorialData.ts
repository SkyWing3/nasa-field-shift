import { useCallback, useEffect, useRef, useState } from 'react';

import type { Language } from '../i18n';

/**
 * Datos de la bienvenida y del tutorial, compartidos con beta-frontend.
 * Fuente: content/tutorial/tutorial.json, publicada en public/tutorial/.
 * Audios es/qu/ay/gn: voz sintética Meta MMS (requiere revisión de pares);
 * en/pt/fr usan la voz del navegador.
 */
export type Localized = Readonly<Partial<Record<Language, string>>> & { readonly es: string };

export interface TutorialStep {
  readonly titulo: Localized;
  readonly para: Localized;
  readonly ejemplo: Localized;
}

export interface TourStop {
  readonly paso: string;
  readonly selector: string;
}

export interface TutorialData {
  readonly schema: 'raiz-tutorial-v1';
  readonly idiomas: readonly {
    readonly id: Language;
    readonly nombre: string;
    readonly voz_navegador: string | null;
  }[];
  readonly idiomas_con_audio: readonly string[];
  readonly ui: Readonly<Record<string, Localized>>;
  readonly pasos: Readonly<Record<string, TutorialStep>>;
  readonly recorridos: Readonly<Record<string, readonly TourStop[]>>;
  readonly manifiesto: AudioManifest | null;
}

interface AudioManifest {
  readonly archivos: Readonly<
    Record<
      string,
      | Readonly<Record<string, { readonly archivo: string; readonly motor?: string } | undefined>>
      | undefined
    >
  >;
}

function baseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function pick(text: Localized | undefined, language: Language): string {
  if (text === undefined) return '';
  return text[language] ?? text.es;
}

export function ui(data: TutorialData, key: string, language: Language): string {
  return pick(data.ui[key], language);
}

export function audioFile(data: TutorialData, id: string, language: Language): string | null {
  return data.manifiesto?.archivos[language]?.[id]?.archivo ?? null;
}

/** Aviso bajo el audio: voz sintética y su motor (Meta MMS o ElevenLabs), o la voz del navegador. */
export function audioNote(data: TutorialData, id: string, language: Language): string {
  const entry = data.manifiesto?.archivos[language]?.[id];
  if (entry === undefined) return ui(data, 'aviso_navegador', language);
  return `${ui(data, 'aviso_audio', language)} (${entry.motor ?? 'Meta MMS'})`;
}

/** Texto leído en voz alta (el mismo que dicen los MP3). */
export function spokenText(data: TutorialData, id: string, language: Language): string {
  if (id === 'bienvenida') {
    return `${ui(data, 'bienvenida_titulo', language)}. ${ui(data, 'bienvenida_texto', language)}`;
  }
  const step = data.pasos[id];
  if (step === undefined) return '';
  return `${pick(step.titulo, language)}. ${pick(step.para, language)} ${ui(data, 'ejemplo_voz', language)}: ${pick(step.ejemplo, language)}`;
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl()}${path}`, { signal, cache: 'no-cache' });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export function useTutorialData(): TutorialData | null {
  const [data, setData] = useState<TutorialData | null>(null);
  useEffect(() => {
    if (typeof fetch !== 'function') return undefined;
    const controller = new AbortController();
    void Promise.all([
      fetchJson<Omit<TutorialData, 'manifiesto'>>('tutorial/tutorial.json', controller.signal),
      fetchJson<AudioManifest>('tutorial/audio/manifest.json', controller.signal),
    ]).then(([tutorial, manifest]) => {
      if (tutorial?.schema === 'raiz-tutorial-v1') setData({ ...tutorial, manifiesto: manifest });
    });
    return () => {
      controller.abort();
    };
  }, []);
  return data;
}

export interface Reader {
  readonly read: (id: string, language: Language) => void;
  readonly stop: () => void;
}

/** Lee un paso: MP3 pregenerado si existe; si no, la voz del navegador para ese idioma. */
export function useReader(data: TutorialData | null): Reader {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    try {
      globalThis.speechSynthesis.cancel();
    } catch {
      // Sin voz del navegador.
    }
  }, []);
  const read = useCallback(
    (id: string, language: Language) => {
      stop();
      if (data === null) return;
      const file = audioFile(data, id, language);
      if (file !== null) {
        const player = new Audio(`${baseUrl()}tutorial/audio/${file}`);
        audio.current = player;
        player.play().catch(() => undefined);
        return;
      }
      const voice = data.idiomas.find((item) => item.id === language)?.voz_navegador ?? null;
      if (voice !== null && 'speechSynthesis' in globalThis) {
        const phrase = new SpeechSynthesisUtterance(spokenText(data, id, language));
        phrase.lang = voice;
        phrase.rate = 0.95;
        globalThis.speechSynthesis.speak(phrase);
      }
    },
    [data, stop],
  );
  useEffect(() => stop, [stop]);
  return { read, stop };
}

const VOICE_KEY = 'raiz-voz';

/** Lectura en voz alta: ?voz=si|no en la URL o la preferencia guardada. */
export function useVoicePreference(): [boolean, (on: boolean) => void] {
  const [voice, setVoice] = useState<boolean>(() => {
    try {
      const fromUrl = new URLSearchParams(globalThis.location.search).get('voz');
      if (fromUrl === 'si' || fromUrl === 'no') return fromUrl === 'si';
      return globalThis.localStorage.getItem(VOICE_KEY) === 'si';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      globalThis.localStorage.setItem(VOICE_KEY, voice ? 'si' : 'no');
    } catch {
      // Preferencia válida solo durante la sesión.
    }
  }, [voice]);
  return [voice, setVoice];
}
