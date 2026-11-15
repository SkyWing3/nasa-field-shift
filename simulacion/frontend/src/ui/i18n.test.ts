import { describe, expect, it } from 'vitest';

import { isLanguage, LANGUAGES, translate } from './i18n';

describe('i18n de la pantalla inicial', () => {
  it('ofrece las lenguas de Bolivia primero y otras cuatro', () => {
    expect(LANGUAGES.map((item) => item.id)).toEqual(['es', 'qu', 'ay', 'gn', 'en', 'fr', 'pt']);
  });

  it('traduce y reemplaza variables', () => {
    expect(translate('compare', 'es')).toBe('Comparar rotaciones');
    expect(translate('continueWith', 'es', { name: 'Obrajes' })).toBe('Continuar con Obrajes');
    expect(translate('continueWith', 'qu', { name: 'Obrajes' })).toContain('Obrajes');
  });

  it('marca la traducción automática y rechaza idiomas no soportados', () => {
    expect(translate('aiNotice', 'es')).toMatch(/Traducción automática con IA/);
    expect(isLanguage('qu')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(translate('compare', 'en')).toBe('Compare rotations');
  });
});
