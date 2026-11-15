import { useConnectionStore } from '../../state';
import styles from './ApiStatusBadge.module.css';
import { Icon } from './Icon';

interface ApiStatusBadgeProps {
  readonly onRetry: () => void;
}

export function ApiStatusBadge({ onRetry }: ApiStatusBadgeProps) {
  const api = useConnectionStore((s) => s.api);
  const isChecking = useConnectionStore((s) => s.isChecking);

  let label: string;
  let detail: string | null = null;
  let variant: string | undefined;
  let title: string | undefined;
  if (api.status === 'online') {
    label = 'API conectada';
    detail = ` · v${api.version}`;
    variant = styles.online;
    title = `Entorno: ${api.environment}`;
  } else if (api.status === 'offline') {
    label = 'API sin conexión';
    variant = styles.offline;
    title = api.message;
  } else {
    label = 'Comprobando API…';
    variant = styles.checking;
  }
  if (isChecking && api.status === 'unknown') variant = styles.checking;

  return (
    <span
      className={[styles.badge, variant].filter(Boolean).join(' ')}
      title={title}
      data-testid="api-status"
      data-api-status={api.status}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span role="status">
        {label}
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </span>
      {api.status === 'offline' ? (
        <button
          type="button"
          className={styles.retry}
          onClick={onRetry}
          disabled={isChecking}
          aria-label="Reintentar conexión con la API"
        >
          <Icon name="refresh" size={14} />
        </button>
      ) : null}
    </span>
  );
}
