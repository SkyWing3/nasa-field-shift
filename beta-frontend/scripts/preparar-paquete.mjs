// D3-1 / D3-5 · Prepara public/paquete/ con el paquete OFICIAL de Dev 2.
// No edita ni recalcula nada: ejecuta el publicador de Dev 2 (raiz_delivery)
// y copia su sitio (current.json + releases/<build_id>/) tal cual.
//
// Uso:  node scripts/preparar-paquete.mjs [--entrada ruta] [--audio ruta] [--si-falla-continuar]
//   --entrada  carpeta con catalog/climate/results (por defecto el fixture v3.1 de Dev 2)
//   --audio    carpeta de MP3 de Dev 2 (por defecto assets/audio/fixture-dev2-v31-demo)
// Cuando Dev 1 entregue datos reales: --entrada <carpeta de Dev 1> --audio <MP3 de Dev 2>.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const audio = valor('--audio', join(dev2, 'assets', 'audio', buildId ?? 'fixture-dev2-v31-demo'))
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

const candidatos = process.env.PYTHON ? [process.env.PYTHON] : process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
const intentos = []
let python
for (const p of candidatos) {
  const resultado = spawnSync(p, ['--version'], { encoding: 'utf8', timeout: 10000 })
  intentos.push({ p, resultado })
  if (resultado.status === 0 && /Python 3\.(?:1[0-9]|[2-9][0-9])\b/.test(resultado.stdout || resultado.stderr || '')) {
    python = p
    break
  }
}
if (!python) salir(`No se pudo ejecutar Python 3.10+: ${intentos.map(({ p, resultado: r }) => `${p}: ${r.error?.message ?? (r.stderr || r.stdout || `código ${r.status}`).trim()}`).join('; ')}`)

const tmp = mkdtempSync(join(tmpdir(), 'raiz-paquete-'))
try {
  const correr = (pasos) => {
    const r = spawnSync(python, ['-m', 'raiz_delivery', ...pasos], {
      cwd: dev2, encoding: 'utf-8', env: { ...process.env, PYTHONUTF8: '1' },
    })
    process.stdout.write(r.stdout || '')
    if (r.status !== 0) throw new Error(`Falló «${pasos[0]}» de Dev 2: ${r.error?.message ?? (r.stderr || '').trim()}`)
  }
  const build = ['build', '--input', entrada, '--output', join(tmp, 'package')]
  if (existsSync(audio)) build.push('--audio-assets', audio)
  correr(build)
  correr(['publish', '--package', join(tmp, 'package'), '--site-root', join(tmp, 'site')])
  console.log(`[paquete] Entrada: ${entrada}`)
  rmSync(destino, { recursive: true, force: true })
  cpSync(join(tmp, 'site'), destino, { recursive: true })
  console.log(`[paquete] Listo: ${destino}`)
} catch (error) {
  console.warn(`[paquete] ${error.message}`)
  if (continuar) console.warn('[paquete] Continúo sin regenerar: la web mostrará el paquete previo o «paquete no disponible».')
  else process.exitCode = 1
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

