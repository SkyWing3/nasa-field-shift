// D3-1 · Controles de escenario: ENSO de la campaña de decisión, periodo, presupuesto de agua
// y suelo. Botones de radio nativos (teclado con flechas, lector de pantalla) con tamaño táctil.
// Si el catálogo no trae opciones, el control se muestra desactivado con su motivo.
import Icono from './Icono.jsx'
import { NoDisponible } from './Comunes.jsx'
import { etiquetaCampana } from '../lib/dominio.js'

function GrupoOpciones({ legenda, nombre, opciones, valor, alCambiar, motivoVacio, icono }) {
  return (
    <fieldset className="grupo-opciones">
      <legend>
        {icono && <Icono nombre={icono} tam={20} />} {legenda}
      </legend>
      {opciones.length === 0 ? (
        <NoDisponible motivo={motivoVacio} compacto />
      ) : (
        <div className="opciones">
          {opciones.map((o) => (
            <label key={o.id} className={`opcion${valor === o.id ? ' activa' : ''}`}>
              <input type="radio" name={nombre} value={o.id} checked={valor === o.id} onChange={() => alCambiar(o.id)} />
              {o.icono && <Icono nombre={o.icono} tam={22} />}
              <span>{o.nombre}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

export default function Escenario({ opciones, escenario, setEscenario, registros }) {
  const set = (clave) => (v) => setEscenario((e) => ({ ...e, [clave]: v }))
  const ventanas = registros[0]?.windows ?? []
  const n = registros[0]?.n_windows ?? 0
  const unicos = registros[0]?.n_unique_campaigns ?? 0

  return (
    <section className="panel-escenario" aria-labelledby="titulo-escenario">
      <h2 id="titulo-escenario" className="h-seccion">
        Elige el escenario
      </h2>
      <div className="escenario-grid">
        <GrupoOpciones
          legenda="¿Cómo viene esta campaña?"
          nombre="enso"
          icono="sol"
          opciones={opciones.fases.map((f) => ({ id: f.id, nombre: f.nombre, icono: f.icono }))}
          valor={escenario.enso}
          alCambiar={set('enso')}
          motivoVacio="El paquete todavía no clasifica campañas por ENSO (ONI de NOAA, Dev 1)."
        />
        <GrupoOpciones
          legenda="Periodo"
          nombre="periodo"
          icono="calendario"
          opciones={opciones.periodos.map((p) => ({ id: p.period_id, nombre: p.label ?? `${p.start_campaign_year}–${p.end_campaign_year}` }))}
          valor={escenario.periodo}
          alCambiar={set('periodo')}
          motivoVacio="Sin periodos evaluados en el catálogo (Dev 1)."
        />
        <GrupoOpciones
          legenda="Agua para riego"
          nombre="presupuesto"
          icono="gota"
          opciones={opciones.presupuestos.map((b) => ({ id: b.water_budget_id, nombre: b.label ?? `${b.net_limit_mm} mm` }))}
          valor={escenario.presupuesto}
          alCambiar={set('presupuesto')}
          motivoVacio={opciones.motivoCatalogo ?? 'Sin presupuestos precalculados; control desactivado.'}
        />
      </div>

      <div className="resumen-ventanas" aria-live="polite">
        <p>
          <strong className="cifra">{n}</strong> {n === 1 ? 'año comparable' : 'años comparables'} (n), {unicos} campañas
          {escenario.enso === 'Niño fuerte' && <>. Parte de los años Niño</>}
        </p>
        {ventanas.length > 0 ? (
          <details className="detalle">
            <summary>Años evaluados</summary>
            <p className="texto-secundario">
              {ventanas.map((w) => etiquetaCampana(w.campaign_years[0])).join(', ')}. Cada ventana sigue 3 campañas reales
              seguidas; se solapan, no son independientes.
            </p>
          </details>
        ) : (
          <p className="texto-secundario">Sin años evaluados.</p>
        )}
        {n > 0 && n < 3 && (
          <p className="sin-conclusion">
            <Icono nombre="alerta" tam={20} /> Muestra muy pequeña (n = {n}): <strong>sin conclusión</strong>.
          </p>
        )}
      </div>
    </section>
  )
}
