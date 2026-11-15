// D3-1 · Lectura del paquete precalculado. La web SOLO lee JSON: no calcula ciencia
// ni llama a NASA, NOAA o TTS. Sigue la regla de Dev 2 (CONTRATO-INICIAL.md):
// leer current.json una vez y resolver todo contra su base_path, para no mezclar builds.

export const FUENTES = [
  {
    id: 'paquete',
    carpeta: 'paquete/',
    nombre: 'Paquete publicado por Dev 2',
    ayuda: 'Lo que entrega el publicador oficial (hoy: fixture sin cifras).',
  },
  {
    id: 'ejemplo',
    carpeta: 'ejemplo-ui/',
    nombre: 'Ejemplo de interfaz (cifras inventadas)',
    ayuda: 'Solo para ver gráficas y ranking. No son datos NASA.',
  },
]

export class ErrorDatos extends Error {
  constructor(mensaje, detalle) {
    super(mensaje)
    this.detalle = detalle
  }
}

async function leerJSON(url) {
  let respuesta
  try {
    respuesta = await fetch(url, { cache: 'no-store' })
  } catch {
    throw new ErrorDatos('No se pudo conectar para leer los datos. Revisa tu conexión a internet o a la red local.', url)
  }
  if (!respuesta.ok) {
    throw new ErrorDatos(`Falta un archivo de datos (${respuesta.status}).`, url)
  }
  try {
    return await respuesta.json()
  } catch {
    throw new ErrorDatos('Un archivo de datos está dañado o no es JSON válido.', url)
  }
}

// Archivos opcionales: si faltan, se devuelve null con motivo visible (nunca se inventan).
async function leerOpcional(url) {
  try {
    return { doc: await leerJSON(url), motivo: null }
  } catch (error) {
    return { doc: null, motivo: error.message }
  }
}

export async function cargarFuente(idFuente) {
  const fuente = FUENTES.find((f) => f.id === idFuente) ?? FUENTES[0]
  const raiz = `${import.meta.env.BASE_URL}${fuente.carpeta}`
  const puntero = await leerJSON(`${raiz}current.json`)
  if (!puntero?.base_path) throw new ErrorDatos('El puntero current.json no indica base_path.', raiz)
  const base = raiz + String(puntero.base_path).replace(/^\/+/, '')

  const [catalog, climate, results] = await Promise.all(
    ['catalog', 'climate', 'results'].map((n) => leerJSON(`${base}data/${n}.json`)),
  )
  const comunicaciones = await leerOpcional(`${base}data/communications.json`)
  const manifiesto = await leerOpcional(`${base}data/manifest.json`)

  // Un mismo build_id en todos los archivos: si no coincide, no se mezcla (contrato v3).
  const docs = { catalog, climate, results }
  if (comunicaciones.doc) docs.communications = comunicaciones.doc
  const builds = new Set(Object.values(docs).map((d) => d.build_id))
  if (builds.size !== 1 || !builds.has(puntero.build_id)) {
    throw new ErrorDatos('Los archivos pertenecen a corridas distintas (build_id no coincide). No se muestran para no mezclar.', [...builds].join(', '))
  }

  return {
    fuente,
    puntero,
    base,
    catalog,
    climate,
    results,
    comunicaciones: comunicaciones.doc,
    motivoSinComunicaciones: comunicaciones.motivo,
    manifiesto: manifiesto.doc,
  }
}

// Ruta de un recurso de la release ("/audio/x.mp3" es relativo a base_path).
export function urlRelease(paquete, ruta) {
  if (!ruta) return null
  return paquete.base + String(ruta).replace(/^\/+/, '')
}

// D3 · Naturaleza del paquete para el aviso principal. Nunca presentar fixture como real.
export function naturalezaPaquete(paquete) {
  const modos = new Set([paquete.catalog.mode, paquete.climate.mode, paquete.results.mode])
  if (modos.has('fixture')) {
    const tieneCifras = (paquete.results.data?.records ?? []).some((r) => r.decision_kpis)
    return tieneCifras
      ? { tipo: 'ejemplo', titulo: 'Datos de ejemplo, no NASA', texto: 'Cifras inventadas. No usar para decidir.' }
      : { tipo: 'fixture', titulo: 'Paquete de prueba sin cifras', texto: 'Aún sin datos NASA. Los indicadores salen «no disponible».' }
  }
  if (modos.has('simulated')) {
    return { tipo: 'simulado', titulo: 'Simulación con historia NASA POWER', texto: 'Clima histórico, no una predicción ni una medición de tu parcela.' }
  }
  return { tipo: 'descargado', titulo: 'Datos descargados', texto: 'Datos históricos descargados. No es una predicción.' }
}
