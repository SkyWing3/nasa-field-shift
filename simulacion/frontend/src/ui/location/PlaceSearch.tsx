import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import {
  type PlaceSearchAvailability,
  PlaceSearchError,
  type PlaceSearchProvider,
  type PlaceSearchResult,
  searchPlaces,
} from '../../place-search';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import styles from './Location.module.css';

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'searching'; readonly query: string }
  | {
      readonly kind: 'results';
      readonly query: string;
      readonly results: readonly PlaceSearchResult[];
    }
  | { readonly kind: 'error'; readonly query: string; readonly message: string };

type AvailabilityState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'known'; readonly info: PlaceSearchAvailability }
  | { readonly kind: 'unreachable'; readonly message: string };

const KIND_LABELS: Readonly<Record<PlaceSearchResult['kind'], string>> = {
  coordinates: 'Coordenadas',
  'populated-place': 'Localidad',
  administrative: 'Área administrativa',
  other: 'Lugar',
};

interface PlaceSearchProps {
  readonly provider: PlaceSearchProvider;
  readonly onSelect: (result: PlaceSearchResult) => void;
}

/**
 * Buscador de lugares y coordenadas. La búsqueda se lanza solo al enviar el formulario (sin
 * autocompletado) y la atribución del proveedor se muestra siempre junto a los resultados.
 */
export function PlaceSearch({ provider, onSelect }: PlaceSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: 'checking' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    provider.availability(abort.signal).then(
      (info) => {
        setAvailability({ kind: 'known', info });
      },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        setAvailability({
          kind: 'unreachable',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [provider]);

  const run = (text: string): void => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ kind: 'searching', query: text });
    searchPlaces(text, provider, abort.signal).then(
      (results) => {
        if (!abort.signal.aborted) setState({ kind: 'results', query: text, results });
      },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        setState({
          kind: 'error',
          query: text,
          message:
            error instanceof PlaceSearchError ? error.message : 'No se pudo completar la búsqueda.',
        });
      },
    );
  };

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (query.trim().length > 0) run(query);
  };

  const info = availability.kind === 'known' ? availability.info : null;
  const nameSearchUnavailable =
    availability.kind === 'unreachable' || (info !== null && !info.available);

  return (
    <section className={styles.section} aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className={styles.sectionTitle}>
        Buscar un lugar
      </h2>
      <form className={styles.searchForm} role="search" onSubmit={submit}>
        <label htmlFor={inputId} className={styles.visuallyHidden}>
          Lugar o coordenadas
        </label>
        <input
          id={inputId}
          type="search"
          className={styles.searchInput}
          placeholder="Localidad o «-17.55, -65.86»"
          autoComplete="off"
          value={query}
          maxLength={120}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          data-testid="place-search-input"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={state.kind === 'searching' || query.trim().length === 0}
          aria-label="Buscar"
        >
          <Icon name="search" size={16} />
        </Button>
      </form>

      {nameSearchUnavailable ? (
        <p className={styles.notice} data-testid="place-search-unavailable">
          {availability.kind === 'unreachable'
            ? 'La búsqueda por nombre necesita la API, que no responde.'
            : 'La búsqueda por nombre no está disponible en el servidor (ejecuta «make geodata»).'}{' '}
          Puedes escribir coordenadas, hacer clic en el mapa o usar la región demostrativa.
        </p>
      ) : null}

      <div aria-live="polite" data-testid="place-search-status">
        {state.kind === 'searching' ? <p className={styles.muted}>Buscando…</p> : null}
        {state.kind === 'error' ? (
          <div className={styles.searchError} role="alert">
            <p>{state.message}</p>
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                run(state.query);
              }}
            >
              <Icon name="refresh" size={14} />
              Reintentar
            </Button>
          </div>
        ) : null}
        {state.kind === 'results' && state.results.length === 0 ? (
          <p className={styles.muted}>Sin resultados para «{state.query}».</p>
        ) : null}
      </div>

      {state.kind === 'results' && state.results.length > 0 ? (
        <ul className={styles.results} data-testid="place-search-results">
          {state.results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className={styles.result}
                onClick={() => {
                  onSelect(result);
                }}
              >
                <span className={styles.resultName}>{result.name}</span>
                <span className={styles.resultDetail}>
                  {KIND_LABELS[result.kind]}
                  {result.detail ? ` · ${result.detail}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {info !== null && info.available && info.attribution ? (
        <p className={styles.attribution}>
          Búsqueda:{' '}
          <a href={info.attributionUrl} target="_blank" rel="noreferrer noopener">
            {info.attribution}
          </a>
        </p>
      ) : null}
    </section>
  );
}
