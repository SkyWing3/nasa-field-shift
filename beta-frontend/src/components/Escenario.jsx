import { etiquetaCampana } from '../lib/dominio.js'

function Control({ label, opciones, valor, cambiar }) {
  return <label className="scenario-control"><span>{label}</span><select value={valor ?? ''} disabled={!opciones.length} onChange={(e) => cambiar(e.target.value)}>{!opciones.length && <option value="">No disponible</option>}{opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
}

export default function Escenario({ opciones, escenario, setEscenario, registros }) {
  const set = (key) => (valor) => setEscenario((prev) => ({ ...prev, [key]: valor }))
  const ventanas = registros[0]?.windows ?? []
  const n = registros[0]?.n_windows ?? 0
  const unicos = registros[0]?.n_unique_campaigns ?? 0
  const presupuesto = opciones.presupuestos.find((b) => b.water_budget_id === escenario.presupuesto)
  const suelo = opciones.suelos.find((s) => s.soil_profile_id === escenario.suelo)
  return (
    <section id="tu-escenario" className="scenario-section no-imprimir" aria-labelledby="titulo-escenario">
      <div className="scenario-band">
        <h2 id="titulo-escenario">Tu escenario</h2>
        <Control label="Periodo" opciones={opciones.periodos.map((p) => ({ id: p.period_id, label: `${p.start_campaign_year}–${p.end_campaign_year}` }))} valor={escenario.periodo} cambiar={set('periodo')} />
        <Control label="Años de referencia" opciones={opciones.fases.map((f) => ({ id: f.id, label: f.corto }))} valor={escenario.enso} cambiar={set('enso')} />
        {opciones.presupuestos.length > 1 ? <Control label="Agua" opciones={opciones.presupuestos.map((b) => ({ id: b.water_budget_id, label: b.label }))} valor={escenario.presupuesto} cambiar={set('presupuesto')} /> : <div className="scenario-fixed"><span>Agua</span><strong>{presupuesto ? presupuesto.water_budget_id === 'secano' ? 'Secano' : presupuesto.label : 'No disponible'}</strong></div>}
        {opciones.suelos.length > 1 ? <Control label="Suelo" opciones={opciones.suelos.map((s) => ({ id: s.soil_profile_id, label: s.label }))} valor={escenario.suelo} cambiar={set('suelo')} /> : <div className="scenario-fixed" title={suelo?.label}><span>Suelo</span><strong>{suelo?.soil_profile_id === 'local-obrajes' ? 'Del productor' : suelo?.label ?? 'No disponible'}</strong>{suelo?.nature === 'scenario_assumption' && <small>Retención supuesta</small>}</div>}
      </div>
      <div className="scenario-evidence" aria-live="polite">
        <p><strong>{n} ventanas históricas</strong> · {unicos} campañas distintas · No es un pronóstico.</p>
        {ventanas.length > 0 && <details><summary>Años evaluados</summary><p>{ventanas.map((w) => etiquetaCampana(w.campaign_years[0])).join(', ')}. Cada ventana abarca tres campañas consecutivas; las ventanas pueden solaparse y no son independientes.</p></details>}
        {n > 0 && n < 3 && <span className="sample-warning">Muestra pequeña: sin conclusión.</span>}
      </div>
    </section>
  )
}
