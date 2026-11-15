// Parcela elegida en la simulación 3D (TerraLab). Llega por la URL desde el botón
// «Comparar rotaciones» (?parcela=…&lat=…&lon=…&ha=…), redondeada a 0,01° (≈1 km),
// y se recuerda en este navegador. Solo se usa para personalizar: distancia al punto
// de los datos y conversión del riego (mm) a metros cúbicos para su superficie.
const CLAVE = 'raiz-parcela'
const ZONA_KM = 25 // mitad de la celda NASA POWER (~50 km)

const numero = (v, min, max) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function validarParcela(p) {
  if (!p) return null
  const lat = numero(p.lat, -90, 90)
  const lon = numero(p.lon, -180, 180)
  if (lat === null || lon === null) return null
  const ha = numero(p.ha, 0.0001, 100000)
  const nombre = String(p.nombre ?? '').trim().slice(0, 80) || 'Mi parcela'
  return { nombre, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, ha }
}

export function leerParcela() {
  const q = new URLSearchParams(window.location.search)
  const deUrl = validarParcela({ nombre: q.get('parcela'), lat: q.get('lat'), lon: q.get('lon'), ha: q.get('ha') })
  try {
    if (deUrl) { localStorage.setItem(CLAVE, JSON.stringify(deUrl)); return deUrl }
    return validarParcela(JSON.parse(localStorage.getItem(CLAVE) ?? 'null'))
  } catch { return deUrl }
}

export function olvidarParcela() {
  try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
}

/** Distancia en km sobre la esfera (haversine). */
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export const dentroDeZona = (km) => km <= ZONA_KM

/** 1 mm de lámina sobre 1 ha = 10 m³. */
export const metrosCubicos = (mm, ha) => (Number.isFinite(mm) && Number.isFinite(ha) ? mm * 10 * ha : null)

export const fmt = (n, dec = 0) => n.toLocaleString('es-BO', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
