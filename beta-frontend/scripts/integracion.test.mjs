// Contrato frontend/publicador: no necesita instalar dependencias ni consultar proveedores.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { cargarFuente, naturalezaPaquete, urlRelease } from '../src/lib/datos.js'
import { escenarioInicial, opcionesEscenario, registrosDelEscenario, textoCalendario, nombreFuente, formatoKpi, kpisDisponibles } from '../src/lib/dominio.js'
import { ordenarCasos } from '../src/lib/ranking.js'
import { buscarPython } from './python.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../public')
const leer = (ruta) => JSON.parse(readFileSync(resolve(raiz, ruta), 'utf8'))

test('Python: respeta Windows, versiones mínimas y el ejecutable explícito', () => {
  const llamadas = []
  const valido = (p) => { llamadas.push(p); return { status: 0, stdout: 'Python 3.13.5' } }
  assert.equal(buscarPython(valido, 'win32', ''), 'python')
  assert.deepEqual(llamadas, ['python'])
  assert.equal(buscarPython(valido, 'darwin', ''), 'python3')
  assert.equal(buscarPython(valido, 'win32', 'C:/Python313/python.exe'), 'C:/Python313/python.exe')
  assert.equal(buscarPython((p) => ({ status: 0, stdout: p === 'python' ? 'Python 3.9.0' : 'Python 3.10.0' }), 'win32', ''), 'python3')
  assert.throws(() => buscarPython(() => ({ status: null, error: new Error('EPERM') }), 'win32', ''), /EPERM/)
})

const registroPrueba = (id, agua, n = 5) => ({
  case_id: id, n_windows: n,
  decision_kpis: { net_irrigation_requirement_mm: { value: agua }, water_stress_days: { value: agua } },
})

test('ranking: empates, faltantes y muestra insuficiente no dan ventajas falsas', () => {
  const registros = [registroPrueba('A', 10), registroPrueba('B', 10), registroPrueba('C', 30)]
  const pesos = { agua: 100, suelo: 0 }
  const orden = ordenarCasos(registros, 'decision_kpis', pesos)
  assert.deepEqual(orden.filas.map((f) => f.posicion), [1, 1, 3])
  registros[0].decision_kpis.water_stress_days.value = null
  const incompleto = ordenarCasos(registros, 'decision_kpis', pesos).filas.find((f) => f.registro.case_id === 'A')
  assert.equal(incompleto.puntaje, null)
  assert.equal(incompleto.posicion, null)
  for (const n of [0, 2]) {
    const r = ordenarCasos([registroPrueba('A', 10, n)], 'decision_kpis', pesos)
    assert.equal(r.estado, n === 0 ? 'sin_ventanas' : 'muestra_insuficiente')
    assert.equal(r.filas[0].posicion, null)
  }
})

test('ranking: rechaza pesos negativos, no finitos y sin suma positiva', () => {
  for (const pesos of [{ agua: -1, suelo: 100 }, { agua: NaN }, { agua: Infinity }, { agua: 0, suelo: 0 }]) {
    const r = ordenarCasos([registroPrueba('A', 10)], 'decision_kpis', pesos)
    assert.equal(r.estado, 'pesos_invalidos')
    assert.equal(r.filas[0].puntaje, null)
  }
})

test('KPI inválidos no se muestran como números; las frecuencias cuentan ventanas', () => {
  for (const value of [null, undefined, NaN, Infinity, '10']) assert.ok(formatoKpi({ value, unit: 'mm' }).vacio)
  assert.equal(formatoKpi({ value: 0, unit: 'mm' }).vacio, false)
  assert.equal(formatoKpi({ value: 0.5, unit: 'fraction', numerator: 2, denominator: 4 }).texto, '2 de 4 ventanas')
})

test('calendario Dev 2 por cultivo se convierte en texto sin objetos React', () => {
  assert.equal(textoCalendario({ papa: 'siembra 01/10', descanso: 'todo el año' }), 'Papa: siembra 01/10; Descanso: todo el año')
  assert.equal(textoCalendario('calendario fixture'), 'calendario fixture')
  assert.equal(textoCalendario(null), null)
  assert.equal(nombreFuente('nasa-power-daily'), 'nasa-power-daily')
  assert.equal(nombreFuente({ agency: 'NASA', product: 'POWER' }), 'NASA · POWER')
})

test('fixture con indicadores null conserva el aviso de prueba sin cifras', () => {
  const paquete = {
    catalog: { mode: 'fixture' }, climate: { mode: 'fixture' },
    results: { mode: 'fixture', data: { records: [{ decision_kpis: { agua: { value: null } } }] } },
  }
  assert.equal(naturalezaPaquete(paquete).tipo, 'fixture')
  paquete.results.data.records[0].decision_kpis.agua.value = 10
  assert.equal(naturalezaPaquete(paquete).tipo, 'ejemplo')
})

test('paquete oficial: carga de JSON, 9 casos por escenario, suelo y mensajes/audio coherentes', async (t) => {
  assert.ok(existsSync(resolve(raiz, 'paquete/current.json')), 'Preparar primero el paquete oficial con npm run paquete')
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    try {
      return { ok: true, status: 200, json: async () => leer(String(url).replace(/^\.\//, '')) }
    } catch {
      return { ok: false, status: 404 }
    }
  }
  t.after(() => { globalThis.fetch = original })
  const paquete = await cargarFuente('paquete')
  const opciones = opcionesEscenario(paquete)
  assert.equal(kpisDisponibles(paquete).length, 6)
  assert.equal(paquete.catalog.data.presentation.ranking_enabled, false)
  assert.equal(paquete.catalog.data.presentation.risk_levels_enabled, false)
  assert.equal(opciones.presupuestos.length, 1)
  assert.equal(opciones.suelos.length, 1)
  assert.equal(paquete.climate.data.period_summaries.length, 8)
  assert.equal(paquete.climate.data.decade_summaries.length, 20)
  assert.equal(paquete.climate.data.campaigns.length, 45)
  assert.ok(paquete.climate.data.period_summaries.every((r) => Number.isFinite(r.value) && r.n_campaigns > 0))
  const inicial = registrosDelEscenario(paquete, escenarioInicial(opciones))
  assert.equal(inicial.length, 9)
  const puntero = leer('paquete/current.json')
  const base = 'paquete/' + puntero.base_path.replace(/^\/+/, '')
  const hash = createHash('sha256').update(readFileSync(resolve(raiz, base, 'data/manifest.json'))).digest('hex')
  assert.equal(hash, puntero.manifest_sha256)
  let escenarios = 0
  for (const periodo of opciones.periodos) for (const enso of opciones.fases)
    for (const presupuesto of opciones.presupuestos) for (const suelo of opciones.suelos) {
      const registros = registrosDelEscenario(paquete, {
        periodo: periodo.period_id, enso: enso.id,
        presupuesto: presupuesto.water_budget_id, suelo: suelo.soil_profile_id,
      })
      assert.equal(registros.length, 9, `Faltan casos: ${periodo.period_id}/${enso.id}/${presupuesto.water_budget_id}/${suelo.soil_profile_id}`)
      assert.equal(new Set(registros.map((r) => r.case_id)).size, 9)
      for (const grupo of ['decision_kpis', 'cycle_kpis']) {
        const orden = ordenarCasos(registros, grupo, { agua: 50, suelo: 50 })
        assert.equal(orden.filas.length, 9)
        if (Math.min(...registros.map((r) => r.n_windows)) < 3) assert.ok(orden.filas.every((f) => f.posicion === null))
      }
      escenarios++
    }
  const registros = paquete.results.data.records
  assert.equal(new Set(registros.map((r) => r.result_id)).size, registros.length, 'result_id debe ser único incluso al cambiar suelo')
  const mensajes = paquete.comunicaciones?.data?.messages ?? []
  assert.equal(mensajes.length, registros.length)
  let audios = 0
  for (const r of registros) {
    assert.equal(r.ranking, null)
    assert.equal(r.coverage_calendar.length, r.n_windows ? 12 : 0)
    assert.ok(r.coverage_calendar.every((m) => Number.isFinite(m.mean_coverage_pct) && Number.isFinite(m.bare_days_mean)))
    const m = mensajes.find((m) => m.result_id === r.result_id)
    assert.ok(m, r.result_id)
    assert.equal(m.build_id, r.build_id)
    assert.equal(m.case_id, r.case_id)
    assert.equal(m.position_id, r.position_id)
    if (m.audio?.path) {
      assert.ok(existsSync(resolve(raiz, urlRelease(paquete, m.audio.path))))
      audios++
    }
  }
  t.diagnostic(`${escenarios} escenarios; ${registros.length} resultados y mensajes; ${audios} MP3 específicos`)
  const boletin = paquete.comunicaciones.data.regional_bulletin
  assert.ok(boletin.audio.path && existsSync(resolve(raiz, urlRelease(paquete, boletin.audio.path))))
  assert.equal(boletin.distribution_status, 'prepared_not_broadcast')
  const quechua = boletin.translations.find((t) => ['que', 'quh', 'quz'].includes(t.language))
  assert.equal(quechua.translation.method, 'human_recording')
  assert.equal(quechua.speaker_review.status, 'approved')
  assert.ok(existsSync(resolve(raiz, urlRelease(paquete, quechua.path))))
  const manifest = structuredClone(paquete.manifiesto)
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => {
    if (String(url).endsWith('manifest.json')) return { ...manifest, build_id: 'otra-corrida' }
    return leer(String(url).replace(/^\.\//, ''))
  } })
  await assert.rejects(cargarFuente('paquete'), /corridas distintas/)
})
