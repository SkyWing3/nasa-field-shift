import type { ReactNode } from 'react';

import type { AssetCatalog, AssetEntry } from '../../assets';
import styles from '../AssetViewer.module.css';
import {
  CATEGORY_LABELS,
  formatBytes,
  formatInteger,
  formatMeters,
  GROUP_LABELS,
  KIND_LABELS,
  STATUS_CLASS,
  STATUS_LABELS,
} from '../labels';
import { FPS_WINDOW_MS } from '../scene/RenderLoop';
import { type InspectorTab, useViewerStore } from '../viewerStore';
import { Segmented, Slider, Toggle } from './Controls';

const TABS: readonly { readonly id: InspectorTab; readonly label: string }[] = [
  { id: 'info', label: 'Información' },
  { id: 'materials', label: 'Materiales' },
  { id: 'lighting', label: 'Iluminación' },
  { id: 'performance', label: 'Rendimiento' },
];

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExternalLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

// ── Información ──────────────────────────────────────────────────────────────────────────────

function InfoTab({ asset }: { readonly asset: AssetEntry }) {
  const { model, material, hdri, license, source } = asset;
  return (
    <>
      <p className={styles.description}>{asset.description}</p>
      <dl className={styles.fields}>
        <Field label="Estado">
          <span className={`${styles.badge ?? ''} ${STATUS_CLASS[asset.status] ?? ''}`}>
            {STATUS_LABELS[asset.status]}
          </span>
        </Field>
        <Field label="Tipo">
          {KIND_LABELS[asset.kind]} · {CATEGORY_LABELS[asset.category]} ·{' '}
          {GROUP_LABELS[asset.group]}
        </Field>
        {source === null ? null : (
          <Field label="Fuente">
            <ExternalLink href={source.pageUrl}>
              {source.provider} · {source.providerAssetId}
            </ExternalLink>
          </Field>
        )}
        {asset.status === 'missing' ? null : (
          <Field label="Autoría">
            {asset.authors.length > 0 ? asset.authors.join(', ') : 'No publicada por la fuente'}
          </Field>
        )}
        {license === null ? null : (
          <Field label="Licencia">
            <ExternalLink href={license.url}>{license.name}</ExternalLink>
            <span className={styles.muted}>
              {license.attributionRequired
                ? 'Atribución obligatoria'
                : 'Sin atribución obligatoria'}
              {' · verificada el '}
              {license.verifiedAt} en{' '}
              <ExternalLink href={license.verificationUrl}>la página de la fuente</ExternalLink>
            </span>
          </Field>
        )}
        {model === null ? null : (
          <>
            <Field label="Tamaño procesado">
              <span data-testid="model-size">{formatMeters(model.sizeM)}</span>
            </Field>
            <Field label="Tamaño del glTF de origen">{formatMeters(model.sourceGltfSizeM)}</Field>
            <Field label="Dimensiones publicadas">
              {model.publishedSizeM === null ? 'No publicadas' : formatMeters(model.publishedSizeM)}
              {model.publishedSizeCheck === 'differs' ? (
                <span className={styles.muted}>
                  Difieren del glTF de origen: la fuente mide su escena completa, que puede incluir
                  objetos que no exporta. Dato informativo; la escala se valida contra el glTF.
                </span>
              ) : null}
            </Field>
            <Field label="Variantes">
              {model.variants.length === 1 ? '1 objeto' : `${model.variants.length} variantes`}
            </Field>
          </>
        )}
        {material === null ? null : (
          <Field label="Tamaño real de la textura">
            {material.tileSizeM === null
              ? 'No publicado por la fuente'
              : formatMeters(material.tileSizeM)}
          </Field>
        )}
        {hdri === null ? null : (
          <>
            <Field label="Captura">
              {hdri.capturedAt === null ? 'No publicada' : hdri.capturedAt.slice(0, 10)}
              {hdri.latitude === null || hdri.longitude === null
                ? null
                : ` · ${hdri.latitude.toFixed(3)}°, ${hdri.longitude.toFixed(3)}°`}
            </Field>
            <Field label="Condiciones">
              {[hdri.timeOfDay, hdri.weather].filter(Boolean).join(' · ') || 'No publicadas'}
              {hdri.whiteBalanceK === null ? null : ` · balance de blancos ${hdri.whiteBalanceK} K`}
            </Field>
          </>
        )}
      </dl>

      {asset.files.length === 0 ? null : (
        <>
          <h3 className={styles.subheading}>Archivos</h3>
          <ul className={styles.files}>
            {asset.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span>
                  {file.format.toUpperCase()} · {formatBytes(file.bytes)}
                  {file.width === undefined ? '' : ` · ${file.width}×${String(file.height)}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {asset.validation.checks.length === 0 ? null : (
        <>
          <h3 className={styles.subheading}>Validación</h3>
          <ul className={styles.checks} data-testid="validation-checks">
            {asset.validation.checks.map((check) => (
              <li key={check.name} data-passed={check.passed}>
                <span aria-hidden="true">{check.passed ? '✓' : '✗'}</span>
                <div>
                  <strong>{check.name}</strong>
                  <span>{check.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {asset.error === null ? null : <p className={styles.errorText}>{asset.error}</p>}
    </>
  );
}

// ── Materiales ───────────────────────────────────────────────────────────────────────────────

function MaterialsTab({ asset }: { readonly asset: AssetEntry }) {
  const resolution = useViewerStore((state) => state.materialResolution);
  const setResolution = useViewerStore((state) => state.setMaterialResolution);
  const displacement = useViewerStore((state) => state.displacement);
  const setDisplacement = useViewerStore((state) => state.setDisplacement);

  if (asset.model !== null) {
    return (
      <>
        <p className={styles.muted}>
          Usa los modos de la barra superior (Albedo, Normal, Rugosidad…) para ver cada mapa por
          separado. Los mapas de datos se muestran sin corrección de color.
        </p>
        {asset.model.materials.map((material) => (
          <section key={material.name} className={styles.card}>
            <h3 className={styles.cardTitle}>{material.name || 'Sin nombre'}</h3>
            <p className={styles.muted}>
              Alfa {material.alphaMode} · {material.doubleSided ? 'doble cara' : 'una cara'}
            </p>
            <ul className={styles.files}>
              {material.textures.map((texture) => (
                <li key={texture.slot}>
                  <code>{texture.slot}</code>
                  <span>
                    {texture.width}×{texture.height} · {texture.mimeType.replace('image/', '')} ·{' '}
                    {formatBytes(texture.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    );
  }
  if (asset.material !== null) {
    return (
      <>
        <p className={styles.muted}>
          Material PBR metal-rugosidad: albedo (sRGB), normal (convención OpenGL), ORM empaquetado
          (R oclusión, G rugosidad, B metalicidad) y altura.
        </p>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Resolución de texturas</span>
          <Segmented
            label="Resolución de texturas"
            value={resolution}
            options={asset.material.resolutions.map((value) => ({ value, label: `${value} px` }))}
            onChange={setResolution}
            testId="material-resolution"
          />
        </div>
        <Toggle
          label="Relieve por desplazamiento (escala visual)"
          checked={displacement}
          onChange={setDisplacement}
        />
        <ul className={styles.files}>
          {asset.files
            .filter((file) => file.width === resolution)
            .map((file) => (
              <li key={file.path}>
                <code>{file.role}</code>
                <span>
                  {file.width}×{String(file.height)} · {formatBytes(file.bytes)}
                </span>
              </li>
            ))}
        </ul>
      </>
    );
  }
  return <p className={styles.muted}>Un HDRI no tiene materiales. Ajusta su uso en Iluminación.</p>;
}

// ── Iluminación ──────────────────────────────────────────────────────────────────────────────

function LightingTab({
  catalog,
  asset,
}: {
  readonly catalog: AssetCatalog;
  readonly asset: AssetEntry | null;
}) {
  const lighting = useViewerStore((state) => state.lighting);
  const update = useViewerStore((state) => state.updateLighting);
  const hdris = catalog.assets.filter(
    (entry) => entry.kind === 'hdri' && entry.status === 'available',
  );
  const previewingHdri = asset?.kind === 'hdri' && asset.status === 'available';

  return (
    <>
      {hdris.length === 0 ? (
        <p className={styles.muted}>
          No hay HDRI disponibles en el catálogo: se usa una luz hemisférica neutra.
        </p>
      ) : (
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="hdri-select">
            Entorno HDRI
          </label>
          <select
            id="hdri-select"
            className={styles.select}
            value={previewingHdri ? asset.id : (lighting.hdriId ?? '')}
            disabled={previewingHdri}
            onChange={(event) => {
              update({ hdriId: event.target.value });
            }}
            data-testid="hdri-select"
          >
            {hdris.map((hdri) => (
              <option key={hdri.id} value={hdri.id}>
                {hdri.name}
              </option>
            ))}
          </select>
          {previewingHdri ? (
            <p className={styles.muted}>El HDRI seleccionado en la lista ilumina la escena.</p>
          ) : null}
        </div>
      )}
      <div className={styles.controlGroup}>
        <span className={styles.controlLabel}>Resolución del HDRI</span>
        <Segmented
          label="Resolución del HDRI"
          value={lighting.hdriResolution}
          options={[
            { value: '1k' as const, label: '1K' },
            { value: '2k' as const, label: '2K' },
          ]}
          onChange={(hdriResolution) => {
            update({ hdriResolution });
          }}
        />
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.controlLabel}>Fondo</span>
        <Segmented
          label="Fondo"
          value={lighting.background}
          options={[
            { value: 'hdri' as const, label: 'HDRI' },
            { value: 'blurred' as const, label: 'Desenfocado' },
            { value: 'neutral' as const, label: 'Neutro' },
          ]}
          onChange={(background) => {
            update({ background });
          }}
        />
      </div>
      <Slider
        label="Intensidad del entorno"
        value={lighting.environmentIntensity}
        min={0}
        max={3}
        step={0.05}
        onChange={(environmentIntensity) => {
          update({ environmentIntensity });
        }}
      />
      <Slider
        label="Rotación del entorno"
        value={lighting.rotationDeg}
        min={0}
        max={360}
        step={1}
        unit="°"
        onChange={(rotationDeg) => {
          update({ rotationDeg });
        }}
      />
      <Slider
        label="Exposición"
        value={lighting.exposure}
        min={0.1}
        max={3}
        step={0.05}
        onChange={(exposure) => {
          update({ exposure });
        }}
      />
      <h3 className={styles.subheading}>Sol direccional</h3>
      <Toggle
        label="Añadir sol con sombras"
        checked={lighting.sunEnabled}
        onChange={(sunEnabled) => {
          update({ sunEnabled });
        }}
        testId="sun-toggle"
      />
      <Slider
        label="Elevación"
        value={lighting.sunElevationDeg}
        min={2}
        max={90}
        step={1}
        unit="°"
        disabled={!lighting.sunEnabled}
        onChange={(sunElevationDeg) => {
          update({ sunElevationDeg });
        }}
      />
      <Slider
        label="Azimut (desde el norte)"
        value={lighting.sunAzimuthDeg}
        min={0}
        max={360}
        step={1}
        unit="°"
        disabled={!lighting.sunEnabled}
        onChange={(sunAzimuthDeg) => {
          update({ sunAzimuthDeg });
        }}
      />
      <Slider
        label="Intensidad del sol"
        value={lighting.sunIntensity}
        min={0}
        max={10}
        step={0.1}
        disabled={!lighting.sunEnabled}
        onChange={(sunIntensity) => {
          update({ sunIntensity });
        }}
      />
    </>
  );
}

// ── Rendimiento ──────────────────────────────────────────────────────────────────────────────

function PerformanceTab({ asset }: { readonly asset: AssetEntry }) {
  const load = useViewerStore((state) => state.load);
  const stats = useViewerStore((state) => state.stats);
  const fps = useViewerStore((state) => state.fps);
  const startFps = useViewerStore((state) => state.startFps);
  const gpuBytes = asset.model?.gpuTextureBytes ?? asset.material?.gpuTextureBytes ?? null;

  return (
    <>
      <dl className={styles.fields}>
        <Field label="Descarga total">{formatBytes(asset.sizeBytes)}</Field>
        <Field label="Tiempo de carga">
          <span data-testid="load-time">
            {load.status === 'ready' ? `${formatInteger(load.loadMs)} ms` : '—'}
          </span>
        </Field>
        {gpuBytes === null ? null : (
          <Field label="Memoria de texturas (estimada)">
            {formatBytes(gpuBytes)}
            <span className={styles.muted}>RGBA8 sin comprimir con mipmaps</span>
          </Field>
        )}
      </dl>

      {asset.model === null ? null : (
        <>
          <h3 className={styles.subheading}>Niveles de detalle</h3>
          <table className={styles.table} data-testid="lod-table">
            <thead>
              <tr>
                <th scope="col">Nivel</th>
                <th scope="col">Triángulos</th>
                <th scope="col">Vértices</th>
                <th scope="col">Primitivas</th>
              </tr>
            </thead>
            <tbody>
              {asset.model.lods.map((lod) => (
                <tr
                  key={lod.level}
                  aria-current={stats?.lodLevel === lod.level ? 'true' : undefined}
                >
                  <th scope="row">LOD{lod.level}</th>
                  <td>{formatInteger(lod.triangles)}</td>
                  <td>{formatInteger(lod.vertices)}</td>
                  <td>{lod.drawCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.muted}>
            Origen: {formatInteger(asset.model.sourceTriangles)} triángulos. Resaltado: nivel que se
            está dibujando.
          </p>
        </>
      )}

      <h3 className={styles.subheading}>Último fotograma</h3>
      <dl className={styles.fields} data-testid="render-stats">
        <Field label="Llamadas de dibujo">{stats === null ? '—' : stats.drawCalls}</Field>
        <Field label="Triángulos dibujados">
          <span data-testid="rendered-triangles">
            {stats === null ? '—' : formatInteger(stats.triangles)}
          </span>
        </Field>
        <Field label="Geometrías / texturas en GPU">
          {stats === null ? '—' : `${stats.geometries} / ${stats.textures}`}
        </Field>
        <Field label="Programas de sombreado">{stats === null ? '—' : stats.programs}</Field>
      </dl>

      <h3 className={styles.subheading}>Fotogramas por segundo</h3>
      <button
        type="button"
        className={styles.toolButton}
        disabled={fps.status === 'running' || load.status !== 'ready'}
        onClick={startFps}
        data-testid="measure-fps"
      >
        {fps.status === 'running' ? 'Midiendo…' : `Medir durante ${FPS_WINDOW_MS / 1000} s`}
      </button>
      {fps.status === 'done' ? (
        <p className={styles.fpsResult} data-testid="fps-result">
          {fps.fps.toLocaleString('es-ES', { maximumFractionDigits: 1 })} FPS ·{' '}
          {fps.frameMs.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ms por fotograma (
          {fps.frames} fotogramas)
        </p>
      ) : null}
      <p className={styles.muted}>
        Render continuo durante la medición. El resultado depende de esta máquina y está limitado
        por la frecuencia de refresco de la pantalla.
      </p>
    </>
  );
}

interface InspectorProps {
  readonly catalog: AssetCatalog;
  readonly asset: AssetEntry | null;
}

export function Inspector({ catalog, asset }: InspectorProps) {
  const tab = useViewerStore((state) => state.tab);
  const setTab = useViewerStore((state) => state.setTab);

  return (
    <div className={styles.inspectorInner}>
      <h2 className={styles.inspectorTitle}>{asset?.name ?? 'Inspector'}</h2>
      <div className={styles.tabs} role="tablist" aria-label="Secciones del inspector">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="inspector-panel"
            className={styles.tab}
            onClick={() => {
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className={styles.tabPanel}
        role="tabpanel"
        id="inspector-panel"
        aria-labelledby={`tab-${tab}`}
        data-testid={`inspector-${tab}`}
      >
        {tab === 'lighting' ? (
          <LightingTab catalog={catalog} asset={asset} />
        ) : asset === null ? (
          <p className={styles.muted}>Selecciona un asset para ver sus datos.</p>
        ) : tab === 'info' ? (
          <InfoTab asset={asset} />
        ) : asset.status !== 'available' ? (
          <p className={styles.muted}>Disponible solo para assets procesados correctamente.</p>
        ) : tab === 'materials' ? (
          <MaterialsTab asset={asset} />
        ) : (
          <PerformanceTab asset={asset} />
        )}
      </div>
    </div>
  );
}
