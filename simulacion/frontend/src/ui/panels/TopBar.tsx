import { useSimulationStore } from '../../state';
import { ApiStatusBadge } from '../components/ApiStatusBadge';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { formatQuantity, formatSimulationDate, PROVENANCE_LABELS } from '../format';
import styles from './TopBar.module.css';

interface TopBarProps {
  readonly onRetryApi: () => void;
  readonly onGoHome: () => void;
}

interface MetricProps {
  readonly label: string;
  readonly value: string | null;
  readonly className?: string | undefined;
}

const EMPTY_VALUE = '—';

function Metric({ label, value, className }: MetricProps) {
  const classes = [styles.metric, value === null ? styles.metricEmpty : undefined, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <dt>{label}</dt>
      <dd>{value ?? EMPTY_VALUE}</dd>
    </div>
  );
}

export function TopBar({ onRetryApi, onGoHome }: TopBarProps) {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const weather = snapshot?.weather ?? null;

  let notice: { text: string; synthetic: boolean };
  if (!snapshot) {
    notice = { text: 'Sin simulación activa', synthetic: false };
  } else if (!weather) {
    notice = { text: 'Sin datos meteorológicos para esta fecha', synthetic: false };
  } else {
    notice = {
      text: `Fuente: ${PROVENANCE_LABELS[weather.provenance.kind]}`,
      synthetic: weather.provenance.kind === 'synthetic',
    };
  }

  return (
    <header className={styles.topbar} data-testid="top-bar">
      <div className={styles.brand}>
        <BrandMark />
        <span>
          TerraLab 3D <span className={styles.brandSub}>· Laboratorio</span>
        </span>
      </div>

      <div className={styles.conditions}>
        <dl className={styles.metrics} aria-label="Fecha y condiciones ambientales simuladas">
          <Metric
            label="Fecha simulada"
            value={snapshot ? formatSimulationDate(snapshot.currentDate) : null}
            className={styles.dateMetric}
          />
          <Metric
            label="Temp. media"
            value={weather ? formatQuantity(weather.airTemperatureMean, 'degC') : null}
          />
          <Metric
            label="Precipitación"
            value={weather ? formatQuantity(weather.precipitation, 'mm/d') : null}
          />
          <Metric
            label="Radiación solar"
            value={weather ? formatQuantity(weather.shortwaveRadiation, 'MJ/m2/d') : null}
            className={styles.secondaryMetric}
          />
          <Metric
            label="Humedad rel."
            value={weather ? formatQuantity(weather.relativeHumidity, '%', 0) : null}
            className={styles.secondaryMetric}
          />
        </dl>
        <span
          className={[styles.notice, notice.synthetic ? styles.synthetic : undefined]
            .filter(Boolean)
            .join(' ')}
          data-testid="simulation-notice"
        >
          {notice.text}
        </span>
      </div>

      <div className={styles.actions}>
        <ApiStatusBadge onRetry={onRetryApi} />
        <Button variant="ghost" size="small" onClick={onGoHome} aria-label="Volver al inicio">
          <Icon name="home" size={15} />
          <span className={styles.homeLabel}>Inicio</span>
        </Button>
      </div>
    </header>
  );
}
