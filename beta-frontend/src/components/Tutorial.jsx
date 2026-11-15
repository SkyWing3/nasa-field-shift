// Bienvenida (idioma, lectura en voz alta y tutorial) y recorrido guiado.
// Textos: public/tutorial/tutorial.json (fuente: content/tutorial/tutorial.json).
// Audios: public/tutorial/audio/<idioma>/<paso>.mp3 (es, qu, ay, gn; voz sintética
// Meta MMS que requiere revisión de pares). Inglés, portugués y francés usan la
// voz del navegador.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icono from './Icono.jsx'

const base = () => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const tx = (campo, idioma) => campo?.[idioma] ?? campo?.es ?? ''

export function useTutorialDatos() {
  const [datos, setDatos] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const leer = (ruta) => fetch(`${base()}${ruta}`, { signal: controller.signal, cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    Promise.all([leer('tutorial/tutorial.json'), leer('tutorial/audio/manifest.json')]).then(([tutorial, manifiesto]) => {
      if (tutorial?.schema === 'raiz-tutorial-v1') setDatos({ ...tutorial, manifiesto })
    })
    return () => controller.abort()
  }, [])
  return datos
}

/** Texto que se lee en voz alta para un paso (el mismo que usan los MP3). */
export function textoHablado(datos, id, idioma) {
  if (id === 'bienvenida') return `${tx(datos.ui.bienvenida_titulo, idioma)}. ${tx(datos.ui.bienvenida_texto, idioma)}`
  const paso = datos.pasos[id]
  return `${tx(paso.titulo, idioma)}. ${tx(paso.para, idioma)} ${tx(datos.ui.ejemplo_voz, idioma)}: ${tx(paso.ejemplo, idioma)}`
}

/** Lector: MP3 pregenerado si existe; si no, la voz del navegador para ese idioma. */
export function useLector(datos) {
  const audio = useRef(null)
  const detener = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    try { window.speechSynthesis?.cancel() } catch { /* sin voz del navegador */ }
  }, [])
  const leer = useCallback((id, idioma) => {
    detener()
    if (!datos) return null
    const archivo = datos.manifiesto?.archivos?.[idioma]?.[id]?.archivo
    if (archivo) {
      const a = new Audio(`${base()}tutorial/audio/${archivo}`)
      audio.current = a
      a.play().catch(() => {})
      return 'mp3'
    }
    const vozNavegador = datos.idiomas.find((i) => i.id === idioma)?.voz_navegador
    if (vozNavegador && 'speechSynthesis' in window) {
      const frase = new SpeechSynthesisUtterance(textoHablado(datos, id, idioma))
      frase.lang = vozNavegador
      frase.rate = 0.95
      window.speechSynthesis.speak(frase)
      return 'navegador'
    }
    return null
  }, [datos, detener])
  useEffect(() => detener, [detener])
  return { leer, detener }
}

function BotonVoz({ voz, alternar, etiqueta, estado, grande = true }) {
  return (
    <button type="button" className={`boton-voz${grande ? ' grande' : ''}${voz ? ' activa' : ''}`} aria-pressed={voz} onClick={alternar} aria-label={`${etiqueta}: ${estado}`}>
      <Icono nombre={voz ? 'altavoz' : 'silencio'} tam={grande ? 44 : 24} />
    </button>
  )
}

export function Bienvenida({ abierto, datos, idioma, setIdioma, voz, setVoz, conTutorial, setConTutorial, alEmpezar, lector }) {
  const dialogo = useRef(null)
  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (abierto && !d.open) d.showModal()
    else if (!abierto && d.open) d.close()
  }, [abierto])
  if (!datos) return null
  const ui = datos.ui
  const lang = datos.idiomas.some((i) => i.id === idioma) ? idioma : 'es'
  const elegir = (id) => { setIdioma(id); if (voz) lector.leer('bienvenida', id) }
  const alternarVoz = () => {
    if (voz) { setVoz(false); lector.detener() } else { setVoz(true); lector.leer('bienvenida', lang) }
  }
  const entrada = datos.manifiesto?.archivos?.[lang]?.bienvenida
  const tieneMp3 = Boolean(entrada)
  return (
    <dialog ref={dialogo} className="bienvenida" aria-labelledby="bienvenida-titulo" aria-describedby="bienvenida-texto" lang={lang} translate="no"
      onCancel={(e) => { e.preventDefault(); alEmpezar(false) }}>
      <div className="bienvenida-marca" aria-hidden="true"><Icono nombre="planta" tam={34} /> Raíz</div>
      <h2 id="bienvenida-titulo">{tx(ui.bienvenida_titulo, lang)}</h2>
      <p id="bienvenida-texto">{tx(ui.bienvenida_texto, lang)}</p>
      <fieldset className="bienvenida-idiomas">
        <legend>{tx(ui.elige_idioma, lang)}</legend>
        <div className="idiomas-rejilla">
          {datos.idiomas.map((i) => (
            <button key={i.id} type="button" lang={i.id} className={`idioma-opcion${lang === i.id ? ' elegido' : ''}`} aria-pressed={lang === i.id} onClick={() => elegir(i.id)}>
              {i.nombre}{datos.idiomas_con_audio.includes(i.id) && <span className="idioma-audio" aria-hidden="true"><Icono nombre="altavoz" tam={14} /></span>}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="bienvenida-voz">
        <BotonVoz voz={voz} alternar={alternarVoz} etiqueta={tx(ui.voz, lang)} estado={tx(voz ? ui.voz_activada : ui.voz_desactivada, lang)} />
        <div>
          <strong>{tx(ui.voz, lang)}</strong>
          <span>{tx(voz ? ui.voz_activada : ui.voz_desactivada, lang)}</span>
          <small>{tieneMp3 ? `${tx(ui.aviso_audio, lang)} (${entrada.motor ?? 'Meta MMS'})` : tx(ui.aviso_navegador, lang)}</small>
        </div>
      </div>
      <label className="bienvenida-tutorial">
        <input type="checkbox" checked={conTutorial} onChange={(e) => setConTutorial(e.target.checked)} />
        <span className="interruptor" aria-hidden="true" />
        <span>{tx(ui.quiero_tutorial, lang)}</span>
      </label>
      <button type="button" className="boton primario bienvenida-empezar" onClick={() => alEmpezar(conTutorial)}>{tx(ui.empezar, lang)} <span aria-hidden="true">→</span></button>
      {lang !== 'es' && <p className="bienvenida-ia">{tx(ui.aviso_ia, lang)}</p>}
    </dialog>
  )
}

const MARGEN = 10

export function Recorrido({ datos, recorrido, idioma, voz, setVoz, lector, alTerminar }) {
  const pasos = (datos?.recorridos?.[recorrido] ?? []).filter((p) => document.querySelector(p.selector))
  const [indice, setIndice] = useState(0)
  const [rect, setRect] = useState(null)
  const tarjeta = useRef(null)
  const paso = pasos[indice]
  const lang = datos?.idiomas.some((i) => i.id === idioma) ? idioma : 'es'

  useLayoutEffect(() => {
    if (!paso) return undefined
    const el = document.querySelector(paso.selector)
    if (!el) return undefined
    // Desplazamiento instantáneo: el foco queda bien ubicado al instante y hay menos movimiento.
    // Si cabe, el elemento sube cerca del borde superior y deja espacio a la tarjeta debajo.
    const inicial = el.getBoundingClientRect()
    if (inicial.height < window.innerHeight - 380) window.scrollTo({ top: window.scrollY + inicial.top - 90, behavior: 'instant' })
    else el.scrollIntoView({ block: 'start', behavior: 'instant' })
    // Se mide en cada cuadro: sigue el desplazamiento suave y cualquier contenedor con scroll.
    let frame = 0
    const medir = () => {
      const r = el.getBoundingClientRect()
      setRect((previo) => (previo && previo.top === r.top && previo.left === r.left && previo.width === r.width && previo.height === r.height
        ? previo : { top: r.top, left: r.left, width: r.width, height: r.height }))
      frame = requestAnimationFrame(medir)
    }
    medir()
    return () => cancelAnimationFrame(frame)
  }, [paso])

  useEffect(() => {
    if (!paso) return
    tarjeta.current?.focus({ preventScroll: true })
    if (voz) lector.leer(paso.paso, lang)
  }, [paso, voz, lang, lector])

  const terminar = useCallback(() => { lector.detener(); alTerminar() }, [lector, alTerminar])
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') terminar()
      else if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, pasos.length - 1))
      else if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [terminar, pasos.length])

  if (!datos || !paso) return null
  const ui = datos.ui
  const info = datos.pasos[paso.paso]
  const ultimo = indice === pasos.length - 1
  const ancho = window.innerWidth
  const alto = window.innerHeight
  const foco = rect && {
    top: Math.max(rect.top - MARGEN, 6), left: Math.max(rect.left - MARGEN, 6),
    width: Math.min(rect.width + 2 * MARGEN, ancho - 12), height: Math.min(rect.height + 2 * MARGEN, alto - 12),
  }
  const movil = ancho < 700
  const anchoTarjeta = Math.min(420, ancho - 32)
  let posicion = { left: 16, right: 16, bottom: 16 }
  if (foco && !movil) {
    const left = Math.min(Math.max(foco.left, 16), ancho - anchoTarjeta - 16)
    const abajo = alto - (foco.top + foco.height) - 34
    const arriba = foco.top - 34
    if (abajo > 300 && abajo >= arriba) posicion = { top: foco.top + foco.height + 18, left, width: anchoTarjeta, maxHeight: abajo }
    else if (arriba > 300) posicion = { bottom: alto - foco.top + 18, left, width: anchoTarjeta, maxHeight: arriba }
    else posicion = { bottom: 24, right: 24, width: anchoTarjeta }
  }
  const entrada = datos.manifiesto?.archivos?.[lang]?.[paso.paso]
  const tieneMp3 = Boolean(entrada)
  return (
    <div className="recorrido" translate="no" lang={lang}>
      <div className="recorrido-velo" aria-hidden="true" />
      {foco && <div className="recorrido-foco" style={foco} aria-hidden="true"><span className="recorrido-aqui"><span aria-hidden="true">👆</span> {tx(ui.aqui, lang)}</span></div>}
      <section ref={tarjeta} tabIndex={-1} className={`recorrido-tarjeta${movil ? ' movil' : ''}`} style={posicion} role="dialog" aria-modal="true" aria-labelledby="recorrido-titulo" aria-describedby="recorrido-para">
        <header>
          <span className="recorrido-contador">{tx(ui.paso, lang).replace('{n}', indice + 1).replace('{total}', pasos.length)}</span>
          <button type="button" className="recorrido-saltar" onClick={terminar}>{tx(ui.saltar, lang)} ✕</button>
        </header>
        <div className="recorrido-puntos" aria-hidden="true">{pasos.map((p, i) => <span key={p.paso} className={i === indice ? 'actual' : i < indice ? 'hecho' : ''} />)}</div>
        <h2 id="recorrido-titulo">{tx(info.titulo, lang)}</h2>
        <p className="recorrido-etiqueta">{tx(ui.para_que, lang)}</p>
        <p id="recorrido-para">{tx(info.para, lang)}</p>
        <div className="recorrido-ejemplo"><span aria-hidden="true">💡</span><div><p className="recorrido-etiqueta">{tx(ui.ejemplo, lang)}</p><p>{tx(info.ejemplo, lang)}</p></div></div>
        <div className="recorrido-audio">
          <BotonVoz grande={false} voz={voz} alternar={() => { if (voz) { setVoz(false); lector.detener() } else { setVoz(true) } }} etiqueta={tx(ui.voz, lang)} estado={tx(voz ? ui.voz_activada : ui.voz_desactivada, lang)} />
          <button type="button" className="enlace" onClick={() => lector.leer(paso.paso, lang)}>{tx(ui.escuchar, lang)}</button>
          <small>{tieneMp3 ? `${tx(ui.aviso_audio, lang)} (${entrada.motor ?? 'Meta MMS'})` : tx(ui.aviso_navegador, lang)}</small>
        </div>
        <footer>
          <button type="button" className="boton secundario" disabled={indice === 0} onClick={() => setIndice((i) => i - 1)}>← {tx(ui.anterior, lang)}</button>
          <button type="button" className="boton primario" onClick={() => (ultimo ? terminar() : setIndice((i) => i + 1))}>{ultimo ? tx(ui.terminar, lang) : `${tx(ui.siguiente, lang)} →`}</button>
        </footer>
      </section>
    </div>
  )
}
