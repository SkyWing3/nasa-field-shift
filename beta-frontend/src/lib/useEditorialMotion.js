import { useEffect, useState } from 'react'

const CONSULTA = '(prefers-reduced-motion: reduce)'

/** true si el sistema operativo pide reducir el movimiento (p. ej. Windows con animaciones desactivadas). */
export function useReduccionSistema() {
  const [reduce, setReduce] = useState(() => window.matchMedia?.(CONSULTA).matches ?? false)
  useEffect(() => {
    const consulta = window.matchMedia?.(CONSULTA)
    if (!consulta) return undefined
    const cambiar = () => setReduce(consulta.matches)
    consulta.addEventListener('change', cambiar)
    return () => consulta.removeEventListener('change', cambiar)
  }, [])
  return reduce
}

// Entradas de sección de 600 ms y paralaje breve; los valores científicos no se animan.
// forzar: la persona pidió movimiento aunque el sistema pida reducirlo; solo se mueve la franja, lento.
export default function useEditorialMotion(habilitado, pagina, paquete, forzar = false) {
  useEffect(() => {
    const preferencia = window.matchMedia(CONSULTA)
    let limpiar = () => {}
    const preparar = () => {
      limpiar()
      if (habilitado && preferencia.matches && forzar) { document.documentElement.dataset.motion = 'forced'; return }
      const activo = habilitado && !preferencia.matches
      document.documentElement.dataset.motion = activo ? 'on' : 'off'
      if (!activo) return
      const principal = document.getElementById('contenido')
      if (!principal || !('IntersectionObserver' in window)) return
      const vistos = new WeakSet()
      const entradas = new Set()
      const observador = new IntersectionObserver((items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue
          item.target.dataset.reveal = 'visible'
          observador.unobserve(item.target)
        }
      }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
      const registrar = () => {
        principal.querySelectorAll('.scenario-band,.comparison-heading,.caso,.vista > .tarjeta,.rejilla-2 > .tarjeta,.pregunta-guia').forEach((el, i) => {
          if (vistos.has(el)) return
          vistos.add(el)
          entradas.add(el)
          el.style.setProperty('--reveal-delay', `${Math.min(i % 4, 3) * 65}ms`)
          el.dataset.reveal = 'waiting'
          observador.observe(el)
        })
      }
      registrar()
      const cambios = new MutationObserver(registrar)
      cambios.observe(principal, { childList: true, subtree: true })
      const portada = principal.querySelector('.page-intro')
      let frame = 0
      const desplazar = () => {
        if (frame || !portada) return
        frame = requestAnimationFrame(() => {
          frame = 0
          const rect = portada.getBoundingClientRect()
          if (rect.bottom >= 0 && rect.top <= window.innerHeight) portada.style.setProperty('--hero-shift', `${Math.max(-22, Math.min(22, -rect.top * .08))}px`)
        })
      }
      window.addEventListener('scroll', desplazar, { passive: true })
      limpiar = () => {
        observador.disconnect()
        cambios.disconnect()
        window.removeEventListener('scroll', desplazar)
        cancelAnimationFrame(frame)
        portada?.style.removeProperty('--hero-shift')
        entradas.forEach((el) => { delete el.dataset.reveal; el.style.removeProperty('--reveal-delay') })
      }
    }
    preparar()
    preferencia.addEventListener('change', preparar)
    return () => { limpiar(); preferencia.removeEventListener('change', preparar) }
  }, [habilitado, pagina, paquete, forzar])
}
