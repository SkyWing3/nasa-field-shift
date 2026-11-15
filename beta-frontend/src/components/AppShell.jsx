import { useEffect, useRef } from 'react'
import Icono from './Icono.jsx'
import { nombreFuente } from '../lib/dominio.js'
import { IDIOMAS, t } from '../lib/idioma.js'
import { urlSimulacion } from '../lib/simulacion.js'

export const SECCIONES = [
  { id: 'rotaciones', nombre: 'Comparar rotaciones', corto: 'Comparar', icono: 'balanza' },
  { id: 'clima', nombre: 'Clima histórico', corto: 'Clima', icono: 'calendario' },
  { id: 'suelo', nombre: 'Suelo y cobertura', corto: 'Suelo', icono: 'suelo' },
  { id: 'ficha', nombre: 'Ficha y audio', corto: 'Ficha', icono: 'altavoz' },
]

export function AppShell({ paso, irA, abrirConfiguracion, abrirFuentes, abrirTutorial, voz = false, idioma = 'es', setIdioma, children }) {
  return (
    <>
      <a className="saltar" href="#contenido">{t('saltar', idioma)}</a>
      <header className="site-header no-imprimir">
        <div className="place-strip">{t('lugar', idioma)}</div>
        <div className="top-navigation">
        <button type="button" className="brand" onClick={() => irA('rotaciones')} aria-label="Raíz, ir a comparar rotaciones">
          <Icono nombre="planta" tam={40} /><span>Raíz</span>
        </button>
        <nav className="app-nav" aria-label="Navegación principal">
          {SECCIONES.map((s) => <button key={s.id} type="button" onClick={() => irA(s.id)} className={paso === s.id ? 'activa' : ''} aria-label={t(s.id, idioma)} aria-current={paso === s.id ? 'page' : undefined}>
            <span className="nav-full">{t(s.id, idioma)}</span><span className="nav-short">{t(`${s.id}_corto`, idioma)}</span>
          </button>)}
        </nav>
        <div className="header-tools">
          <label className="selector-idioma"><span>{t('idioma', idioma)}</span><select value={idioma} onChange={(e) => setIdioma?.(e.target.value)}>{IDIOMAS.map((i) => <option key={i.id} value={i.id} lang={i.id === 'otro' ? 'es' : i.id}>{i.nombre}</option>)}</select></label>
          {abrirTutorial && <button type="button" className="ver-tutorial" onClick={abrirTutorial}><Icono nombre="altavoz" tam={16} /> {t('tutorial', idioma)}</button>}
          {urlSimulacion(idioma) && <a className="enlace-simulacion" href={urlSimulacion(idioma, voz)} target="_blank" rel="noopener noreferrer" title={t('simulacion_ayuda', idioma)} data-testid="abrir-simulacion">{t('simulacion', idioma)} <span aria-hidden="true">↗</span></a>}
          <button type="button" onClick={abrirFuentes}>{t('fuentes', idioma)}</button>
          <button type="button" onClick={abrirConfiguracion}>{t('configuracion', idioma)}</button>
        </div>
        </div>
      </header>
      {idioma !== 'es' && <p className="aviso-idioma no-imprimir" role="note">{idioma === 'otro' ? t('aviso_otro', 'es') : <><span lang={idioma}>{t('aviso_ia', idioma)}</span> <span lang="es">{t('aviso_ia', 'es')}</span></>}</p>}
      <div className="app-workspace">
        {children}
        <footer className="workspace-footer no-imprimir">{t('pie', idioma)}<button type="button" onClick={abrirFuentes}>{t('limites', idioma)}</button></footer>
      </div>
    </>
  )
}

export function ConfiguracionDialog({ abierto, cerrar, tamano, setTamano, animaciones, setAnimaciones }) {
  const dialogo = useRef(null)
  useEffect(() => {
    if (abierto && !dialogo.current.open) dialogo.current.showModal()
    else if (!abierto && dialogo.current.open) dialogo.current.close()
  }, [abierto])
  return (
    <dialog ref={dialogo} className="sources-dialog settings-dialog" onCancel={cerrar} onClose={cerrar} aria-labelledby="config-titulo" onClick={(e) => { if (e.target === dialogo.current) cerrar() }}>
      <header><h2 id="config-titulo">Configuración</h2><button type="button" className="boton secundario" onClick={cerrar}>Cerrar</button></header>
      <fieldset className="text-size-options" aria-describedby="tamano-ayuda">
        <legend>Tamaño de tipografía</legend>
        <p id="tamano-ayuda">Elige el tamaño que te resulte más cómodo. Cambia el texto en todas las pantallas y se guarda en este navegador.</p>
        {[
          { id: 'normal', nombre: 'Normal', ayuda: 'Tamaño habitual para leer y comparar.' },
          { id: 'grande', nombre: 'Grande', ayuda: 'Texto un 12 % más grande.' },
          { id: 'muy-grande', nombre: 'Muy grande', ayuda: 'Texto un 25 % más grande.' },
        ].map((t) => <label key={t.id} className={`size-option${tamano === t.id ? ' seleccionada' : ''}`}>
          <input type="radio" name="tamano-tipografia" value={t.id} checked={tamano === t.id} onChange={() => setTamano(t.id)} />
          <span><strong>{t.nombre}</strong><small>{t.ayuda}</small></span>
        </label>)}
      </fieldset>
      <p className="type-preview">Más claridad para decidir.</p>
      <label className="motion-preference"><input type="checkbox" checked={animaciones} onChange={(e) => setAnimaciones(e.target.checked)} /><span><strong>Animaciones de la interfaz</strong><small>Entradas suaves y movimiento decorativo. Si tu dispositivo pide reducir el movimiento, respetamos esa preferencia.</small></span></label>
      <button type="button" className="boton primario" onClick={cerrar}>Listo</button>
    </dialog>
  )
}

export function FuentesDialog({ abierto, cerrar, paquete, idFuente, cambiarFuente, fuentes }) {
  const dialogo = useRef(null)
  useEffect(() => {
    if (abierto && !dialogo.current.open) dialogo.current.showModal()
    else if (!abierto && dialogo.current.open) dialogo.current.close()
  }, [abierto])
  const sources = [...new Map([...(paquete?.results.sources ?? []), ...(paquete?.climate.sources ?? [])].map((s) => [typeof s === 'string' ? s : s.source_id, s])).values()]
  return (
    <dialog ref={dialogo} className="sources-dialog" onCancel={cerrar} onClose={cerrar} aria-labelledby="fuentes-titulo" onClick={(e) => { if (e.target === dialogo.current) cerrar() }}>
      <header><h2 id="fuentes-titulo">Datos y fuentes</h2><button type="button" className="boton secundario" onClick={cerrar}>Cerrar</button></header>
      <p>Raíz compara escenarios históricos. Los indicadores son simulaciones sobre clima regional; no son un pronóstico ni una medición de tu campo.</p>
      <label className="selector"><span>Datos que estás explorando</span><select value={idFuente} onChange={(e) => cambiarFuente(e.target.value)}>{fuentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
      {paquete && <>
        <dl className="ficha-datos">{paquete.results.derived_from_build_id && <div><dt>Paquete de cálculo</dt><dd><code>{paquete.results.derived_from_build_id}</code></dd></div>}<div><dt>Versión de la publicación</dt><dd><code>{paquete.puntero.build_id}</code></dd></div><div><dt>Datos hasta</dt><dd>{paquete.results.data_as_of ? new Date(paquete.results.data_as_of).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) : 'Sin fecha: datos de ejemplo'}</dd></div></dl>
        <h3>Procedencia</h3><ul className="source-list">{sources.map((s) => <li key={typeof s === 'string' ? s : s.source_id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{nombreFuente(s)}</a> : nombreFuente(s)}{s.spatial_resolution && <small>{s.spatial_resolution} · {s.temporal_resolution}</small>}</li>)}</ul>
        <h3>Lo que debes tener en cuenta</h3><ul className="lista">{(paquete.results.warnings ?? []).map((w) => <li key={w}>{w}</li>)}</ul>
        <details className="detalle"><summary>Supuestos del modelo</summary><ul className="lista">{(paquete.results.assumptions ?? []).map((a) => <li key={a}>{a}</li>)}</ul></details>
      </>}
    </dialog>
  )
}
