import { useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react';

import { formatArea, formatDegrees, formatLength } from '../../geo';
import { regionMetrics } from '../../geo/metrics.ts';
import type { SiteDraft } from '../../state';
import { Button } from '../components/Button';
import styles from './Location.module.css';

interface ConfirmSiteDialogProps {
  readonly draft: SiteDraft;
  readonly disclaimer: string | null;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: (name: string) => void;
}

/** Diálogo modal nativo (`<dialog>`): gestiona el foco y la tecla Escape. */
export function ConfirmSiteDialog({
  draft,
  disclaimer,
  error,
  onCancel,
  onConfirm,
}: ConfirmSiteDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameId = useId();
  const [name, setName] = useState(draft.name);
  const metrics = useMemo(() => regionMetrics(draft.region), [draft.region]);
  const [width, length] = metrics.sideLengthsM;

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => {
      element?.close();
    };
  }, []);

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length > 0) onConfirm(trimmed);
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`${nameId}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      data-testid="confirm-site-dialog"
    >
      <form onSubmit={submit}>
        <h2 id={`${nameId}-title`} className={styles.dialogTitle}>
          Confirmar la zona de trabajo
        </h2>
        <label htmlFor={nameId} className={styles.dialogLabel}>
          Nombre de la granja
        </label>
        <input
          id={nameId}
          className={styles.searchInput}
          value={name}
          maxLength={80}
          required
          onChange={(event) => {
            setName(event.target.value);
          }}
          data-testid="site-name-input"
        />
        <dl className={styles.dialogSummary}>
          <div>
            <dt>Centro</dt>
            <dd>
              {formatDegrees(draft.region.center.latitude)},{' '}
              {formatDegrees(draft.region.center.longitude)}
            </dd>
          </div>
          <div>
            <dt>Superficie</dt>
            <dd>{formatArea(metrics.areaM2)}</dd>
          </div>
          <div>
            <dt>Dimensiones</dt>
            <dd>
              {formatLength(width ?? 0)} × {formatLength(length ?? 0)}
            </dd>
          </div>
        </dl>
        <p className={styles.subtle}>
          El centro será el origen fijo del sistema de coordenadas local de la granja (este, norte,
          arriba, en metros). Podrás volver al mapa para cambiar la selección.
        </p>
        {disclaimer === null ? null : <p className={styles.disclaimer}>{disclaimer}</p>}
        {error === null ? null : (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onCancel}>
            Volver al mapa
          </Button>
          <Button type="submit" variant="primary" data-testid="confirm-site-submit">
            Confirmar y preparar la granja
          </Button>
        </div>
      </form>
    </dialog>
  );
}
