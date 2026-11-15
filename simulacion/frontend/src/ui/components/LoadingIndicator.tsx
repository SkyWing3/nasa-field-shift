import styles from './Feedback.module.css';

interface LoadingIndicatorProps {
  readonly label: string;
  /** Progreso 0–100. Si se omite, la barra es indeterminada. */
  readonly progress?: number;
  /** Detalle secundario, p. ej. "3 de 12 recursos". */
  readonly detail?: string;
  /** Aviso no bloqueante, p. ej. recursos que fallaron. */
  readonly warning?: string;
}

export function LoadingIndicator({ label, progress, detail, warning }: LoadingIndicatorProps) {
  const determinate = progress !== undefined;
  const clamped = determinate ? Math.min(100, Math.max(0, progress)) : 0;
  return (
    <div
      className={styles.loading}
      role="status"
      aria-live="polite"
      data-testid="loading-indicator"
    >
      <div className={styles.loadingRow}>
        <span className={styles.loadingLabel}>{label}</span>
        {determinate ? <span className={styles.loadingValue}>{Math.round(clamped)}%</span> : null}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(clamped) : undefined}
      >
        <div
          className={determinate ? styles.bar : `${styles.bar ?? ''} ${styles.indeterminate ?? ''}`}
          style={determinate ? { width: `${clamped}%` } : undefined}
        />
      </div>
      {detail ? <span className={styles.loadingValue}>{detail}</span> : null}
      {warning ? <span className={styles.loadingNote}>{warning}</span> : null}
    </div>
  );
}
