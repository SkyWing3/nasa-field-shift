// D3-5 · Ficha imprimible + audio + descarga de texto/MP3, todos del MISMO result_id/caso/posición.
// Si no hay mensaje con el mismo result_id y build_id, NO se reproduce nada como específico.
// El boletín regional general va aparte y se marca «preparado, no emitido».
import { useState } from 'react'
import Icono from '../components/Icono.jsx'
import { Aviso, EtiquetaEstado, FilaKpi, NoDisponible, Secuencia } from '../components/Comunes.jsx'
import { FASES_ENSO, nombreCultivo, ORDEN_KPI } from '../lib/dominio.js'
import { urlRelease } from '../lib/datos.js'

const ESTADO_AUDIO = {
  available: 'Audio revisado',
  available_fixture: 'Audio de prueba (fixture, revisión pendiente)',
  unavailable: 'Audio no disponible',
}
const DISTRIBUCION = {
  prepared_not_broadcast: 'Preparado, no emitido por radio',
  broadcast: 'Emitido por radio',
}

function descargarTexto(nombre, texto) {
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Reproductor: el <audio> se crea SOLO al pulsar (nada suena solo).
function Reproductor({ paquete, audio, etiqueta, idioma }) {
  const [activo, setActivo] = useState(false)
  const src = urlRelease(paquete, audio?.path)
  if (!audio || !src || audio.status === 'unavailable') {
    return <NoDisponible motivo={audio?.reason ?? 'No hay MP3 para este mensaje.'} />
  }
  const duracion = audio.duration_seconds ? `${Math.round(audio.duration_seconds)} s` : ''
  return (
    <div className="reproductor">
      {activo ? (
        <audio controls autoPlay preload="none" src={src} aria-label={`${etiqueta} (${idioma})`} />
      ) : (
        <button type="button" className="boton primario" onClick={() => setActivo(true)}>
          <Icono nombre="play" /> Escuchar {etiqueta} · {idioma} {duracion && `· ${duracion}`}
        </button>
      )}
      <a className="boton secundario" href={src} download>
        <Icono nombre="descargar" /> Descargar MP3
      </a>
      <span className="texto-secundario">{ESTADO_AUDIO[audio.status] ?? audio.status}</span>
    </div>
  )
}

function Traducciones({ paquete, item, etiqueta }) {
  const lista = item.translations ?? []
  if (!lista.length) return null
  return (
    <details className="detalle">
      <summary>Otras lenguas (traducción automática sin revisar)</summary>
      {lista.map((t) => (
        <div key={t.language} className="traduccion">
          <p><strong>{t.language_name ?? t.language}</strong> · <EtiquetaEstado estado="not_evaluated" texto="Revisión de hablante pendiente" /></p>
          <Reproductor paquete={paquete} audio={t} etiqueta={etiqueta} idioma={t.language_name ?? t.language} />
          <p className="texto-equivalente" lang={t.language === 'ayr' ? 'ay' : t.language === 'quh' ? 'qu' : t.language}>{t.text}</p>
          <p className="texto-secundario">{t.translation?.notes}</p>
        </div>
      ))}
    </details>
  )
}

export default function VistaFicha({ paquete, escenario, registros, casoId, setCasoId }) {
  const casos = paquete.catalog.data?.cases ?? []
  const registro = registros.find((r) => r.case_id === casoId) ?? registros[0]
  const caso = casos.find((c) => c.case_id === registro?.case_id)
  const comm = paquete.comunicaciones
  const mensajes = comm?.data?.messages ?? []

  // Coincidencia estricta: mismo result_id, build_id, caso y posición.
  const mensaje = registro
    ? mensajes.find(
        (m) =>
          m.result_id === registro.result_id &&
          m.build_id === registro.build_id &&
          (m.case_id ?? null) === (registro.case_id ?? null) &&
          (m.position_id ?? null) === (registro.position_id ?? null),
      )
    : null
  const boletin = comm?.data?.regional_bulletin ?? null
  const periodo = (paquete.catalog.data?.periods ?? []).find((p) => p.period_id === registro?.period_id)
  const presupuesto = (paquete.catalog.data?.water_budgets ?? []).find((b) => b.water_budget_id === registro?.water_budget_id)
  const fase = FASES_ENSO.find((f) => f.id === registro?.enso_initial_phase)
  const rutaFichaDev2 = mensaje?.print_sheet?.path ? urlRelease(paquete, mensaje.print_sheet.path) : null

  return (
    <div className="vista">
      <header className="pregunta-guia no-imprimir">
        <h2>Ficha para llevar, imprimir o escuchar</h2>
      </header>

      <label className="selector no-imprimir">
        <span>Caso</span>
        <select value={registro?.case_id ?? ''} onChange={(e) => setCasoId(e.target.value)}>
          {casos.map((c) => (
            <option key={c.case_id} value={c.case_id}>{c.case_id} · este año {nombreCultivo(c.decision_crop)}</option>
          ))}
        </select>
      </label>

      {!registro ? (
        <Aviso tipo="alerta" titulo="Sin resultado para este escenario">No hay ficha que mostrar.</Aviso>
      ) : (
        <article className="tarjeta ficha-imprimible" aria-labelledby="titulo-ficha">
          <header className="ficha-cabecera">
            <p className="ficha-marca">Raíz, Oruro. NASA Space Apps 2026</p>
            <h3 id="titulo-ficha">Caso {registro.case_id}: este año {nombreCultivo(registro.decision_crop)}</h3>
            {caso && <Secuencia campanas={caso.campaigns} />}
            <p className="texto-secundario">Identificador del resultado: <code>{registro.result_id}</code> · build <code>{registro.build_id}</code></p>
          </header>

          <dl className="ficha-datos">
            <div><dt>Campaña de decisión</dt><dd>{fase?.nombre ?? 'Sin clasificar'}</dd></div>
            <div><dt>Periodo</dt><dd>{periodo?.label ?? 'No disponible'}</dd></div>
            <div><dt>Agua para riego</dt><dd>{presupuesto?.label ?? 'No disponible'}</dd></div>
            <div><dt>Ventanas (n)</dt><dd>{registro.n_windows}{registro.n_windows > 0 && registro.n_windows < 3 ? ' · sin conclusión' : ''}</dd></div>
          </dl>

          <h4 className="h-sub">Esta campaña</h4>
          <div className="kpis">
            {registro.decision_kpis ? ORDEN_KPI.map((k) => <FilaKpi key={k} nombre={k} metrica={registro.decision_kpis[k]} />) : <NoDisponible motivo={registro.missing_reason} />}
          </div>
          <h4 className="h-sub">Ciclo completo (3 campañas)</h4>
          <div className="kpis">
            {registro.cycle_kpis ? ORDEN_KPI.map((k) => <FilaKpi key={k} nombre={k} metrica={registro.cycle_kpis[k]} />) : <NoDisponible motivo={registro.missing_reason} />}
          </div>

          <h4 className="h-sub">Las tres secuencias comparadas</h4>
          <ul className="lista">
            {(paquete.catalog.data?.rotations ?? []).map((r) => (
              <li key={r.rotation_id}>{r.campaigns.map(nombreCultivo).join(' → ')} <EtiquetaEstado estado={r.baseline_status} />{r.rotation_id === registro.rotation_id && ' · secuencia de esta ficha'}</li>
            ))}
          </ul>

          <h4 className="h-sub">Mensaje de este caso</h4>
          {mensaje ? (
            <>
              <p className="estados-dato">
                <EtiquetaEstado estado="fixture" texto={mensaje.status === 'reviewed' ? 'Revisado' : 'Borrador, revisión pendiente'} />
                <span>{mensaje.editorial_status === 'not_issued' ? 'Sin emisión editorial ni vigencia' : `Vigente hasta ${mensaje.valid_until}`}</span>
              </p>
              <div className="no-imprimir">
                <Reproductor paquete={paquete} audio={mensaje.audio} etiqueta="mensaje" idioma="español" />
              </div>
              <p className="texto-equivalente">{mensaje.text}</p>
              <div className="acciones no-imprimir">
                <button type="button" className="boton secundario" onClick={() => descargarTexto(`${registro.result_id}.txt`, mensaje.text)}>
                  <Icono nombre="texto" /> Descargar texto
                </button>
                {rutaFichaDev2 && (
                  <a className="boton secundario" href={rutaFichaDev2} target="_blank" rel="noreferrer">
                    <Icono nombre="imprimir" /> Ficha oficial de Dev 2
                  </a>
                )}
              </div>
              <div className="no-imprimir"><Traducciones paquete={paquete} item={mensaje} etiqueta="mensaje" /></div>
            </>
          ) : (
            <Aviso tipo="alerta" titulo="Sin mensaje para este resultado">
              No hay ficha/audio con el identificador <code>{registro.result_id}</code>
              {paquete.motivoSinComunicaciones ? ` (${paquete.motivoSinComunicaciones})` : ''}. No se reproduce el audio de otro caso como si fuera este.
            </Aviso>
          )}

          <h4 className="h-sub">Límites</h4>
          <ul className="lista">
            {(paquete.results.warnings ?? []).map((w) => <li key={w}>{w}</li>)}
            {(paquete.results.assumptions ?? []).map((a) => <li key={a}>Supuesto: {a}</li>)}
            <li>No es predicción ni orden de siembra. No estima cosecha, dinero ni erosión.</li>
            <li>Dato regional NASA, no de la finca. Decide el agricultor.</li>
          </ul>
          <p className="texto-secundario">Fuentes: {(paquete.results.sources ?? []).length ? paquete.results.sources.map((s) => `${s.agency} ${s.product}`).join('; ') : 'ninguna fuente real en este paquete'}.</p>

          <div className="acciones no-imprimir">
            <button type="button" className="boton primario" onClick={() => window.print()}>
              <Icono nombre="imprimir" /> Imprimir ficha
            </button>
          </div>
        </article>
      )}

      <section className="tarjeta boletin no-imprimir" aria-labelledby="titulo-boletin">
        <h3 id="titulo-boletin" className="h-sub">Boletín regional (no es de tu caso)</h3>
        {boletin?.text ? (
          <>
            <p className="estados-dato">
              <EtiquetaEstado estado="not_evaluated" texto={DISTRIBUCION[boletin.distribution_status] ?? boletin.distribution_status} />
              <span>{boletin.reason}</span>
            </p>
            <Reproductor paquete={paquete} audio={boletin.audio} etiqueta="boletín regional" idioma="español" />
            <p className="texto-equivalente">{boletin.text}</p>
            <button type="button" className="boton secundario" onClick={() => descargarTexto('boletin-regional.txt', boletin.text)}>
              <Icono nombre="texto" /> Descargar texto del boletín
            </button>
            <Traducciones paquete={paquete} item={boletin} etiqueta="boletín" />
          </>
        ) : (
          <NoDisponible motivo={boletin?.reason ?? 'El paquete no trae boletín regional.'} />
        )}
      </section>
    </div>
  )
}
