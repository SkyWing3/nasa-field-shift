import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buscarPython } from './python.mjs'

try {
  const r = spawnSync(buscarPython(), [fileURLToPath(new URL('./generar_ejemplo_ui.py', import.meta.url))], {
    stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' },
  })
  if (r.error) throw r.error
  process.exitCode = r.status ?? 1
} catch (error) {
  console.error(`[ejemplo] ${error.message}`)
  process.exitCode = 1
}
