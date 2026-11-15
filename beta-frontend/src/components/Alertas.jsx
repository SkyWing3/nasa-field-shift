// Alarmas de la app: señales preocupantes de los datos, para leer y escuchar.
// Fuente: public/alertas/alertas.json (generado por `python -m raiz_data alarmas`).
// Reglas: el nivel se dice con texto e icono (no solo color); la traducción a
// quechua/aymara es automática con IA y se marca; el audio es voz sintética y
// requiere revisión de pares antes de difundirse.
import { useEffect, useState } from 'react'
import Icono from './Icono.jsx'
import { idiomaTexto } from '../lib/idioma.js'

const ICONOS = { ola: 'lluvia', gota: 'gota', helada: 'termometro', fuego: 'calor' }
const NIVELES = {
  alerta: { clase: 'aviso-peligro', texto: { es: 'Alerta', qu: 'Alerta', ay: 'Alerta', gn: 'Kyhyjerã', en: 'Warning', pt: 'Alerta', fr: 'Alerte' } },
  atencion: { clase: 'aviso-alerta', texto: { es: 'Atención', qu: 'Qhawariy', ay: 'Amuyasim', gn: 'Ejesareko', en: 'Watch', pt: 'Atenção', fr: 'Vigilance' } },
  informacion: { clase: 'aviso-info', texto: { es: 'Información', qu: 'Willakuy', ay: 'Yatiyawi', gn: 'Marandu', en: 'Information', pt: 'Informação', fr: 'Information' } },
}
const UI = {
  es: { titulo: 'Señales de esta semana', escuchar: 'Escuchar en español', fuente: 'Fuente', datos: 'Datos hasta', vigente: 'Vigente hasta', verEs: 'Ver en español' },
  qu: { titulo: 'Kay semanapi willakuykuna', escuchar: 'Castellanopi uyariy', fuente: 'Maymanta', datos: 'Willakuy kama', vigente: 'Kay p’unchaykama', verEs: 'Castellanopi qhaway' },
  ay: { titulo: 'Aka semanan yatiyawinaka', escuchar: 'Castellano arut ist’aña', fuente: 'Kawkitsa', datos: 'Yatiyawi kama', vigente: 'Aka urukama', verEs: 'Castellano arut uñjaña' },
  gn: { titulo: 'Ko semana marandu', escuchar: 'Ehendu castellano-pe', fuente: 'Ijypy', datos: 'Mba’ekuaa peve', vigente: 'Oiko peve', verEs: 'Ehecha castellano-pe' },
  en: { titulo: 'Signals this week', escuchar: 'Listen in Spanish', fuente: 'Source', datos: 'Data up to', vigente: 'Valid until', verEs: 'Show in Spanish' },
  pt: { titulo: 'Sinais desta semana', escuchar: 'Ouvir em espanhol', fuente: 'Fonte', datos: 'Dados até', vigente: 'Válido até', verEs: 'Ver em espanhol' },
  fr: { titulo: 'Signaux de la semaine', escuchar: 'Écouter en espagnol', fuente: 'Source', datos: 'Données jusqu’à', vigente: 'Valable jusqu’au', verEs: 'Voir en espagnol' },
}

const base = () => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const fecha = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function useAlertas() {
  const [datos, setDatos] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${base()}alertas/alertas.json`, { signal: controller.signal, cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.schema === 'raiz-alertas-app-v1') setDatos(json) })
      .catch(() => { /* Sin alarmas publicadas: la app sigue funcionando. */ })
    return () => controller.abort()
  }, [])
  return datos
}

function Alarma({ alarma, idioma, datos }) {
  const [verEs, setVerEs] = useState(false)
  const ui = UI[idioma] ?? UI.es
  const lengua = verEs || !alarma.titulo?.[idioma] ? 'es' : idioma
  const nivel = NIVELES[alarma.nivel] ?? NIVELES.informacion
  const t = (campo) => campo?.[lengua] ?? campo?.es
  const tituloId = `alarma-${alarma.id}`
  return (
    <article className={`aviso alarma ${nivel.clase}`} aria-labelledby={tituloId} lang={lengua}>
      <Icono nombre={ICONOS[alarma.icono] ?? 'alerta'} tam={26} />
      <div className="alarma-cuerpo">
        <p className="alarma-nivel">{nivel.texto[lengua] ?? nivel.texto.es}</p>
        <h3 id={tituloId} className="aviso-titulo">{t(alarma.titulo)}</h3>
        <p>{t(alarma.texto)}</p>
        {alarma.accion && <p className="alarma-accion"><strong>{t(alarma.accion)}</strong></p>}
        {lengua !== 'es' && (
          <p className="alarma-nota" lang="es">
            <Icono nombre="info" tam={16} /> {alarma.traduccion?.metodo ?? datos.aviso_traduccion?.metodo} · revisión de hablante pendiente. {datos.aviso_traduccion?.nota_es}
          </p>
        )}
        {idioma !== 'es' && alarma.titulo?.[idioma] && (
          <button type="button" className="boton-texto" aria-pressed={verEs} onClick={() => setVerEs((v) => !v)}>
            {verEs ? (datos.idiomas?.[idioma] ?? idioma) : ui.verEs}
          </button>
        )}
        {alarma.audio?.es && (
          <div className="alarma-audio">
            <span className="alarma-audio-etiqueta"><Icono nombre="altavoz" tam={18} /> {ui.escuchar}</span>
            <audio controls preload="none" src={`${base()}alertas/${alarma.audio.es}`} aria-label={`${ui.escuchar}: ${alarma.titulo.es}`} />
            <small>{datos.aviso_audio}</small>
          </div>
        )}
        <p className="alarma-meta" lang="es">
          <span>{ui.fuente}: {alarma.fuente}</span>
          {alarma.datos_hasta && <span> · {ui.datos}: {alarma.datos_hasta}</span>}
          {alarma.vigente_hasta && <span> · {ui.vigente}: {fecha(alarma.vigente_hasta)}</span>}
        </p>
      </div>
    </article>
  )
}

export default function Alertas({ idioma: elegido = 'es' }) {
  const idioma = idiomaTexto(elegido)
  const datos = useAlertas()
  if (!datos) return null
  const ahora = Date.now()
  const vigentes = (datos.alertas ?? []).filter((a) => !a.vigente_hasta || new Date(a.vigente_hasta).getTime() >= ahora)
  if (!vigentes.length) return null
  const ui = UI[idioma] ?? UI.es
  return (
    <section className="alarmas" aria-labelledby="alarmas-titulo" aria-live="polite">
      <h2 id="alarmas-titulo" lang={idioma}>{ui.titulo}</h2>
      <p className="texto-secundario">{datos.zona}. {datos.no_es_pronostico}</p>
      {vigentes.map((a) => <Alarma key={a.id} alarma={a} idioma={idioma} datos={datos} />)}
    </section>
  )
}
