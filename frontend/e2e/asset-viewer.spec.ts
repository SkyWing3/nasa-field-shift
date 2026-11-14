import { expect, type Page, test } from '@playwright/test';

import type { AssetCatalog, AssetEntry } from '../src/assets';
import { imageStats, trackPageErrors } from './support';

/**
 * Visualizador de assets. Necesita la biblioteca generada con `make assets` (no versionada);
 * sin ella estas pruebas fallan indicándolo.
 */

const VIEWER = '/asset-viewer.html';
const LOAD_TIMEOUT = 60_000;

async function loadCatalog(page: Page): Promise<AssetCatalog> {
  const response = await page.request.get('/asset-library/catalog.json');
  expect(response.status(), 'Falta asset-library/catalog.json: ejecuta "make assets"').toBe(200);
  return (await response.json()) as AssetCatalog;
}

async function selectAsset(page: Page, asset: AssetEntry): Promise<void> {
  await page.locator(`[data-testid=asset-item][data-asset-id="${asset.id}"]`).click();
  const stage = page.getByTestId('viewer-stage');
  await expect(stage).toHaveAttribute('data-asset-id', asset.id);
  if (asset.status === 'available') {
    await expect(stage).toHaveAttribute('data-load-state', 'ready', { timeout: LOAD_TIMEOUT });
  }
}

/** Triángulos del último fotograma (pestaña Rendimiento). */
async function renderedTriangles(page: Page): Promise<number> {
  const text = (await page.getByTestId('rendered-triangles').textContent()) ?? '';
  return Number(text.replace(/\D/g, ''));
}

/** Espera a que las estadísticas del fotograma reflejen un valor (el render es bajo demanda). */
async function expectTriangles(page: Page, predicate: (value: number) => boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        const value = await renderedTriangles(page);
        return predicate(value) ? 'ok' : `valor no esperado: ${value}`;
      },
      { timeout: 10_000 },
    )
    .toBe('ok');
}

test.describe('Visualizador de assets', () => {
  test('muestra el catálogo completo con su estado', async ({ page }) => {
    const errors = trackPageErrors(page);
    const catalog = await loadCatalog(page);
    await page.goto(VIEWER);

    const available = catalog.assets.filter((asset) => asset.status === 'available').length;
    const missing = catalog.assets.filter((asset) => asset.status === 'missing').length;
    const summary = page.getByTestId('catalog-summary');
    await expect(summary).toContainText(`${available} disponibles`);
    await expect(summary).toContainText(`${missing} faltantes`);
    await expect(page.getByTestId('asset-item')).toHaveCount(catalog.assets.length);
    await expect(page.getByText('Ningún asset seleccionado')).toBeVisible();

    await page.getByRole('searchbox', { name: 'Buscar assets' }).fill('maíz');
    await expect(page.getByTestId('asset-item')).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('01-catalogo.png') });
    expect(errors).toEqual([]);
  });

  test('carga en Three.js cada asset disponible y lo dibuja', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    const errors = trackPageErrors(page);
    const catalog = await loadCatalog(page);
    await page.goto(VIEWER);
    await page.getByRole('tab', { name: 'Rendimiento' }).click();
    const canvas = page.getByTestId('viewer-stage').locator('canvas');

    for (const asset of catalog.assets.filter((entry) => entry.status === 'available')) {
      await test.step(asset.id, async () => {
        await selectAsset(page, asset);
        await expect(page.getByTestId('load-time')).toHaveText(/\d+ ms/);
        if (asset.model !== null) {
          // Al encuadrar, la cámara queda a menos distancia que el primer cambio de nivel.
          const lod0 = asset.model.lods[0]?.triangles ?? 0;
          await expectTriangles(page, (value) => value >= lod0);
          await expect(
            page.getByTestId('lod-table').locator('tr[aria-current="true"]'),
          ).toContainText('LOD0');
        } else {
          await expectTriangles(page, (value) => value > 0);
        }
        const stats = await imageStats(page, canvas);
        expect(stats.variance, `${asset.id}: el lienzo no debe ser uniforme`).toBeGreaterThan(20);
      });
    }
    expect(errors).toEqual([]);
  });

  test('muestra los recursos faltantes sin sustitutos', async ({ page }) => {
    const errors = trackPageErrors(page);
    const catalog = await loadCatalog(page);
    await page.goto(VIEWER);

    for (const asset of catalog.assets.filter((entry) => entry.status === 'missing')) {
      await selectAsset(page, asset);
      const panel = page.getByTestId('missing-asset');
      await expect(panel).toContainText(`Recurso faltante: ${asset.name}`);
      await expect(panel).toContainText('No se muestra ningún sustituto');
      const links = panel.getByRole('link');
      await expect(links).toHaveCount(asset.missing?.alternatives.length ?? 0);
      for (const href of await links.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href') ?? ''),
      )) {
        expect(href).toMatch(/^https:\/\//);
      }
      await expect(page.getByTestId('viewer-stage')).toHaveAttribute('data-load-state', 'idle');
    }
    await page.screenshot({ path: test.info().outputPath('02-recurso-faltante.png') });
    expect(errors).toEqual([]);
  });

  test('permite inspeccionar niveles de detalle, materiales e iluminación', async ({ page }) => {
    const errors = trackPageErrors(page);
    const catalog = await loadCatalog(page);
    const boulder = catalog.assets.find((asset) => asset.id === 'boulder_01');
    test.skip(boulder?.status !== 'available', 'boulder_01 no está disponible en este catálogo');
    if (boulder?.model == null) return;
    const [lod0, lod1, lod2] = boulder.model.lods.map((lod) => lod.triangles);

    await page.goto(`${VIEWER}#boulder_01`);
    await expect(page.getByTestId('viewer-stage')).toHaveAttribute('data-load-state', 'ready', {
      timeout: LOAD_TIMEOUT,
    });
    await page.getByRole('tab', { name: 'Rendimiento' }).click();
    const canvas = page.getByTestId('viewer-stage').locator('canvas');

    // Nivel fijo: se dibujan exactamente sus triángulos (más el fondo y la cuadrícula).
    await page.getByTestId('lod-mode').getByRole('button', { name: 'LOD2' }).click();
    await expectTriangles(page, (value) => value >= (lod2 ?? 0) && value < (lod1 ?? 0));
    await page.getByTestId('lod-mode').getByRole('button', { name: 'LOD0' }).click();
    await expectTriangles(page, (value) => value >= (lod0 ?? 0));

    // Modos de inspección: el mapa normal tangente es azulado; la vista PBR no.
    const pbr = await imageStats(page, canvas);
    await page.getByTestId('view-mode').getByRole('button', { name: 'Normal' }).click();
    await expect
      .poll(async () => {
        const { mean } = await imageStats(page, canvas);
        return mean[2] - mean[0] - (pbr.mean[2] - pbr.mean[0]);
      })
      .toBeGreaterThan(5);
    await page.getByTestId('view-mode').getByRole('button', { name: 'Malla' }).click();
    await page.getByTestId('view-mode').getByRole('button', { name: 'PBR' }).click();

    // Iluminación: otro HDRI y un sol con sombras cambian la imagen.
    await page.getByRole('tab', { name: 'Iluminación' }).click();
    const before = await imageStats(page, canvas);
    await page.getByTestId('hdri-select').selectOption('belfast_sunset_puresky');
    await page.getByTestId('sun-toggle').click();
    await expect
      .poll(async () => {
        const { mean } = await imageStats(page, canvas);
        return Math.abs(mean[0] - before.mean[0]) + Math.abs(mean[2] - before.mean[2]);
      })
      .toBeGreaterThan(5);

    // Rendimiento: la medición de FPS termina con un resultado.
    await page.getByRole('tab', { name: 'Rendimiento' }).click();
    await page.getByTestId('measure-fps').click();
    await expect(page.getByTestId('fps-result')).toContainText('FPS', { timeout: 10_000 });
    await page.screenshot({ path: test.info().outputPath('03-inspeccion.png') });
    expect(errors).toEqual([]);
  });

  test('explica cómo generar el catálogo si no existe o no es válido', async ({ page }) => {
    await page.route('**/asset-library/catalog.json', (route) => route.fulfill({ status: 404 }));
    await page.goto(VIEWER);
    await expect(page.getByText('Catálogo no generado')).toBeVisible();
    await expect(page.getByText('make assets')).toBeVisible();

    await page.unroute('**/asset-library/catalog.json');
    await page.route('**/asset-library/catalog.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":99}' }),
    );
    await page.reload();
    await expect(page.getByText('Catálogo no válido')).toBeVisible();
    await expect(page.getByText(/versión de esquema 99/)).toBeVisible();
  });
});
