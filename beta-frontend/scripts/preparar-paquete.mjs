// D3-1 / D3-5 · Prepara public/paquete/ con el paquete OFICIAL de Dev 2.
// No edita ni recalcula nada: ejecuta el publicador de Dev 2 (raiz_delivery)
// y publica su sitio (current.json + releases/<build_id>/) tal cual.
//
// Uso:  node scripts/preparar-paquete.mjs [--entrada ruta] [--audio ruta] [--si-falla-continuar]
//   --entrada  carpeta con catalog/climate/results (datos/ si existe; si no, fixture v3.1)
//   --audio    carpeta de MP3 de Dev 2 (por defecto assets/audio/<build_id>)
// Cuando Dev 1 entregue datos reales: --entrada <carpeta de Dev 1> --audio <MP3 de Dev 2>.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buscarPython } from './python.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(aqui, '..')
const dev2 = resolve(frontend, '..', 'raiz-hackaton')
const args = process.argv.slice(2)
const valor = (nombre, defecto) => {
  const i = args.indexOf(nombre)
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : defecto
}
const continuar = args.includes('--si-falla-continuar')
const entradaReal = join(dev2, 'datos')
const hayDatosReales = ['catalog', 'climate', 'results'].every((n) => existsSync(join(entradaReal, `${n}.json`)))
const entrada = valor('--entrada', hayDatosReales ? entradaReal : join(dev2, 'fixtures', 'dev2-v31'))
let buildId
try {
  buildId = JSON.parse(readFileSync(join(entrada, 'catalog.json'), 'utf8')).build_id
} catch {
  // La validación y el mensaje de error corresponden al publicador oficial.
}
const audioPublicado = join(dev2, 'assets', 'audio', `${buildId}-publicacion`)
const audio = valor('--audio', existsSync(join(audioPublicado, 'catalog.json')) ? audioPublicado : join(dev2, 'assets', 'audio', buildId ?? 'fixture-dev2-v31-demo'))
const editorialPublicado = join(dev2, 'publicacion', 'editorial.json')
const editorial = valor('--editorial', existsSync(editorialPublicado) ? editorialPublicado : null)
const destino = join(frontend, 'public', 'paquete')

function salir(mensaje) {
  console.warn(`[paquete] ${mensaje}`)
  if (continuar) {
    console.warn('[paquete] Continúo sin regenerar: la web mostrará el paquete previo o «paquete no disponible».')
    process.exit(0)
  }
  process.exit(1)
}

if (!existsSync(join(dev2, 'raiz_delivery'))) salir(`No encuentro ${dev2}/raiz_delivery (módulo de Dev 2).`)
if (!existsSync(entrada)) salir(`No existe la entrada ${entrada}`)

let python
try {
  python = buscarPython()
} catch (error) {
  salir(error.message)
}

const tmp = mkdtempSync(join(tmpdir(), 'raiz-paquete-'))
try {
  const correr = (pasos, modulo = 'raiz_delivery') => {
    const r = spawnSync(python, ['-m', modulo, ...pasos], {
      cwd: dev2, encoding: 'utf-8', env: { ...process.env, PYTHONUTF8: '1' },
    })
    process.stdout.write(r.stdout || '')
    if (r.status !== 0) throw new Error(`Falló «${pasos[0]}» de Dev 2: ${r.error?.message ?? (r.stderr || '').trim()}`)
  }
  const modo = JSON.parse(readFileSync(join(entrada, 'catalog.json'), 'utf8')).mode
  if (modo !== 'fixture' && existsSync(join(dev2, 'raiz_data', 'web.py'))) {
    const pasos = ['--input', entrada, '--site-root', destino]
    if (existsSync(join(audio, 'catalog.json'))) pasos.push('--audio-assets', audio)
    else console.warn('[paquete] No hay catálogo de audio para esta entrada; los mensajes indicarán audio no disponible.')
    if (editorial) pasos.push('--editorial', editorial)
    correr(pasos, 'raiz_data.web')
  } else {
    const build = ['build', '--input', entrada, '--output', join(tmp, 'package')]
    if (existsSync(join(audio, 'catalog.json'))) build.push('--audio-assets', audio)
    if (editorial) build.push('--editorial', editorial)
    correr(build)
    // El publicador conserva las releases y cambia current.json atómicamente.
    correr(['publish', '--package', join(tmp, 'package'), '--site-root', destino])
  }
  console.log(`[paquete] Entrada: ${entrada}`)
  console.log(`[paquete] Listo: ${destino}`)
} catch (error) {
  console.warn(`[paquete] ${error.message}`)
  if (continuar) console.warn('[paquete] Continúo sin regenerar: la web mostrará el paquete previo o «paquete no disponible».')
  else process.exitCode = 1
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
