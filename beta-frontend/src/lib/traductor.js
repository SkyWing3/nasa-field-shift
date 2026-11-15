// Traductor de pantalla: cambia en la página los textos en español que tienen
// traducción en el diccionario del idioma elegido (src/i18n/<código>.json).
// No toca: elementos con translate="no", código, ni bloques marcados lang="es"
// (citas de fuentes, mensajes aprobados, avisos que deben quedar en español).
// Lo que no está en el diccionario queda en español.
import { useEffect } from 'react'
import { DICCIONARIOS } from './idioma.js'

const ATRIBUTOS = ['aria-label', 'title', 'placeholder', 'alt']
const normal = (s) => s.replace(/\s+/g, ' ').trim()
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function crearTraductor(diccionario) {
  const textos = new Map(Object.entries(diccionario?.textos ?? {}).filter(([, v]) => v).map(([k, v]) => [normal(k), v]))
  const patrones = Object.entries(diccionario?.patrones ?? {}).filter(([, v]) => v).map(([origen, destino]) => {
    const nombres = []
    const fuente = origen.split(/(\{[a-z0-9]+\})/i).map((parte) => {
      const m = /^\{([a-z0-9]+)\}$/i.exec(parte)
      if (!m) return escapar(parte)
      nombres.push(m[1])
      return m[1].startsWith('n') ? '([-−+]?\\d[\\d.,]*)' : '(.+?)'
    }).join('')
    return { re: new RegExp(`^${fuente}$`), nombres, destino }
  })
  const traducir = (texto, profundidad = 0) => {
    const limpio = normal(texto)
    if (!limpio) return null
    if (textos.has(limpio)) return textos.get(limpio)
    if (profundidad > 1) return null
    for (const { re, nombres, destino } of patrones) {
      const m = re.exec(limpio)
      if (!m) continue
      return nombres.reduce((salida, nombre, i) => {
        const valor = m[i + 1]
        const final = nombre.startsWith('n') ? valor : traducir(valor, profundidad + 1) ?? valor
        return salida.replace(`{${nombre}}`, final)
      }, destino)
    }
    return null
  }
  return traducir
}

const excluido = (el) => {
  if (!el || el.closest('script,style,code,[translate="no"]')) return true
  const conLang = el.closest('[lang]')
  return Boolean(conLang && conLang !== document.documentElement && conLang.getAttribute('lang') === 'es')
}

export function useTraductorPantalla(idioma) {
  useEffect(() => {
    const diccionario = DICCIONARIOS[idioma]
    if (!diccionario) return undefined
    const traducir = crearTraductor(diccionario)
    const originalesTexto = new Map() // nodo → { original, aplicado }
    const originalesAttr = new Map() // elemento → { [atributo]: { original, aplicado } }
    let aplicando = false

    const textoNodo = (nodo) => {
      if (excluido(nodo.parentElement)) return
      const previo = originalesTexto.get(nodo)
      if (previo && nodo.nodeValue === previo.aplicado) return
      const original = nodo.nodeValue
      const traducido = traducir(original)
      if (traducido == null) { originalesTexto.delete(nodo); return }
      const inicio = original.match(/^\s*/)[0]
      const fin = original.match(/\s*$/)[0]
      const aplicado = inicio + traducido + fin
      originalesTexto.set(nodo, { original, aplicado })
      nodo.nodeValue = aplicado
    }
    const atributos = (el) => {
      if (excluido(el)) return
      for (const nombre of ATRIBUTOS) {
        const valor = el.getAttribute(nombre)
        if (!valor) continue
        const registro = originalesAttr.get(el) ?? {}
        if (registro[nombre]?.aplicado === valor) continue
        const traducido = traducir(valor)
        if (traducido == null) continue
        registro[nombre] = { original: valor, aplicado: traducido }
        originalesAttr.set(el, registro)
        el.setAttribute(nombre, traducido)
      }
    }
    const recorrer = (nodo) => {
      if (nodo.nodeType === Node.TEXT_NODE) { textoNodo(nodo); return }
      if (nodo.nodeType !== Node.ELEMENT_NODE) return
      atributos(nodo)
      const caminante = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      let actual
      while ((actual = caminante.nextNode())) {
        if (actual.nodeType === Node.TEXT_NODE) textoNodo(actual)
        else atributos(actual)
      }
    }

    const elemento = document.body
    const aplicar = (accion) => { aplicando = true; try { accion() } finally { aplicando = false } }
    aplicar(() => recorrer(elemento))
    const observador = new MutationObserver((cambios) => {
      if (aplicando) return
      aplicar(() => {
        for (const c of cambios) {
          if (c.type === 'characterData') textoNodo(c.target)
          else if (c.type === 'attributes') atributos(c.target)
          else c.addedNodes.forEach(recorrer)
        }
      })
    })
    observador.observe(elemento, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS })

    return () => {
      observador.disconnect()
      for (const [nodo, { original, aplicado }] of originalesTexto) if (nodo.nodeValue === aplicado) nodo.nodeValue = original
      for (const [el, registro] of originalesAttr) {
        for (const [nombre, { original, aplicado }] of Object.entries(registro)) if (el.getAttribute(nombre) === aplicado) el.setAttribute(nombre, original)
      }
    }
  }, [idioma])
}
