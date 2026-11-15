import { describe, expect, it } from 'vitest'
import { crearTraductor } from './traductor.js'
import { DICCIONARIOS, IDIOMAS, t } from './idioma.js'

describe('idiomas de la interfaz', () => {
  it('carga quechua y aymara desde src/i18n y ofrece otro idioma', () => {
    expect(IDIOMAS.map((i) => i.id)).toEqual(expect.arrayContaining(['es', 'qu', 'ay', 'otro']))
    expect(DICCIONARIOS.qu._meta.estado).toBe('revision_de_hablante_pendiente')
  })

  it('usa el español si falta la clave o está vacía', () => {
    expect(t('observar', 'qu')).toBe('Qhaway')
    expect(t('observar', 'es')).toBe('Observar')
    expect(t('observar', 'zz')).toBe('Observar')
  })

  it('traduce textos exactos, patrones con números y partes anidadas', () => {
    const traducir = crearTraductor({
      textos: { 'Suelo cubierto': 'Qatasqa allpa', papa: 'papa', quinua: 'kinuwa', vacio: '' },
      patrones: { '{n} días': '{n} p\'unchaw', 'Secuencia: {a}, luego {b}': 'Qatiq: {a}, chaymanta {b}' },
    })
    expect(traducir('  Suelo   cubierto ')).toBe('Qatasqa allpa')
    expect(traducir('1.294 días')).toBe('1.294 p\'unchaw')
    expect(traducir('Secuencia: papa, luego quinua')).toBe('Qatiq: papa, chaymanta kinuwa')
    expect(traducir('vacio')).toBeNull()
    expect(traducir('Texto sin traducción')).toBeNull()
  })
})
