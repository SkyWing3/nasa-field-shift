import type { AssetEntry } from '../../assets';
import { Icon } from '../../ui';
import styles from '../AssetViewer.module.css';

interface MissingAssetPanelProps {
  readonly asset: AssetEntry;
}

/** Recurso sin fuente compatible: se explica el motivo y no se muestra ningún sustituto. */
export function MissingAssetPanel({ asset }: MissingAssetPanelProps) {
  const missing = asset.missing;
  return (
    <div className={styles.missingPanel} data-testid="missing-asset">
      <p className={styles.missingTitle}>
        <Icon name="alert" size={18} />
        Recurso faltante: {asset.name}
      </p>
      <p className={styles.missingNote}>
        No hay un modelo gratuito con licencia compatible que pueda descargarse sin intervención. No
        se muestra ningún sustituto.
      </p>
      {missing === null ? null : (
        <>
          <p className={styles.missingReason}>{missing.reason}</p>
          <h3 className={styles.subheading}>Alternativas gratuitas</h3>
          <ul className={styles.alternatives}>
            {missing.alternatives.map((alternative) => (
              <li key={alternative.url}>
                <a href={alternative.url} target="_blank" rel="noreferrer noopener">
                  {alternative.title}
                </a>
                <span>
                  {alternative.provider} · {alternative.license}
                </span>
                <span>Requiere: {alternative.requires}</span>
                <span>{alternative.notes}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
