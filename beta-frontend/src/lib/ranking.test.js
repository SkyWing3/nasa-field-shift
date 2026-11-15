// Pruebas D3-3 (para P5): ranking, empates, faltantes y n<3.
import { describe, expect, it } from 'vitest'
import { nivelesRelativos, ordenarCasos } from './ranking.js'

const m = (value) => ({ value, unit: 'x', missing_reason: value === null ? 'motivo' : null })
const reg = (id, kpis, n = 5) => ({
  case_id: id, n_windows: n,
  decision_kpis: {
    net_irrigation_requirement_mm: m(kpis[0]), water_stress_days: m(kpis[1]),
    planned_coverage_pct: m(kpis[2]), bare_rain_exposure_days: m(kpis[3]), bare_wind_exposure_days: m(kpis[4]),
  },
})

describe('ordenarCasos', () => {
  it('ordena según prioridad de agua', () => {
    const r = ordenarCasos([reg('A', [100, 10, 50, 5, 5]), reg('B', [50, 5, 50, 5, 5])], 'decision_kpis', { agua: 100, suelo: 0 })
    expect(r.estado).toBe('ok')
    expect(r.filas[0].registro.case_id).toBe('B')
    expect(r.filas[0].posicion).toBe(1)
    expect(r.filas[1].posicion).toBe(2)
  })

  it('empate exacto comparte posición', () => {
    const r = ordenarCasos([reg('A', [50, 5, 50, 5, 5]), reg('B', [50, 5, 50, 5, 5]), reg('C', [90, 9, 20, 9, 9])], 'decision_kpis', { agua: 50, suelo: 50 })
    expect(r.filas[0].posicion).toBe(1)
    expect(r.filas[1].posicion).toBe(1)
    expect(r.filas[2].posicion).toBe(3)
    expect(r.filas[0].empatadoCon).toHaveLength(1)
  })

  it('un KPI faltante deja al caso sin puntaje (no lo premia)', () => {
    const r = ordenarCasos([reg('A', [null, 1, 99, 0, 0]), reg('B', [50, 5, 50, 5, 5])], 'decision_kpis', { agua: 50, suelo: 50 })
    const a = r.filas.find((f) => f.registro.case_id === 'A')
    expect(a.puntaje).toBeNull()
    expect(a.faltantes).toContain('net_irrigation_requirement_mm')
  })

  it('n<3 → sin conclusión', () => {
    const r = ordenarCasos([reg('A', [1, 1, 1, 1, 1], 2)], 'decision_kpis', { agua: 50, suelo: 50 })
    expect(r.estado).toBe('muestra_insuficiente')
    expect(r.filas[0].posicion).toBeNull()
  })

  it('n=0 → sin ventanas', () => {
    const r = ordenarCasos([{ case_id: 'A', n_windows: 0, decision_kpis: null, missing_reason: 'x' }], 'decision_kpis', { agua: 1 })
    expect(r.estado).toBe('sin_ventanas')
  })

  it('pesos cero → inválido', () => {
    const r = ordenarCasos([reg('A', [1, 1, 1, 1, 1])], 'decision_kpis', { agua: 0, suelo: 0 })
    expect(r.estado).toBe('pesos_invalidos')
  })

  it('todos iguales → todos empatados', () => {
    const r = ordenarCasos([reg('A', [5, 5, 5, 5, 5]), reg('B', [5, 5, 5, 5, 5])], 'decision_kpis', { agua: 50, suelo: 50 })
    expect(r.estado).toBe('todos_empatados')
  })
})

describe('nivelesRelativos', () => {
  it('reparte Bajo/Medio/Alto por tercios', () => {
    const r = nivelesRelativos([reg('A', [0, 0, 0, 0, 0]), reg('B', [0, 5, 0, 0, 0]), reg('C', [0, 10, 0, 0, 0])])
    expect(r.A.agua.id).toBe('bajo')
    expect(r.B.agua.id).toBe('medio')
    expect(r.C.agua.id).toBe('alto')
  })
  it('sin nivel si todos iguales, si falta el dato o si n<3', () => {
    expect(nivelesRelativos([reg('A', [0, 5, 0, 1, 1]), reg('B', [0, 5, 0, 1, 1])]).A.agua).toBeNull()
    expect(nivelesRelativos([reg('A', [0, 1, 0, 0, 0]), reg('B', [0, 9, 0, 0, 0])]).A.temperatura).toBeNull()
    expect(nivelesRelativos([reg('A', [0, 1, 0, 0, 0], 2), reg('B', [0, 9, 0, 0, 0], 2)]).A.agua).toBeNull()
  })
})

