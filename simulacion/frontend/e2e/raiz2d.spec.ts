import { expect, test, type Page } from '@playwright/test';

/** Registra llamadas a proveedores (NASA, NOAA, TTS) y errores de página: ambos deben quedar vacíos. */
function guard(page: Page) {
  const providers: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (/power\.larc|cpc\.ncep|noaa\.gov\/data|huggingface|fonts\.g/.test(r.url())) providers.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return { providers, errors };
}

test('recorrido de cuatro pasos sin llamadas a proveedores', async ({ page }) => {
  const g = guard(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rotar con evidencia. Proteger agua y suelo.');
  await expect(page.getByRole('heading', { name: /4 de 5 campañas con Niño fuerte/ })).toBeVisible();
  await expect(page.getByText(/frecuencia histórica con n = 5, no una probabilidad/)).toBeVisible();

  await page.getByRole('button', { name: 'Seguir al paso 2: Rotaciones' }).click();
  await expect(page).toHaveURL(/paso=rotaciones/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Los 3 casos que empiezan con papa comparten esta campaña', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Seguir al paso 3: Suelo y confianza' }).click();
  await expect(page.getByRole('heading', { name: 'Calendario de cobertura planificada' })).toBeVisible();
  await expect(page.getByText('0,14 a 0,16 m por metro de suelo', { exact: false })).toBeVisible();
  await expect(page.getByText(/El agua cierra en todas las corridas \(error máximo 0,00 mm\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Seguir al paso 4: Ficha y radio' }).click();
  await expect(page.getByRole('heading', { name: 'Ficha de comparación de rotaciones' })).toBeVisible();

  // Atrás vuelve al paso anterior (cada paso es una entrada del historial).
  await page.goBack();
  await expect(page).toHaveURL(/paso=suelo/);
  expect(g.providers).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('escenario, periodo y muestra insuficiente sin conclusión', async ({ page }) => {
  await page.goto('/?paso=rotaciones');
  await expect(page.getByText(/n = 14 ventanas/)).toBeVisible();
  await page.getByRole('radio', { name: /^Niño fuerte/ }).check();
  await expect(page.getByText(/n = 4 ventanas/)).toBeVisible();
  await page.getByRole('radio', { name: '1981–2000' }).check();
  await expect(page.getByText(/n = 1 ventana /)).toBeVisible();
  await expect(page.getByText('Muestra insuficiente', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Sin orden: se necesita el promedio de al menos 3 ventanas.')).toBeVisible();
  await expect(page.locator('.rank-pos')).toHaveCount(0);
  await expect(page).toHaveURL(/escenario=nino-fuerte/);
  await expect(page).toHaveURL(/periodo=historico/);
});

test('prioridades: orden y empate con datos reales', async ({ page }) => {
  await page.goto('/?paso=rotaciones');
  const ranks = page.locator('.rot-row .rank-pos');
  await expect(ranks).toHaveCount(3);

  // Solo «días sin cultivo»: A-0 y C-0 tienen el mismo calendario (336 días) y empatan.
  await page.getByLabel('Menos agua de pozo').fill('0');
  await page.getByLabel('Menos días de estrés hídrico').fill('0');
  await page.getByLabel('Menos días sin cultivo').fill('2');
  await expect(page.locator('.rot-row').filter({ hasText: 'empate' })).toHaveCount(2);
  // B-0 (papa, quinua, haba) no tiene descanso: 504 días sin cultivo, último lugar.
  await expect(page.locator('.rot-row').last()).toContainText('B-0');

  await page.getByLabel('Menos días sin cultivo').fill('0');
  await expect(page.getByText('Todas las prioridades en 0: se muestra el orden del catálogo.')).toBeVisible();
  await expect(page).toHaveURL(/p_descubierto=0/);
});

test('el presupuesto de agua elige corridas precalculadas', async ({ page }) => {
  await page.goto('/?paso=rotaciones');
  const a0 = page.locator('.rot-row').filter({ has: page.getByRole('heading', { name: /A-0/ }) });
  const stressDays = async () => Number((await a0.locator('.rot-kpis dd').nth(1).innerText()).replace(/\D/g, ''));
  const unlimited = await stressDays();
  await page.getByRole('radio', { name: /^Secano/ }).check();
  await expect(page).toHaveURL(/presupuesto=secano/);
  await expect(a0.locator('.rot-kpis dd').first()).toHaveText(/^0 mm/);
  await expect.poll(stressDays).toBeGreaterThan(unlimited);
  await expect(page.getByText(/Papa y haba sin agua de pozo/)).toBeVisible();
  await page.getByRole('radio', { name: /^200 mm/ }).check();
  await expect(a0.locator('.rot-kpis dd').first()).toHaveText(/^200 mm/);
});

test('tabla de nueve casos con presupuesto real', async ({ page }) => {
  await page.goto('/?paso=rotaciones');
  const table = page.getByTestId('nine-cases');
  await expect(table.locator('tbody tr')).toHaveCount(9);
  const b0 = table.locator('tbody tr').filter({ has: page.getByRole('button', { name: /^B-0/ }) });
  const decision = await b0.locator('td').nth(1).innerText();
  // En la campaña de decisión, quinua (secano) y descanso no tienen riego: «sin dato», no cero.
  await expect(table.locator('tbody')).toContainText('sin dato');
  await page.getByRole('radio', { name: 'Ciclo de tres campañas' }).check();
  await expect(b0.locator('td').nth(1)).not.toHaveText(decision);
  await expect(page.getByRole('radio', { name: /^Sin límite/ })).toBeChecked();
  await expect(table.locator('caption')).toContainText('sin límite (requerimiento)');
});

test('la ficha lleva el mismo resultado y el boletín es general', async ({ page }) => {
  const g = guard(page);
  await page.goto('/?paso=rotaciones&escenario=nina&cultivo=quinua&presupuesto=cupo_100');
  await page.getByRole('button', { name: 'Usar B-1 en la ficha' }).click();
  await page.getByRole('link', { name: /Ficha y radio/ }).click();
  await expect(page.locator('.sheet-meta')).toContainText('/B-1/cupo_100/nina/all/promedio');
  await expect(page.locator('.sheet-meta')).toContainText('cupo de 100 mm por campaña');
  await expect(page.locator('.sheet-meta')).toContainText('fase Niña');
  await expect(page.getByText('Preparado; emisión por radio no confirmada')).toBeVisible();
  await expect(page.getByText('No corresponde a la selección de la ficha', { exact: false })).toBeVisible();
  await expect(page.getByText('Audio en español no disponible en esta entrega')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ficha en texto' }).click();
  expect((await download).suggestedFilename()).toBe('raiz-ficha-B-1-niña.txt');

  const audio = page.locator('audio').first();
  await expect(audio).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: 'Escuchar boletín en quechua' }).click();
  await expect.poll(() => audio.evaluate((el) => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pausar boletín en quechua' }).click();
  await expect(audio).toHaveJSProperty('paused', true);
  expect(g.errors).toEqual([]);
});

test('móvil: sin desborde, aviso regional fijo y teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const paso of ['clima', 'rotaciones', 'suelo', 'ficha']) {
    await page.goto(`/?paso=${paso}`);
    await expect(page.locator('main h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, paso).toBe(0);
  }
  await page.goto('/?paso=rotaciones');
  await page.getByTestId('nine-cases').scrollIntoViewIfNeeded();
  await expect(
    page.getByText('Datos regionales (celda NASA POWER de ~50 km), no mediciones de la parcela', { exact: true }),
  ).toBeInViewport();
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
});

test('créditos: licencias, IA y límites', async ({ page }) => {
  await page.goto('/?vista=creditos');
  await expect(page.getByRole('heading', { name: 'Créditos y límites', level: 1 })).toBeVisible();
  for (const text of ['CC-BY-NC-4.0', 'Claude', 'Gemini', 'MIT', 'SIL Open Font License']) {
    await expect(page.locator('main')).toContainText(text);
  }
  for (const paso of ['', '?paso=rotaciones', '?paso=suelo', '?paso=ficha', '?vista=creditos']) {
    await page.goto(`/${paso}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/validado|dos fuentes|\+5 °C|décadas/i);
  }
});

test('las direcciones del prototipo retirado redirigen a Raíz 2D', async ({ page }) => {
  await page.goto('/raiz.html');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rotar con evidencia. Proteger agua y suelo.');
  await page.goto('/creditos.html');
  await expect(page).toHaveURL(/vista=creditos/);
  await expect(page.getByRole('heading', { name: 'Créditos y límites', level: 1 })).toBeVisible();
});
