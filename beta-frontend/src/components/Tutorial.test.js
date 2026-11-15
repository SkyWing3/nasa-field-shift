import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { textoHablado } from './Tutorial.jsx'

const datos = JSON.parse(readFileSync(new URL('../../../content/tutorial/tutorial.json', import.meta.url), 'utf8'))
const codigos = datos.idiomas.map((i) => i.id)

describe('contenido del tutorial', () => {
  it('tiene los 7 idiomas en cada texto de la interfaz y de los pasos', () => {
    expect(codigos).toEqual(['es', 'qu', 'ay', 'gn', 'en', 'pt', 'fr'])
    const campos = [...Object.values(datos.ui), ...Object.values(datos.pasos).flatMap((p) => [p.titulo, p.para, p.ejemplo])]
    for (const campo of campos) for (const c of codigos) expect(campo[c], JSON.stringify(campo.es)).toBeTruthy()
  })

  it('cada parada de los dos recorridos apunta a un paso existente', () => {
    for (const recorrido of ['beta', 'simulacion']) {
      expect(datos.recorridos[recorrido].length).toBeGreaterThanOrEqual(5)
      for (const parada of datos.recorridos[recorrido]) expect(datos.pasos[parada.paso], parada.paso).toBeDefined()
    }
  })

  it('el texto hablado junta título, para qué sirve y ejemplo', () => {
    expect(textoHablado(datos, 'idioma', 'es')).toBe('Cambia el idioma. Elige en qué idioma quieres leer la aplicación. Por ejemplo: Elige Runasimi para leer en quechua.')
    expect(textoHablado(datos, 'bienvenida', 'qu')).toContain('Raízman allinlla hamuy')
  })
})
