/** Genera la sección del catálogo en `docs/ASSETS.md` a partir de `catalog.json`. */
import type {
  AssetCatalog,
  AssetCategory,
  AssetEntry,
  AssetStatus,
} from '../../src/assets/catalogSchema.ts';
import { formatBytes } from './files.ts';

export const CATALOG_START = '<!-- asset-catalog:start -->';
export const CATALOG_END = '<!-- asset-catalog:end -->';

const CATEGORY_LABELS: Readonly<Record<AssetCategory, string>> = {
  terrain: 'Terreno',
  vegetation: 'Vegetación',
  crop: 'Cultivos',
  environment: 'Entorno',
  lighting: 'Iluminación',
};

const STATUS_LABELS: Readonly<Record<AssetStatus, string>> = {
  available: '✅ Disponible',
  missing: '⛔ Faltante',
  error: '⚠️ Error',
};

/** Escapa el contenido de una celda de tabla Markdown. */
export function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatOf(entry: AssetEntry): string {
  return [...new Set(entry.files.map((file) => file.format.toUpperCase()))].join(', ') || '—';
}

function locationOf(entry: AssetEntry): string {
  const first = entry.files[0];
  if (first === undefined) return '—';
  const folder = first.path.split('/').slice(0, -1).join('/');
  return `\`asset-library/${folder}/\``;
}

export function renderCatalogMarkdown(catalog: AssetCatalog): string {
  const available = catalog.assets.filter((asset) => asset.status === 'available');
  const missing = catalog.assets.filter((asset) => asset.status === 'missing');
  const failed = catalog.assets.filter((asset) => asset.status === 'error');
  const totalBytes = available.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  const lines: string[] = [
    `> Generado automáticamente por \`asset-pipeline\` ${catalog.pipelineVersion} el ${catalog.generatedAt.slice(0, 10)}. No editar a mano: ejecuta \`make assets\`.`,
    '',
    `**Resumen:** ${available.length} disponibles · ${missing.length} faltantes · ${failed.length} con errores · ${formatBytes(totalBytes)} procesados.`,
    '',
    '| ID | Nombre | Categoría | Autor(es) | Fuente | Licencia | Formato | Tamaño | Estado | Ubicación local |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const asset of [...available, ...failed]) {
    const source =
      asset.source === null
        ? '—'
        : `[${asset.source.provider} · ${asset.source.providerAssetId}](${asset.source.pageUrl})`;
    lines.push(
      `| \`${asset.id}\` | ${cell(asset.name)} | ${CATEGORY_LABELS[asset.category]} | ${cell(asset.authors.join(', ') || 'No publicado por la fuente')} | ${source} | ${asset.license === null ? '—' : `[${asset.license.id}](${asset.license.url})`} | ${formatOf(asset)} | ${formatBytes(asset.sizeBytes)} | ${STATUS_LABELS[asset.status]}${asset.error === null ? '' : `: ${cell(asset.error)}`} | ${locationOf(asset)} |`,
    );
  }
  if (missing.length > 0) {
    lines.push(
      '',
      '### Recursos faltantes y alternativas gratuitas',
      '',
      '| ID | Recurso | Motivo | Alternativas |',
      '|---|---|---|---|',
    );
    for (const asset of missing) {
      const alternatives = (asset.missing?.alternatives ?? [])
        .map(
          (alternative) =>
            `[${cell(alternative.title)}](${alternative.url}) — ${cell(alternative.license)}; requiere: ${cell(alternative.requires)}`,
        )
        .join('<br>');
      lines.push(
        `| \`${asset.id}\` | ${cell(asset.name)} | ${cell(asset.missing?.reason ?? '')} | ${alternatives} |`,
      );
    }
  }
  return lines.join('\n');
}

export function replaceBetweenMarkers(document: string, content: string): string {
  const start = document.indexOf(CATALOG_START);
  const end = document.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No se encontraron los marcadores ${CATALOG_START} / ${CATALOG_END}`);
  }
  return `${document.slice(0, start + CATALOG_START.length)}\n${content}\n${document.slice(end)}`;
}
