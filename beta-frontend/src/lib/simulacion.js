// Enlace a la simulación 3D (TerraLab, carpeta simulacion/).
// VITE_RAIZ_SIMULACION_URL la fija para un despliegue; en desarrollo se usa el
// servidor local del 3D (puerto 5173). Sin URL, el enlace no se muestra.
const configurada = import.meta.env.VITE_RAIZ_SIMULACION_URL?.trim()
export const URL_SIMULACION = configurada || (import.meta.env.DEV ? 'http://localhost:5173/' : null)

export function urlSimulacion(idioma, voz = false) {
  if (!URL_SIMULACION) return null
  try {
    const url = new URL(URL_SIMULACION)
    if (idioma && idioma !== 'otro') url.searchParams.set('idioma', idioma)
    if (voz) url.searchParams.set('voz', 'si')
    return url.href
  } catch {
    return null
  }
}
