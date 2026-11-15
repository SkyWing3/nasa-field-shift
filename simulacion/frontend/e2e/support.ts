import type { Locator, Page } from '@playwright/test';

/** Registra errores de consola y excepciones no capturadas de la página. */
export function trackPageErrors(page: Page, ignore: readonly RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!ignore.some((pattern) => pattern.test(text))) errors.push(`console: ${text}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

export interface ImageStats {
  readonly mean: readonly [number, number, number];
  /** Varianza de la luminancia: ≈ 0 en una imagen uniforme (nada dibujado). */
  readonly variance: number;
}

/** Color medio y varianza de luminancia de una captura del elemento (p. ej. el lienzo WebGL). */
export async function imageStats(page: Page, element: Locator): Promise<ImageStats> {
  const png = await element.screenshot();
  return page.evaluate(async (base64): Promise<ImageStats> => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d');
    if (!context) throw new Error('Sin contexto 2D');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, surface.width, surface.height);
    const pixels = data.length / 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      r += pr;
      g += pg;
      b += pb;
      const luminance = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
      sum += luminance;
      sumSquares += luminance * luminance;
    }
    const mean = sum / pixels;
    return {
      mean: [r / pixels, g / pixels, b / pixels],
      variance: sumSquares / pixels - mean * mean,
    };
  }, png.toString('base64'));
}

/** Color RGB de un píxel de la captura de un elemento (coordenadas relativas al elemento). */
export async function pixelAt(
  page: Page,
  element: Locator,
  x: number,
  y: number,
): Promise<readonly [number, number, number]> {
  const png = await element.screenshot();
  const box = await element.boundingBox();
  if (box === null) throw new Error('El elemento no es visible');
  return page.evaluate(
    async ({ base64, px, py, cssWidth }): Promise<[number, number, number]> => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const surface = document.createElement('canvas');
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext('2d');
      if (!context) throw new Error('Sin contexto 2D');
      context.drawImage(image, 0, 0);
      const ratio = image.width / cssWidth;
      const [r = 0, g = 0, b = 0] = context.getImageData(
        Math.round(px * ratio),
        Math.round(py * ratio),
        1,
        1,
      ).data;
      return [r, g, b];
    },
    { base64: png.toString('base64'), px: x, py: y, cssWidth: box.width },
  );
}
