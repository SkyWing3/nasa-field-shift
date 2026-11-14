import { useMemo, useState } from 'react';

import type { AssetCatalog, AssetCategory, AssetEntry } from '../../assets';
import styles from '../AssetViewer.module.css';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatBytes,
  GROUP_LABELS,
  KIND_LABELS,
  STATUS_CLASS,
  STATUS_LABELS,
} from '../labels';

interface AssetListProps {
  readonly catalog: AssetCatalog;
  readonly selectedId: string | null;
  readonly onSelect: (asset: AssetEntry) => void;
}

function matches(asset: AssetEntry, query: string): boolean {
  if (query.length === 0) return true;
  const haystack = `${asset.name} ${asset.id} ${GROUP_LABELS[asset.group]}`.toLocaleLowerCase('es');
  return haystack.includes(query.toLocaleLowerCase('es'));
}

export function AssetList({ catalog, selectedId, onSelect }: AssetListProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AssetCategory | 'all'>('all');

  const sections = useMemo(
    () =>
      CATEGORY_ORDER.filter((id) => category === 'all' || id === category)
        .map((id) => ({
          id,
          assets: catalog.assets.filter(
            (asset) => asset.category === id && matches(asset, query.trim()),
          ),
        }))
        .filter((section) => section.assets.length > 0),
    [catalog, category, query],
  );

  return (
    <nav className={styles.list} aria-label="Catálogo de assets">
      <input
        type="search"
        className={styles.search}
        placeholder="Buscar por nombre o tipo…"
        aria-label="Buscar assets"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <div className={styles.chips} role="group" aria-label="Filtrar por categoría">
        {(['all', ...CATEGORY_ORDER] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={styles.chip}
            aria-pressed={category === id}
            onClick={() => {
              setCategory(id);
            }}
          >
            {id === 'all' ? 'Todas' : CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>
      {sections.length === 0 ? (
        <p className={styles.listEmpty}>Ningún asset coincide con la búsqueda.</p>
      ) : (
        sections.map((section) => (
          <section key={section.id} className={styles.listSection}>
            <h2 className={styles.listHeading}>
              {CATEGORY_LABELS[section.id]}
              <span>{section.assets.length}</span>
            </h2>
            <ul className={styles.items}>
              {section.assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={asset.id === selectedId ? 'true' : undefined}
                    data-testid="asset-item"
                    data-asset-id={asset.id}
                    data-status={asset.status}
                    onClick={() => {
                      onSelect(asset);
                    }}
                  >
                    <span className={styles.itemName}>{asset.name}</span>
                    <span className={styles.itemMeta}>
                      {GROUP_LABELS[asset.group]} ·{' '}
                      {asset.status === 'available'
                        ? `${KIND_LABELS[asset.kind]} · ${formatBytes(asset.sizeBytes)}`
                        : STATUS_LABELS[asset.status]}
                    </span>
                    <span
                      className={`${styles.statusDot ?? ''} ${STATUS_CLASS[asset.status] ?? ''}`}
                      title={STATUS_LABELS[asset.status]}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </nav>
  );
}
