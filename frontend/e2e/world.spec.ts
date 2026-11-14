import { expect, type Page, type Route, test } from '@playwright/test';

import { imageStats, trackPageErrors } from './support';

/**
 * Mundo 3D. Los datos geográficos de la API (/api/world/*) se sustituyen por rejillas sintéticas
 * generadas aquí: la prueba es determinista, no depende de la caché de `make worlddata` ni de la
 * red, y verifica el pipeline completo en el navegador (worker, GPU, materiales del catálogo y
 * modelos de vegetación, que sí requieren `make assets`).
 */

const CENTER = { latitude: -17.551334, longitude: -65.861983 };
const SITE = {
  schemaVersion: 1,
  site: {
    name: 'Granja de prueba',
    source: 'preset',
    presetId: 'cochabamba-valle-alto-demo',
    region: { center: CENTER, widthM: 400, lengthM: 300, orientationDeg: 0 },
    frameOrigin: CENTER,
    confirmedAt: '2026-11-14T12:00:00.000Z',
  },
};

const META = {
  id: 'prueba',
  name: 'Datos de prueba',
  provider: 'Prueba',
  attribution: 'Datos sintéticos de prueba',
  citation: 'Datos sintéticos de prueba',
  license: 'CC0',
  licenseUrl: 'https://example.org/',
  sourceUrl: 'https://example.org/',
  resolutionM: 30,
  verticalDatum: 'EGM96 (altura ortométrica)',
  acquired: '2026',
  notes: '',
};

interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function bboxOf(route: Route): BBox {
  const url = new URL(route.request().url());
  const read = (key: string): number => Number(url.searchParams.get(key));
  return { south: read('south'), west: read('west'), north: read('north'), east: read('east') };
}

/** Rejilla sintética: colina suave al norte y pendiente leve (alturas en metros). */
function elevationGrid(bbox: BBox): object {
  const step = 1 / 3600;
  const width = Math.ceil((bbox.east - bbox.west) / step);
  const height = Math.ceil((bbox.north - bbox.south) / step);
  const values = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const lat = bbox.north - (r + 0.5) * step;
      const lon = bbox.west + (c + 0.5) * step;
      const hill = 600 * Math.exp(-(((lat - CENTER.latitude - 0.06) / 0.03) ** 2));
      values[r * width + c] = 2700 + hill + (lon - CENTER.longitude) * 200;
    }
  }
  return {
    dataset: 'nasadem',
    west: bbox.west,
    north: bbox.north,
    pixelWidth: step,
    pixelHeight: step,
    width,
    height,
    encoding: 'float32le',
    data: Buffer.from(values.buffer).toString('base64'),
    stats: { min: 2690, max: 3400, voidFraction: 0 },
    level: 0,
    tiles: ['NASADEM_HGT_s18w066'],
    tilesMissing: [],
  };
}

/** Cobertura sintética: cultivo con una franja de pastizal y un bosquete. */
function landCoverGrid(bbox: BBox, maxSize: number): object {
  let step = 1 / 12000;
  while ((bbox.east - bbox.west) / step > maxSize) step *= 2;
  const width = Math.ceil((bbox.east - bbox.west) / step);
  const height = Math.ceil((bbox.north - bbox.south) / step);
  const values = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const lat = bbox.north - (r + 0.5) * step;
      const lon = bbox.west + (c + 0.5) * step;
      const dLat = lat - CENTER.latitude;
      const dLon = lon - CENTER.longitude;
      values[r * width + c] =
        Math.hypot(dLat - 0.004, dLon + 0.004) < 0.0015
          ? 10
          : Math.abs(dLat + 0.006) < 0.0015
            ? 30
            : 40;
    }
  }
  return {
    dataset: 'esa-worldcover-2021',
    west: bbox.west,
    north: bbox.north,
    pixelWidth: step,
    pixelHeight: step,
    width,
    height,
    encoding: 'uint8',
    data: Buffer.from(values).toString('base64'),
    stats: { min: null, max: null, voidFraction: 0 },
    level: 0,
    tiles: ['S18W066'],
    tilesMissing: [],
  };
}

const FEATURES = {
  origin: 'snapshot',
  snapshotId: 'prueba',
  osmTimestamp: '2026-11-14T00:00:00Z',
  fetchedAt: '2026-11-14T00:00:00+00:00',
  bbox: [-17.58, -65.89, -17.52, -65.83],
  features: [
    {
      id: 'way/1',
      kind: 'road',
      subtype: 'tertiary',
      geometryType: 'LineString',
      coordinates: [
        [-65.875, -17.5545],
        [-65.848, -17.5545],
      ],
      tags: { surface: 'asphalt', name: 'Camino de prueba' },
    },
    {
      id: 'way/2',
      kind: 'waterway',
      subtype: 'canal',
      geometryType: 'LineString',
      coordinates: [
        [-65.8645, -17.565],
        [-65.8645, -17.54],
      ],
      tags: { intermittent: 'yes' },
    },
    {
      id: 'way/3',
      kind: 'building',
      subtype: 'yes',
      geometryType: 'Polygon',
      coordinates: [
        [-65.8575, -17.547],
        [-65.8572, -17.547],
        [-65.8572, -17.5467],
        [-65.8575, -17.5467],
        [-65.8575, -17.547],
      ],
      tags: {},
    },
  ],
};

async function mockWorldApi(page: Page, options: { failElevation?: boolean } = {}): Promise<void> {
  await page.route('**/api/world/datasets', (route) =>
    route.fulfill({
      json: {
        elevation: META,
        landcover: META,
        landcoverClasses: [{ code: 40, label: 'Cultivos' }],
        features: META,
        featuresLiveEnabled: false,
        offline: false,
      },
    }),
  );
  await page.route('**/api/world/elevation?**', (route) =>
    options.failElevation
      ? route.fulfill({
          status: 503,
          json: { detail: 'Servicio de elevación no disponible (prueba)' },
        })
      : route.fulfill({ json: elevationGrid(bboxOf(route)) }),
  );
  await page.route('**/api/world/landcover?**', (route) => {
    const maxSize = Number(new URL(route.request().url()).searchParams.get('maxSize'));
    return route.fulfill({ json: landCoverGrid(bboxOf(route), maxSize) });
  });
  await page.route('**/api/world/features?**', (route) => route.fulfill({ json: FEATURES }));
}

async function openWorld(page: Page, site: object = SITE): Promise<void> {
  await page.addInitScript(
    ([stored]) => {
      localStorage.setItem('terralab.site', JSON.stringify(stored));
      // Calidad baja: el navegador de pruebas dibuja con WebGL por software.
      localStorage.setItem('terralab.worldQuality', 'low');
    },
    [site],
  );
  await page.goto('/');
  await page.getByTestId('continue-site').click();
  await expect(page.getByTestId('farm-screen')).toBeVisible();
  await page.getByTestId('generate-world').click();
  await expect(page.getByTestId('world-screen')).toBeVisible();
}

const READY = { timeout: 120_000 };

test.describe('Mundo 3D', () => {
  test.describe.configure({ timeout: 180_000 });

  test('genera el mundo de la región con sus etapas, materiales y procedencia', async ({
    page,
  }) => {
    const errors = trackPageErrors(page, [/THREE\.Clock/]);
    await mockWorldApi(page);
    await openWorld(page);
    await expect(page.getByTestId('world-progress')).toBeVisible();
    await expect(page.getByTestId('world-screen')).toHaveAttribute(
      'data-world-status',
      'ready',
      READY,
    );

    const stages = page.getByTestId('world-stages').first().locator('li');
    await expect(stages).toHaveCount(7);
    for (let k = 0; k < 7; k++) await expect(stages.nth(k)).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('prov-elevation')).toContainText('Dato real');
    await expect(page.getByTestId('prov-features')).toContainText('3 elementos');
    await expect(page.getByTestId('world-attribution')).toContainText('NASADEM');
    await expect(page.getByTestId('world-attribution')).toContainText('OpenStreetMap');

    const stats = await imageStats(page, page.getByTestId('world-viewport'));
    expect(stats.variance).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test('explora: vistas de cámara, selección del terreno y capas', async ({ page }) => {
    const errors = trackPageErrors(page, [/THREE\.Clock/]);
    await mockWorldApi(page);
    await openWorld(page);
    await expect(page.getByTestId('world-screen')).toHaveAttribute(
      'data-world-status',
      'ready',
      READY,
    );
    const viewport = page.getByTestId('world-viewport');

    const farmView = await viewport.screenshot();
    await page.getByTestId('view-aerial').click();
    await page.waitForTimeout(2500);
    expect(Buffer.compare(farmView, await viewport.screenshot())).not.toBe(0);

    // Clic en el centro: punto del terreno con coordenadas próximas al centro de la región.
    await page.getByTestId('view-farm').click();
    await page.waitForTimeout(2500);
    const box = await viewport.boundingBox();
    if (box === null) throw new Error('Sin lienzo');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const selection = page.getByTestId('terrain-selection');
    await expect(selection).toBeVisible();
    const coords = await page.getByTestId('selection-coords').innerText();
    // Formato español: «−17,55133°, −65,86198°» (signo menos tipográfico y coma decimal).
    const [lat, lon] = (coords.match(/[−-]?\d+,\d+/g) ?? []).map((part) =>
      Number(part.replace('−', '-').replace(',', '.')),
    );
    expect(Math.abs((lat ?? 0) - CENTER.latitude)).toBeLessThan(0.01);
    expect(Math.abs((lon ?? 0) - CENTER.longitude)).toBeLessThan(0.01);
    await expect(page.getByTestId('selection-elevation')).toContainText(' m');

    // Capa de datos OSM: cambia la imagen al activarla.
    const before = await viewport.screenshot();
    await page.getByTestId('toggle-osm').click();
    await expect(page.getByTestId('toggle-osm')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);
    expect(Buffer.compare(before, await viewport.screenshot())).not.toBe(0);
    expect(errors).toEqual([]);
  });

  test('sin datos reales ofrece un terreno procedural etiquetado como demostrativo', async ({
    page,
  }) => {
    await mockWorldApi(page, { failElevation: true });
    await openWorld(page);
    const error = page.getByTestId('world-error');
    await expect(error).toBeVisible(READY);
    await expect(error).toContainText('Elevación (NASADEM)');
    await page.getByTestId('use-procedural').click();
    await expect(page.getByTestId('world-screen')).toHaveAttribute(
      'data-world-status',
      'ready',
      READY,
    );
    await expect(page.getByTestId('procedural-warning')).toBeVisible();
    await expect(page.getByTestId('prov-elevation')).toContainText('Procedural');
    await expect(page.getByTestId('prov-elevation')).toContainText('no es la topografía real');
  });

  test('rechaza regiones demasiado grandes para generar en 3D', async ({ page }) => {
    await mockWorldApi(page);
    const big = {
      ...SITE,
      site: {
        ...SITE.site,
        region: { ...SITE.site.region, widthM: 3000, lengthM: 3000, orientationDeg: 45 },
      },
    };
    await openWorld(page, big);
    await expect(page.getByTestId('world-error')).toContainText('demasiado grande', READY);
  });
});
