import { expect, type Page, test } from '@playwright/test';

import { pixelAt, trackPageErrors } from './support';

/**
 * Selector geográfico. Los proveedores externos (OpenFreeMap, EOX) y la búsqueda se sustituyen
 * por respuestas locales: las pruebas son deterministas y no cargan servidores comunitarios.
 */

const TEST_STYLE = {
  version: 8,
  sources: {
    base: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: 'Mapa base de prueba',
    },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#dfe6d8' } },
    // Capa vacía que usa la fuente: MapLibre solo atribuye las fuentes en uso.
    { id: 'base', type: 'fill', source: 'base', paint: { 'fill-opacity': 0 } },
  ],
};
/** PNG de 1 × 1 px para las teselas de satélite. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const GEOCODING_INFO = {
  provider: 'geonames',
  attribution: 'GeoNames (CC BY 4.0)',
  attributionUrl: 'https://www.geonames.org/',
  available: true,
};
const PUNATA_RESULTS = {
  ...GEOCODING_INFO,
  query: 'Punata',
  results: [
    {
      id: 'geonames:3907080',
      name: 'Punata',
      region: 'Cochabamba',
      countryCode: 'BO',
      latitude: -17.54234,
      longitude: -65.83472,
      kind: 'populated-place',
      population: 15194,
    },
  ],
};

async function mockProviders(page: Page, options: { failBasemap?: boolean } = {}): Promise<void> {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    options.failBasemap ? route.abort('connectionrefused') : route.fulfill({ json: TEST_STYLE }),
  );
  await page.route('https://tiles.maps.eox.at/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL_PNG }),
  );
  await page.route('**/api/geocoding/info', (route) => route.fulfill({ json: GEOCODING_INFO }));
  await page.route('**/api/geocoding/search**', (route) => route.fulfill({ json: PUNATA_RESULTS }));
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/terralab.html');
  await page.getByRole('button', { name: 'Elegir la ubicación de la granja' }).click();
  await expect(page.getByTestId('location-screen')).toBeVisible();
}

async function expectMapReady(page: Page): Promise<void> {
  await expect(page.getByTestId('map-viewport')).toHaveAttribute('data-map-state', 'ready', {
    timeout: 20_000,
  });
}

/** Lee «-17,551334°, -65,861983°» como números. */
function parseCenter(text: string | null): [number, number] {
  const match = /(-?\d+,\d+)°, (-?\d+,\d+)°/.exec(text ?? '');
  if (match === null) throw new Error(`Centro no reconocido: ${String(text)}`);
  return [Number(match[1]?.replace(',', '.')), Number(match[2]?.replace(',', '.'))];
}

async function mapCenter(page: Page): Promise<[number, number]> {
  const canvas = page.getByTestId('map-canvas');
  return [
    Number(await canvas.getAttribute('data-center-lat')),
    Number(await canvas.getAttribute('data-center-lng')),
  ];
}

test.describe('Selector geográfico', () => {
  test('navega por el mapa: acerca, aleja y desplaza', async ({ page }) => {
    const errors = trackPageErrors(page);
    await mockProviders(page);
    await openMap(page);
    await expectMapReady(page);
    const canvas = page.getByTestId('map-canvas');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Mapa base de prueba');

    const zoomBefore = Number(await canvas.getAttribute('data-zoom'));
    await page.locator('.maplibregl-ctrl-zoom-in').click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-zoom')))
      .toBeGreaterThan(zoomBefore + 0.9);
    await page.locator('.maplibregl-ctrl-zoom-out').click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-zoom')))
      .toBeLessThan(zoomBefore + 0.1);

    const [latBefore, lngBefore] = await mapCenter(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('Mapa no visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 + 120, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await mapCenter(page))[1]).toBeGreaterThan(lngBefore + 1);
    expect((await mapCenter(page))[0]).toBeGreaterThan(latBefore);
    expect(errors).toEqual([]);
  });

  test('aplica la región demostrativa y calcula sus medidas geodésicas', async ({ page }) => {
    const errors = trackPageErrors(page);
    await mockProviders(page);
    await openMap(page);
    await expectMapReady(page);
    await page.getByTestId('region-preset').getByRole('button', { name: 'Usar' }).click();

    await expect(page.getByTestId('draft-source')).toContainText('Región demostrativa');
    await expect(page.getByText(/No corresponde a ninguna propiedad/).first()).toBeVisible();
    await expect(page.getByTestId('region-center')).toContainText('-17,551334°, -65,861983°');
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');
    await expect(page.getByTestId('region-dimensions')).toContainText('400,0 m × 300,0 m');
    await expect(page.getByTestId('region-orientation')).toContainText('0,0° (N)');
    const corners = page.getByTestId('region-corners');
    await expect(corners.locator('tbody tr')).toHaveCount(4);
    await expect(corners).toContainText('-17,552689°');

    // La región se dibuja: dentro del rectángulo el color difiere del fondo del mapa.
    const canvas = page.getByTestId('map-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('Mapa no visible');
    await expect
      .poll(async () => {
        const inside = await pixelAt(page, canvas, box.width / 2 + 70, box.height / 2 + 40);
        const outside = await pixelAt(page, canvas, box.width - 20, box.height / 2);
        return outside[2] - inside[2];
      })
      .toBeGreaterThan(8);
    await page.screenshot({ path: test.info().outputPath('01-region-demostrativa.png') });
    expect(errors).toEqual([]);
  });

  test('selecciona coordenadas con un clic y delimita la región', async ({ page }) => {
    const errors = trackPageErrors(page);
    await mockProviders(page);
    await openMap(page);
    await expectMapReady(page);
    // Se acerca primero a la región demostrativa para que un píxel sean pocos metros.
    await page.getByTestId('region-preset').getByRole('button', { name: 'Usar' }).click();
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');
    const canvas = page.getByTestId('map-canvas');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-zoom')), { timeout: 15_000 })
      .toBeGreaterThan(14);

    const box = await canvas.boundingBox();
    if (box === null) throw new Error('Mapa no visible');
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.getByTestId('draft-source')).toContainText('Elegido en el mapa');
    const [lat, lng] = parseCenter(await page.getByTestId('region-center').textContent());
    const [mapLat, mapLng] = await mapCenter(page);
    expect(Math.abs(lat - mapLat)).toBeLessThan(1e-4);
    expect(Math.abs(lng - mapLng)).toBeLessThan(1e-4);

    // Delimitación por campos: el tamaño se conserva al mover el centro y se puede editar.
    await page.getByTestId('region-width').fill('500');
    await page.getByTestId('region-length').fill('240');
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');
    await expect(page.getByTestId('region-dimensions')).toContainText('500,0 m × 240,0 m');
    await page.getByTestId('region-orientation-input').fill('30');
    await expect(page.getByTestId('region-orientation')).toContainText('30,0°');
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');

    await page.getByTestId('region-width').fill('20');
    await expect(page.getByTestId('region-problems')).toContainText('al menos 50 m');
    await expect(page.getByTestId('confirm-location')).toBeDisabled();
    await page.getByTestId('region-width').fill('500');
    await expect(page.getByTestId('confirm-location')).toBeEnabled();

    // Delimitación dibujando un rectángulo sobre el mapa.
    await page.getByTestId('draw-toggle').click();
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 100, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('draft-source')).toContainText('Dibujado en el mapa');
    const width = Number((await page.getByTestId('region-width').inputValue()).replace(',', '.'));
    const length = Number((await page.getByTestId('region-length').inputValue()).replace(',', '.'));
    expect(width).toBeGreaterThan(50);
    expect(length).toBeGreaterThan(50);
    // 300 × 200 px en pantalla mantienen la proporción en metros (mismo zoom en ambos ejes).
    expect(width / length).toBeCloseTo(1.5, 1);
    const areaText = (await page.getByTestId('region-area').textContent()) ?? '';
    const areaHa = Number(
      /([\d.]+,\d+)\s*ha/.exec(areaText)?.[1]?.replace('.', '').replace(',', '.'),
    );
    expect(Math.abs(areaHa - (width * length) / 10_000)).toBeLessThan(0.02);
    expect(errors).toEqual([]);
  });

  test('busca lugares por nombre y por coordenadas', async ({ page }) => {
    const errors = trackPageErrors(page);
    await mockProviders(page);
    const searches: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/geocoding/search')) searches.push(request.url());
    });
    await openMap(page);
    await expect(page.getByText('GeoNames (CC BY 4.0)')).toBeVisible();

    await page.getByTestId('place-search-input').fill('Punata');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const results = page.getByTestId('place-search-results');
    await expect(results).toContainText('Punata');
    await expect(results).toContainText('Cochabamba · Bolivia');
    await results.getByRole('button').first().click();
    await expect(page.getByTestId('draft-source')).toContainText('Resultado de búsqueda · Punata');
    await expect(page.getByTestId('region-center')).toContainText('-17,542340°, -65,834720°');
    expect(searches).toHaveLength(1);

    // Las coordenadas se resuelven en el navegador, sin llamar al servicio.
    await page.getByTestId('place-search-input').fill('17°33\'04.8"S 65°51\'43.1"W');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await results.getByRole('button', { name: /Coordenadas/ }).click();
    await expect(page.getByTestId('draft-source')).toContainText('Coordenadas escritas');
    await expect(page.getByTestId('region-center')).toContainText('-17,551333°, -65,861972°');
    expect(searches).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('confirma, guarda la ubicación y permite modificarla tras recargar', async ({ page }) => {
    const errors = trackPageErrors(page);
    await mockProviders(page);
    await openMap(page);
    await page.getByTestId('region-preset').getByRole('button', { name: 'Usar' }).click();
    await page.getByTestId('confirm-location').click();
    const dialog = page.getByTestId('confirm-site-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('12,00 ha');
    await page.getByTestId('site-name-input').fill('Granja de prueba');
    await page.getByTestId('confirm-site-submit').click();

    const farm = page.getByTestId('farm-screen');
    await expect(farm).toBeVisible();
    await expect(page.getByTestId('farm-name')).toHaveText('Granja de prueba');
    await expect(page.getByTestId('demo-disclaimer')).toBeVisible();
    await expect(page.getByTestId('frame-origin')).toContainText('-17,551334°, -65,861983°');
    await expect(page.getByTestId('region-schematic').locator('polygon')).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath('02-preparacion-granja.png'),
      fullPage: true,
    });

    const stored = await page.evaluate(() => localStorage.getItem('terralab.site'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({
      schemaVersion: 1,
      site: { name: 'Granja de prueba', source: 'preset', region: { widthM: 400, lengthM: 300 } },
    });

    await page.reload();
    await expect(page.getByTestId('check-site')).toContainText('Guardada');
    await page.getByTestId('continue-site').click();
    await expect(page.getByTestId('farm-name')).toHaveText('Granja de prueba');

    await page.getByTestId('edit-location').click();
    await expect(page.getByTestId('location-screen')).toBeVisible();
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');
    await page.getByTestId('region-width').fill('500');
    await expect(page.getByTestId('region-area')).toContainText('15,00 ha');
    await page.getByTestId('confirm-location').click();
    await expect(page.getByTestId('site-name-input')).toHaveValue('Granja de prueba');
    await page.getByTestId('confirm-site-submit').click();
    await expect(page.getByTestId('farm-screen')).toContainText('15,00 ha');

    await page.reload();
    await page.getByTestId('continue-site').click();
    await expect(page.getByTestId('farm-screen')).toContainText('15,00 ha');
    expect(errors).toEqual([]);
  });

  test('gestiona los errores de red de la búsqueda', async ({ page }) => {
    await mockProviders(page);
    await page.route('**/api/geocoding/search**', (route) =>
      route.fulfill({
        status: 503,
        json: { detail: 'El nomenclátor local no está generado: ejecuta «make geodata».' },
      }),
    );
    await openMap(page);
    await page.getByTestId('place-search-input').fill('Punata');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const status = page.getByTestId('place-search-status');
    await expect(status).toContainText('make geodata');

    await page.unroute('**/api/geocoding/search**');
    await page.route('**/api/geocoding/search**', (route) => route.abort('connectionrefused'));
    await status.getByRole('button', { name: 'Reintentar' }).click();
    await expect(status).toContainText('No se pudo conectar con la API');

    await page.unroute('**/api/geocoding/search**');
    await page.route('**/api/geocoding/search**', (route) =>
      route.fulfill({ json: PUNATA_RESULTS }),
    );
    await status.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('place-search-results')).toContainText('Punata');
  });

  test('sigue siendo usable si la API o el mapa base no responden', async ({ page }) => {
    await mockProviders(page, { failBasemap: true });
    await page.route('**/api/geocoding/info', (route) => route.abort('connectionrefused'));
    await openMap(page);
    await expect(page.getByTestId('map-error')).toContainText('No se pudo cargar el mapa base');
    await expect(page.getByTestId('place-search-unavailable')).toContainText('necesita la API');

    // Coordenadas y región demostrativa no dependen de la red.
    await page.getByTestId('region-preset').getByRole('button', { name: 'Usar' }).click();
    await expect(page.getByTestId('region-area')).toContainText('12,00 ha');
    await expect(page.getByTestId('confirm-location')).toBeEnabled();

    // Al recuperarse la conexión, «Reintentar» vuelve a cargar el mapa.
    await page.unroute('https://tiles.openfreemap.org/**');
    await page.route('https://tiles.openfreemap.org/**', (route) =>
      route.fulfill({ json: TEST_STYLE }),
    );
    await page.getByTestId('map-error').getByRole('button', { name: 'Reintentar' }).click();
    await expectMapReady(page);
  });

  test('cambia al mapa de satélite con su atribución', async ({ page }) => {
    await mockProviders(page);
    await openMap(page);
    await expectMapReady(page);
    await page.getByRole('button', { name: 'Satélite 2016' }).click();
    await expect(page.getByText(/10 m por píxel/)).toBeVisible();
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('EOX IT Services GmbH');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Copernicus Sentinel 2016');
  });

  test('reintenta las teselas que fallaron sin recargar la página', async ({ page }) => {
    await mockProviders(page);
    // Primero fallan las teselas de satélite (como un corte de red transitorio)…
    await page.route('https://tiles.maps.eox.at/**', (route) => route.abort('connectionreset'));
    await openMap(page);
    await expectMapReady(page);
    await page.getByRole('button', { name: 'Satélite 2016' }).click();
    const warning = page.getByTestId('tile-warning');
    await expect(warning).toContainText('no se pudieron cargar');

    // …y al recuperarse la conexión, «Reintentar» vuelve a pedirlas.
    let served = 0;
    await page.unroute('https://tiles.maps.eox.at/**');
    await page.route('https://tiles.maps.eox.at/**', (route) => {
      served++;
      return route.fulfill({ contentType: 'image/png', body: PIXEL_PNG });
    });
    await warning.getByRole('button', { name: 'Reintentar' }).click();
    await expect(warning).toBeHidden();
    await expect.poll(() => served).toBeGreaterThan(0);
  });

  test('se adapta al móvil sin desbordamiento horizontal', async ({ page }) => {
    await mockProviders(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openMap(page);
    await expectMapReady(page);
    await page.getByTestId('region-preset').getByRole('button', { name: 'Usar' }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('confirm-location')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('03-movil.png'), fullPage: true });
  });
});
