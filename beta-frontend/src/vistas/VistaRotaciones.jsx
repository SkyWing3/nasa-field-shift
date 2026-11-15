// Alcance v3.2: comparar seis indicadores, sin ranking ni recomendación de siembra.
import { useMemo, useState } from 'react'
import { Aviso, EtiquetaEstado, FilaKpi, NoDisponible, Secuencia } from '../components/Comunes.jsx'
import { formatoKpi, kpisDisponibles, KPI, nombreCultivo } from '../lib/dominio.js'
import { fmt, metrosCubicos } from '../lib/parcela.js'

const CIFRAS = ['net_irrigation_requirement_mm', 'water_stress_days', 'thermal_exposure_days']

function TarjetaCaso({ registro: r, caso, indicadores, indice, alVerFicha, alVerSuelo, parcela }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <article className={`caso${abierto ? ' caso-abierto' : ''}`} style={{ '--i': indice }} aria-labelledby={`t-${r.result_id}`}>
      <div className="caso-cuerpo">
        <h4 id={`t-${r.result_id}`} className="caso-titulo">{r.case_id} · {nombreCultivo(r.decision_crop)}</h4>
        <Secuencia campanas={caso?.campaigns ?? []} />
      </div>
      <dl className="caso-cifras">
        {CIFRAS.map((k) => {
          const f = formatoKpi(r.decision_kpis?.[k])
          return <div key={k}><dt>{KPI[k].nombre}</dt><dd>{f.vacio ? <span className="cifra-vacia" title={f.motivo}>No disponible</span> : f.texto}<span className="metric-caption">{f.vacio ? 'No aplica o falta el dato' : 'media histórica'}</span>{k === 'net_irrigation_requirement_mm' && !f.vacio && parcela?.ha && Number.isFinite(r.decision_kpis?.[k]?.value) && <span className="metrica-parcela">{`≈ ${fmt(metrosCubicos(r.decision_kpis[k].value, parcela.ha))} m³ en tu parcela`}</span>}</dd></div>
        })}
      </dl>
      <button type="button" className="boton secundario caso-toggle" aria-expanded={abierto} aria-controls={`detalles-${r.result_id}`} aria-label={`${abierto ? 'Ocultar' : 'Ver'} detalles del caso ${r.case_id}`} onClick={() => setAbierto((v) => !v)}>{abierto ? 'Ocultar detalles' : 'Ver detalles'}</button>
      {abierto && <div className="caso-pie" id={`detalles-${r.result_id}`}>
          <h5>Indicadores de la campaña de decisión</h5>
          <div className="kpis">
            {r.decision_kpis ? indicadores.map((k) => <FilaKpi key={k} nombre={k} metrica={r.decision_kpis[k]} />) : <NoDisponible motivo={r.missing_reason} />}
          </div>
        <p className="estados-dato">
          <EtiquetaEstado estado={r.decision_kpis ? 'simulated' : 'not_evaluated'} />
          <span>n = {r.n_windows} ventanas</span>
          <button type="button" className="enlace" onClick={() => alVerSuelo(r.case_id)}>Ver suelo</button>
          <button type="button" className="enlace" onClick={() => alVerFicha(r.case_id)}>Ficha y audio</button>
        </p>
      </div>}
    </article>
  )
}

function TablaCiclo({ registros, casos, indicadores }) {
  return (
    <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Tabla del ciclo completo">
      <table className="tabla">
        <caption>Ciclo de tres campañas históricas: decisión y dos posteriores con su clima real</caption>
        <thead><tr><th scope="col">Caso</th><th scope="col">Secuencia</th>{indicadores.map((k) => <th key={k} scope="col">{KPI[k].nombre}</th>)}</tr></thead>
        <tbody>{registros.map((r) => (
          <tr key={r.result_id}>
            <th scope="row">{r.case_id}</th>
            <td>{(casos.find((c) => c.case_id === r.case_id)?.campaigns ?? []).map(nombreCultivo).join(' → ')}</td>
            {indicadores.map((k) => {
              const m = r.cycle_kpis?.[k]
              const f = formatoKpi(m)
              return <td key={k}>{f.vacio ? <span title={f.motivo}>No disponible</span> : <>{f.texto}{Number.isFinite(m.min) && Number.isFinite(m.max) && <small className="rango-tabla">Rango: {formatoKpi({ value: m.min, unit: m.unit }).texto} a {formatoKpi({ value: m.max, unit: m.unit }).texto}</small>}</>}</td>
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function VistaRotaciones({ paquete, escenario, registros, alVerFicha, alVerSuelo, parcela }) {
  const [filtro, setFiltro] = useState('todos')
  const casos = paquete.catalog.data?.cases ?? []
  const indicadores = kpisDisponibles(paquete)
  const visibles = useMemo(() => registros.filter((r) => filtro === 'todos' || r.decision_crop === filtro), [registros, filtro])
  const faltantes = casos.filter((c) => !registros.some((r) => r.case_id === c.case_id))
  const cultivos = [...new Set(casos.map((c) => c.decision_crop))]
  const n = registros[0]?.n_windows ?? 0
  return (
    <div className="vista">
      <header className="comparison-heading"><h2>Compara las rotaciones</h2><span>{casos.length} casos · 3 secuencias</span></header>
      {n < 3 && <Aviso tipo="alerta" titulo={n === 0 ? 'Sin ventanas comparables' : 'Muestra insuficiente'}>n = {n}. No se concluye una preferencia ni robustez.</Aviso>}
      <fieldset className="grupo-opciones">
        <legend className="sr-only">Cultivo de la campaña de decisión</legend>
        <div className="opciones">{['todos', ...cultivos].map((c) => (
          <label key={c} className={`opcion${filtro === c ? ' activa' : ''}`}>
            <input type="radio" name="filtro-cultivo" checked={filtro === c} onChange={() => setFiltro(c)} />
            <span>{c === 'todos' ? 'Todos' : nombreCultivo(c)}</span>
          </label>
        ))}</div>
      </fieldset>
      <section aria-labelledby="titulo-decision">
        <h3 id="titulo-decision" className="sr-only">Indicadores de la campaña de decisión</h3>
        <div className="comparison-columns" aria-hidden="true"><span>Caso y secuencia</span><span>Agua requerida</span><span>Estrés hídrico</span><span>Helada en floración</span><span /></div>
        <div className="lista-casos">{visibles.map((r, i) => <TarjetaCaso key={r.result_id} registro={r} caso={casos.find((c) => c.case_id === r.case_id)} indicadores={indicadores} indice={i} alVerFicha={alVerFicha} alVerSuelo={alVerSuelo} parcela={parcela} />)}</div>
        {faltantes.length > 0 && <Aviso tipo="alerta" titulo="Casos sin resultado">{faltantes.map((c) => c.case_id).join(', ')}: no hay corrida precalculada.</Aviso>}
      </section>
      <details className="seccion-ciclo detalle">
        <summary>Ver ciclo completo de tres campañas</summary>
        <p className="texto-secundario">Indicadores separados de la campaña de decisión. Menos demanda de agua no implica más producción; Raíz no estima cosecha ni dinero.</p>
        {visibles.length > 0 && <TablaCiclo registros={visibles} casos={casos} indicadores={indicadores} />}
      </details>
    </div>
  )
}
