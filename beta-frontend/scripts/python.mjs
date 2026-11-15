import { spawnSync } from 'node:child_process'

// Compartido por la publicación y el ejemplo; evita el alias de Microsoft Store
// cuando Windows ya tiene un python válido en PATH.
export function buscarPython(ejecutar = spawnSync, plataforma = process.platform, preferido = process.env.PYTHON) {
  const candidatos = preferido ? [preferido] : plataforma === 'win32' ? ['python', 'python3'] : ['python3', 'python']
  const errores = []
  for (const candidato of candidatos) {
    const r = ejecutar(candidato, ['--version'], { encoding: 'utf8', timeout: 10000 })
    const version = `${r.stdout || ''} ${r.stderr || ''}`.match(/Python (\d+)\.(\d+)\b/)
    if (r.status === 0 && version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 10))) return candidato
    errores.push(`${candidato}: ${r.error?.message ?? (r.stderr || r.stdout || `código ${r.status}`).trim()}`)
  }
  throw new Error(`No se pudo ejecutar Python 3.10+: ${errores.join('; ')}`)
}
