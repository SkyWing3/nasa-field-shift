import { describe, expect, it } from 'vitest'
import { dentroDeZona, distanciaKm, metrosCubicos, validarParcela } from './parcela.js'

describe('parcela desde la simulación 3D', () => {
  it('valida y redondea la ubicación a 0,01°', () => {
    expect(validarParcela({ nombre: 'Mi chacra', lat: '-17.8361', lon: '-67.0049', ha: '0.5' })).toEqual({ nombre: 'Mi chacra', lat: -17.84, lon: -67, ha: 0.5 })
    expect(validarParcela({ lat: 'x', lon: '1' })).toBeNull()
    expect(validarParcela({ lat: '-17.8', lon: '-67' }).nombre).toBe('Mi parcela')
  })

  it('mide la distancia al punto de datos y decide si está en la zona', () => {
    const obrajes = { lat: -17.83, lon: -67.0 }
    expect(distanciaKm(obrajes, obrajes)).toBe(0)
    const laPaz = { lat: -16.5, lon: -68.15 }
    expect(Math.round(distanciaKm(obrajes, laPaz))).toBeGreaterThan(180)
    expect(dentroDeZona(10)).toBe(true)
    expect(dentroDeZona(180)).toBe(false)
  })

  it('convierte mm de riego a m³ para la superficie (1 mm · 1 ha = 10 m³)', () => {
    expect(metrosCubicos(457, 0.5)).toBe(2285)
    expect(metrosCubicos(NaN, 1)).toBeNull()
  })
})
