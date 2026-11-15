// Idiomas de la interfaz de Raíz.
//   npm run idioma -- nuevo <código> "<Nombre en su idioma>"   crea src/i18n/<código>.json para traducir
//   npm run idioma -- revisar                                 lista lo que falta traducir en cada idioma
// El español es el origen: las claves salen de src/lib/idioma.js y de los diccionarios existentes.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = join(raiz, 'src', 'i18n')
const leer = (f) => JSON.parse(readFileSync(join(carpeta, f), 'utf8'))
const diccionarios = readdirSync(carpeta).filter((f) => f.endsWith('.json')).map((f) => [f, leer(f)])

// Claves con nombre: el objeto ES de src/lib/idioma.js.
const fuente = readFileSync(join(raiz, 'src', 'lib', 'idioma.js'), 'utf8')
const bloque = fuente.slice(fuente.indexOf('const ES = {'), fuente.indexOf('\n}\n', fuente.indexOf('const ES = {')))
const claves = [...bloque.matchAll(/^\s{2}([a-z_0-9]+):/gm)].map((m) => m[1])
const union = (campo) => [...new Set(diccionarios.flatMap(([, d]) => Object.keys(d[campo] ?? {})))]
const textos = union('textos')
const patrones = union('patrones')

const [accion, codigo, nombre] = process.argv.slice(2)
if (accion === 'nuevo') {
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(codigo ?? '') || !nombre) {
    console.error('Uso: npm run idioma -- nuevo <código ISO, p. ej. en, gn, pt-BR> "<Nombre>"')
    process.exit(1)
  }
  const destino = join(carpeta, `${codigo}.json`)
  if (existsSync(destino)) { console.error(`Ya existe ${destino}`); process.exit(1) }
  const vacio = (lista) => Object.fromEntries(lista.map((k) => [k, '']))
  const plantilla = {
    _meta: { codigo, nombre, metodo: 'Indicar: traducción humana (quién) o automática con IA (cuál)', estado: 'revision_de_hablante_pendiente', nota: 'El español es la referencia.' },
    claves: vacio(claves), textos: vacio(textos), patrones: vacio(patrones),
  }
  writeFileSync(destino, `${JSON.stringify(plantilla, null, 2)}\n`)
  console.log(`Creado ${destino}: ${claves.length} claves, ${textos.length} textos y ${patrones.length} patrones por traducir.`)
  console.log('Los valores vacíos se muestran en español hasta que se traduzcan.')
} else if (accion === 'revisar') {
  let faltan = 0
  for (const [archivo, d] of diccionarios) {
    const pendientes = [
      ...claves.filter((k) => !d.claves?.[k]).map((k) => `clave ${k}`),
      ...textos.filter((k) => !d.textos?.[k]).map((k) => `texto «${k}»`),
      ...patrones.filter((k) => !d.patrones?.[k]).map((k) => `patrón «${k}»`),
    ].filter((k) => k !== 'clave aviso_otro')
    faltan += pendientes.length
    console.log(`${archivo} (${d._meta?.nombre ?? '?'} · ${d._meta?.estado ?? 'sin estado'}): ${pendientes.length ? `${pendientes.length} pendientes` : 'completo'}`)
    pendientes.slice(0, 15).forEach((p) => console.log(`  - ${p}`))
    if (pendientes.length > 15) console.log(`  … y ${pendientes.length - 15} más`)
  }
  if (faltan) console.log(`
Pendientes en total: ${faltan}. Se muestran en español hasta traducirlos.`)
} else {
  console.log('Uso: npm run idioma -- nuevo <código> "<Nombre>"  |  npm run idioma -- revisar')
}
