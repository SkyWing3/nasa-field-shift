import type { ReactNode } from 'react';

import { Button } from './Button';
import styles from './Feedback.module.css';
import { Icon } from './Icon';

interface ErrorStateProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Detalle técnico opcional (mensaje de la excepción). */
  readonly detail?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function ErrorState({
  title,
  children,
  detail,
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.errorTitle}>
        <Icon name="alert" size={20} />
        {title}
      </p>
      <p className={styles.errorBody}>{children}</p>
      {detail ? <code className={styles.errorDetail}>{detail}</code> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
