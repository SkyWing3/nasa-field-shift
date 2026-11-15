// Contrato frontend/publicador: no necesita instalar dependencias ni consultar proveedores.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { cargarFuente, naturalezaPaquete, urlRelease } from '../src/lib/datos.js'
import { escenarioInicial, opcionesEscenario, registrosDelEscenario, textoCalendario, nombreFuente } from '../src/lib/dominio.js'
import { ordenarCasos } from '../src/lib/ranking.js'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../public')
const leer = (ruta) => JSON.parse(readFileSync(resolve(raiz, ruta), 'utf8'))

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
  const manifest = structuredClone(paquete.manifiesto)
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => {
    if (String(url).endsWith('manifest.json')) return { ...manifest, build_id: 'otra-corrida' }
    return leer(String(url).replace(/^\.\//, ''))
  } })
  await assert.rejects(cargarFuente('paquete'), /corridas distintas/)
})
