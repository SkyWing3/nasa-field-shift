import { expect, test, type Locator, type Page } from '@playwright/test';

import { trackPageErrors } from './support';

interface RegionStats {
  readonly mean: readonly [number, number, number];
  readonly variance: number;
}

/**
 * Analiza los píxeles de una captura del lienzo WebGL. Devuelve el color medio de la
 * franja superior (cielo) y de la inferior (suelo), y la varianza global de luminancia.
 */
async function analyzeCanvas(page: Page, canvas: Locator) {
  const png = await canvas.screenshot();
  return page.evaluate(async (base64): Promise<{ top: RegionStats; bottom: RegionStats }> => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const ctx = surface.getContext('2d');
    if (!ctx) throw new Error('Sin contexto 2D');
    ctx.drawImage(image, 0, 0);

    const region = (y0: number, y1: number): RegionStats => {
      const { data } = ctx.getImageData(0, y0, surface.width, y1 - y0);
      let r = 0;
      let g = 0;
      let b = 0;
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const pr = data[i] ?? 0;
        const pg = data[i + 1] ?? 0;
        const pb = data[i + 2] ?? 0;
        r += pr;
        g += pg;
        b += pb;
        lum.push(0.2126 * pr + 0.7152 * pg + 0.0722 * pb);
      }
      const n = data.length / 4;
      const meanLum = lum.reduce((a, v) => a + v, 0) / n;
      const variance = lum.reduce((a, v) => a + (v - meanLum) ** 2, 0) / n;
      return { mean: [r / n, g / n, b / n], variance };
    };

    const h = surface.height;
    return { top: region(0, Math.floor(h * 0.15)), bottom: region(Math.floor(h * 0.85), h) };
  }, png.toString('base64'));
}

test.describe('Pantalla inicial', () => {
  test('muestra la marca, el estado del sistema y conecta con la API real', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'TerraLab 3D' })).toBeVisible();
    await expect(page.getByTestId('check-graphics')).toContainText('WebGL 2');
    await expect(page.getByTestId('check-api')).toContainText('Conectada');
    await expect(page.getByTestId('check-api')).toContainText('entorno development');
    await expect(
      page.getByRole('button', { name: 'Elegir la ubicación de la granja' }),
    ).toBeEnabled();
    await expect(page.getByTestId('check-site')).toContainText('Sin elegir');

    await page.screenshot({ path: test.info().outputPath('01-pantalla-inicial.png') });
    expect(errors).toEqual([]);
  });

  test('informa del fallo de la API y permite reintentar', async ({ page }) => {
    // El navegador registra en consola el 503 simulado; es el comportamiento esperado.
    const errors = trackPageErrors(page, [/503/]);
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 503, body: 'Service Unavailable' }),
    );
    await page.goto('/');

    const apiCheck = page.getByTestId('check-api');
    await expect(apiCheck).toContainText('Sin conexión');
    await expect(apiCheck).toContainText('HTTP 503');
    await page.screenshot({ path: test.info().outputPath('02-api-sin-conexion.png') });

    await page.unroute('**/api/health');
    await apiCheck.getByRole('button', { name: 'Reintentar conexión con la API' }).click();
    await expect(apiCheck).toContainText('Conectada');
    expect(errors).toEqual([]);
  });
});

test.describe('Espacio de trabajo', () => {
  test('React Three Fiber renderiza la escena provisional', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir el laboratorio (escena provisional)' }).click();

    const viewport = page.getByTestId('scene-viewport');
    await expect(viewport).toHaveAttribute('data-scene-status', 'ready', { timeout: 20_000 });
    const canvas = viewport.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThan(300);

    // Los píxeles demuestran que hubo renderizado real (no un lienzo vacío o negro):
    // cielo claro arriba, suelo terroso (R > B) y más oscuro abajo.
    const stats = await analyzeCanvas(page, canvas);
    const luminance = ([r, g, b]: readonly [number, number, number]) =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [groundR, , groundB] = stats.bottom.mean;
    expect(luminance(stats.top.mean)).toBeGreaterThan(luminance(stats.bottom.mean) + 40);
    expect(groundR).toBeGreaterThan(groundB);
    expect(luminance(stats.bottom.mean)).toBeGreaterThan(10);

    await expect(page.getByTestId('api-status')).toHaveAttribute('data-api-status', 'online');
    await page.screenshot({ path: test.info().outputPath('03-espacio-de-trabajo.png') });
    expect(errors).toEqual([]);
  });

  test('muestra estados vacíos en lugar de datos inventados', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir el laboratorio (escena provisional)' }).click();

    await expect(page.getByTestId('simulation-notice')).toHaveText('Sin simulación activa');
    const topBar = page.getByTestId('top-bar');
    await expect(topBar.getByText('Fecha simulada')).toBeVisible();
    await expect(topBar.locator('dd').first()).toHaveText('—');

    const panel = page.getByTestId('side-panel');
    await expect(panel.getByText('Ningún escenario cargado')).toBeVisible();
    await expect(panel.getByText('Ninguna parcela seleccionada')).toBeVisible();
    const tools = panel.getByRole('button');
    await expect(tools).toHaveCount(4);
    for (const tool of await tools.all()) {
      await expect(tool).toBeDisabled();
    }

    await page.getByRole('button', { name: 'Volver al inicio' }).click();
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });

  test('se adapta a pantallas estrechas sin desbordamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir el laboratorio (escena provisional)' }).click();
    await expect(page.getByTestId('scene-viewport')).toHaveAttribute('data-scene-status', 'ready', {
      timeout: 20_000,
    });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('side-panel')).toBeVisible();

    // Los controles de la barra superior deben quedar completamente dentro de la pantalla.
    for (const control of [
      page.getByTestId('api-status'),
      page.getByRole('button', { name: 'Volver al inicio' }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: test.info().outputPath('04-movil.png') });
  });
});
