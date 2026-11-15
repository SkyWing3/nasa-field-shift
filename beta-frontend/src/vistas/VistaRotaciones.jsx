// D3-3 · Comparador de los 9 casos (3 secuencias × 3 posiciones) para la campaña de decisión.
// ARRIBA: KPI de la campaña de decisión y su orden. DEBAJO: KPI del ciclo y..y+2, orden aparte.
// Nunca se mezclan en un solo ranking. Prioridad = pesos de agua/suelo con normalización explícita.
import { useMemo, useState } from 'react'
import Icono from '../components/Icono.jsx'
import { Aviso, EtiquetaEstado, FilaKpi, NoDisponible, Secuencia } from '../components/Comunes.jsx'
import { CULTIVOS, FASES_ENSO, formatoKpi, KPI, letraSecuencia, nombreCultivo } from '../lib/dominio.js'
import { GRUPOS_PRIORIDAD, nivelesRelativos, ordenarCasos, PRIORIDADES, RIESGOS } from '../lib/ranking.js'

const KPI_TARJETA = [
  'net_irrigation_requirement_mm',
  'water_stress_days',
  'planned_coverage_pct',
  'bare_rain_exposure_days',
  'bare_wind_exposure_days',
  'thermal_exposure_days',
  'constraint_pass_frequency',
]

function Prioridad({ pesos, setPesos }) {
  const activa = PRIORIDADES.find((p) => p.pesos.agua === pesos.agua && p.pesos.suelo === pesos.suelo)?.id
  return (
    <section className="prioridad" aria-labelledby="titulo-prioridad">
      <h3 id="titulo-prioridad" className="h-sub">¿Qué te importa más este año?</h3>
      <div className="opciones" role="group" aria-label="Prioridad">
        {PRIORIDADES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`boton-opcion${activa === p.id ? ' activa' : ''}`}
            aria-pressed={activa === p.id}
            onClick={() => setPesos(p.pesos)}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      <details className="detalle">
        <summary>Ajustar pesos</summary>
        {Object.entries(GRUPOS_PRIORIDAD).map(([id, g]) => (
          <label key={id} className="deslizador">
            <span>{g.nombre}: <strong>{pesos[id]}</strong></span>
            <input
              type="range" min="0" max="100" step="10" value={pesos[id]}
              onChange={(e) => setPesos({ ...pesos, [id]: Number(e.target.value) })}
            />
          </label>
        ))}
      </details>
    </section>
  )
}

function ComoSeOrdena({ resultado, grupoKpi }) {
  const pesos = resultado.metodo.pesos
  return (
    <details className="detalle">
      <summary>Cómo se ordena</summary>
      <ul className="lista">
        <li>Solo se comparan los casos de <strong>este mismo escenario</strong> (mismas ventanas históricas).</li>
        <li>Cada indicador se lleva a una escala de 0 a 1 con el mínimo y máximo de los casos comparables (min–max). 1 = mejor.</li>
        <li>Si todos los casos tienen el mismo valor en un indicador, ese indicador no los separa.</li>
        <li>Si a un caso le falta un indicador con peso, queda <strong>sin puntaje</strong> (no se le regala ventaja).</li>
        <li>Puntajes iguales comparten posición (empate). Un empate o un orden que no cambia es un resultado válido.</li>
        <li>Con menos de 3 ventanas históricas no se ordena: sin conclusión.</li>
      </ul>
      <table className="tabla">
        <caption>Pesos aplicados ({grupoKpi === 'decision_kpis' ? 'campaña de decisión' : 'ciclo completo'})</caption>
        <thead><tr><th scope="col">Indicador</th><th scope="col">Mejor si es</th><th scope="col">Peso</th><th scope="col">Rango usado</th></tr></thead>
        <tbody>
          {Object.entries(pesos).map(([m, p]) => (
            <tr key={m}>
              <th scope="row">{KPI[m]?.nombre ?? m}</th>
              <td>{p.direccion === 'minimize' ? 'menor' : 'mayor'}</td>
              <td>{Math.round(p.peso * 10) / 10}</td>
              <td>{resultado.rangos?.[m] ? `${resultado.rangos[m].min} – ${resultado.rangos[m].max}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function EstadoOrden({ resultado }) {
  if (resultado.estado === 'ok') return null
  const tipo = resultado.estado === 'todos_empatados' ? 'info' : 'alerta'
  const titulos = {
    sin_registros: 'Comparación desactivada',
    sin_ventanas: 'Comparación desactivada',
    muestra_insuficiente: 'Sin conclusión',
    pesos_invalidos: 'Prioridad sin peso',
    sin_comparables: 'Sin orden posible',
    todos_empatados: 'Empate entre todos',
  }
  return <Aviso tipo={tipo} titulo={titulos[resultado.estado]}>{resultado.motivo}</Aviso>
}

// Cifras que se ven sin abrir nada; el resto va en «Todos los indicadores».
const CIFRAS = [
  ['net_irrigation_requirement_mm', 'Riego que haría falta'],
  ['water_stress_days', 'Días con falta de agua'],
  ['planned_coverage_pct', 'Suelo cubierto'],
]

// Un caso = una fila del registro. La primera posición lleva borde dorado e insignia.
const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Línea de tiempo del año agrícola (ago→jul): meses con cultivo en pie, según el calendario del paquete.
function LineaTiempo({ calendario }) {
  if (!calendario?.length) return null
  const conCultivo = calendario.filter((m) => m.cover === 'crop')
  const texto = conCultivo.length ? `Cultivo en pie de ${MES[conCultivo[0].month]} a ${MES[conCultivo.at(-1).month]}` : 'Sin cultivo en pie este año'
  return (
    <div className="linea-tiempo">
      <p>{texto}</p>
      <ol aria-hidden="true">
        {calendario.map((m) => <li key={m.month} className={`lt-${m.cover}`}><span>{MES[m.month][0]}</span></li>)}
      </ol>
    </div>
  )
}

function TarjetaCaso({ fila, caso, resultado, niveles, indice, alVerFicha, alVerSuelo }) {
  const r = fila.registro
  const ganador = resultado.estado === 'ok' && fila.posicion === 1
  const empate = fila.empatadoCon?.length > 0
  const cultivo = caso?.decision_crop ?? r.decision_crop
  return (
    <article className={`caso${ganador ? ' ganador' : ''}`} style={{ '--i': indice }} aria-labelledby={`t-${r.result_id}`}>
      <p className={`caso-pos${fila.posicion ? '' : ' sin'}`}>
        {fila.posicion ? <><span className="sr-only">Posición </span>{fila.posicion}º</> : <span aria-label="Sin posición">–</span>}
      </p>
      <div className="caso-cuerpo">
        {ganador && <p className="insignia-oro">{empate ? 'Empatado en primer lugar' : 'Mejor según tus prioridades'}</p>}
        <h4 id={`t-${r.result_id}`} className="caso-titulo">{nombreCultivo(cultivo)} este año</h4>
        <p className="caso-meta">Caso {r.case_id}</p>
        {!ganador && empate && <p className="nota-empate">Empate con {fila.empatadoCon.join(', ')}</p>}
        {fila.faltantes?.length > 0 && (
          <p className="nota-empate">Sin puntaje: falta {fila.faltantes.map((m) => KPI[m]?.nombre ?? m).join(', ')}</p>
        )}
        <Secuencia campanas={caso?.campaigns ?? []} />
      </div>
      {r.decision_kpis ? (
        <dl className="caso-cifras">
          {CIFRAS.map(([m, etiqueta]) => {
            const f = formatoKpi(r.decision_kpis[m])
            const barra = fila.detalle?.[m]?.normalizado
            return (
              <div key={m}>
                <dt>{etiqueta}</dt>
                <dd>
                  {f.vacio ? <span className="cifra-vacia" title={f.motivo}>No disponible</span> : f.texto}
                  {barra !== undefined && barra !== null && !f.vacio && (
                    <span className="cifra-barra" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.round(barra * 100))}%` }} /></span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <div className="caso-cifras"><NoDisponible motivo={r.missing_reason} /></div>
      )}
      {niveles && Object.values(niveles).some(Boolean) && (
        <ul className="niveles" aria-label="Riesgo frente a los otros casos">
          {RIESGOS.map((riesgo) => {
            const nv = niveles[riesgo.id]
            return (
              <li key={riesgo.id} className={nv?.clase ?? 's-sin'}>
                <Icono nombre={riesgo.icono} tam={20} />
                <span>{riesgo.nombre}</span>
                <strong>{nv ? <><Icono nombre={nv.icono} tam={15} /> {nv.texto}</> : 'Sin dato'}</strong>
              </li>
            )
          })}
        </ul>
      )}
      <div className="caso-pie">
        {r.decision_kpis && (
          <details className="detalle">
            <summary>Más indicadores</summary>
            <div className="kpis">
              {KPI_TARJETA.map((m) => <FilaKpi key={m} nombre={m} metrica={r.decision_kpis[m]} />)}
            </div>
            <LineaTiempo calendario={r.coverage_calendar} />
            <p className="texto-secundario">Barra más larga = mejor.</p>
          </details>
        )}
        <p className="estados-dato">
          <EtiquetaEstado estado={r.decision_kpis ? 'simulated' : 'not_evaluated'} />
          <span>n = {r.n_windows} ventanas</span>
          <button type="button" className="enlace" onClick={() => alVerSuelo(r.case_id)}>Ver suelo</button>
          <button type="button" className="enlace" onClick={() => alVerFicha(r.case_id)}>Ficha y audio</button>
        </p>
      </div>
    </article>
  )
}

function TablaCiclo({ resultado, casos }) {
  const cols = ['net_irrigation_requirement_mm', 'water_stress_days', 'planned_coverage_pct', 'bare_rain_exposure_days', 'bare_wind_exposure_days', 'constraint_pass_frequency']
  return (
    <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Tabla del ciclo completo">
      <table className="tabla">
        <caption>Ciclo completo de 3 campañas (este año y los dos siguientes, con su clima histórico real)</caption>
        <thead>
          <tr>
            <th scope="col">Orden</th>
            <th scope="col">Caso</th>
            <th scope="col">Secuencia</th>
            {cols.map((c) => <th key={c} scope="col">{KPI[c].nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {resultado.filas.map((f) => {
            const caso = casos.find((c) => c.case_id === f.registro.case_id)
            return (
              <tr key={f.registro.result_id} className={resultado.estado === 'ok' && f.posicion === 1 ? 'fila-oro' : ''}>
                <td>{f.posicion ? `${f.posicion}º${f.empatadoCon?.length ? ' (empate)' : ''}` : f.faltantes?.length ? 'sin puntaje' : '—'}</td>
                <th scope="row">{f.registro.case_id}</th>
                <td>{(caso?.campaigns ?? []).map(nombreCultivo).join(' → ')}</td>
                {cols.map((c) => {
                  const v = formatoKpi(f.registro.cycle_kpis?.[c])
                  return <td key={c}>{v.vacio ? <span className="texto-secundario" title={v.motivo}>No disponible</span> : v.texto}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function VistaRotaciones({ paquete, escenario, registros, alVerFicha, alVerSuelo }) {
  const [pesos, setPesos] = useState(PRIORIDADES[0].pesos)
  const [filtro, setFiltro] = useState('todos')
  const casos = paquete.catalog.data?.cases ?? []
    const fase = FASES_ENSO.find((f) => f.id === escenario.enso)

  const visibles = useMemo(
    () => registros.filter((r) => filtro === 'todos' || r.decision_crop === filtro),
    [registros, filtro],
  )
  const decision = useMemo(() => ordenarCasos(visibles, 'decision_kpis', pesos), [visibles, pesos])
  const ciclo = useMemo(() => ordenarCasos(visibles, 'cycle_kpis', pesos), [visibles, pesos])
  const niveles = useMemo(() => nivelesRelativos(registros), [registros])

  // Casos sin registro en este escenario: se listan como faltantes, no se inventan.
  const faltantes = casos.filter((c) => !registros.some((r) => r.case_id === c.case_id))
  const cultivosDecision = [...new Set(casos.map((c) => c.decision_crop))]

  return (
    <div className="vista">
      <header className="pregunta-guia">
        <h2>
          Si la campaña de decisión es {fase?.corto ?? 'sin clasificar'}, ¿qué conviene en la parcela este año?
        </h2>
        <p className="texto-secundario">
          9 casos comparados con años pasados. <strong>No es una predicción</strong>: la decisión es tuya.
        </p>
      </header>

      <p className="nota-margen">
        Secuencias candidatas <EtiquetaEstado estado="assumed" /> Falta confirmar el orden en la parcela y el riego.
      </p>

      <Prioridad pesos={pesos} setPesos={setPesos} />

      <fieldset className="grupo-opciones">
        <legend>Cultivo de este año</legend>
        <div className="opciones">
          {['todos', ...cultivosDecision].map((c) => (
            <label key={c} className={`opcion${filtro === c ? ' activa' : ''}`}>
              <input type="radio" name="filtro-cultivo" checked={filtro === c} onChange={() => setFiltro(c)} />
              <span>{c === 'todos' ? 'Todos' : nombreCultivo(c)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="titulo-decision">
        <h3 id="titulo-decision" className="h-seccion">Esta campaña, el año de decisión</h3>
        <EstadoOrden resultado={decision} />
        {decision.n >= 3 && <p className="texto-secundario">Riesgo Bajo, Medio o Alto: comparado con los otros casos, en años pasados.</p>}
        <div className="lista-casos">
          {decision.filas.map((f, i) => (
            <TarjetaCaso
              key={f.registro.result_id}
              fila={f}
              caso={casos.find((c) => c.case_id === f.registro.case_id)}
              resultado={decision}
              niveles={niveles[f.registro.case_id]}
              indice={i}
              alVerFicha={alVerFicha}
              alVerSuelo={alVerSuelo}
            />
          ))}
        </div>
        {faltantes.length > 0 && (
          <Aviso tipo="alerta" titulo="Casos sin resultado en este escenario">
            {faltantes.map((c) => c.case_id).join(', ')}: no hay corrida precalculada. No se muestran cifras.
          </Aviso>
        )}
        {decision.metodo && decision.estado !== 'sin_registros' && <ComoSeOrdena resultado={decision} grupoKpi="decision_kpis" />}
      </section>

      <section aria-labelledby="titulo-ciclo" className="seccion-ciclo">
        <h3 id="titulo-ciclo" className="h-seccion">Ciclo completo de 3 campañas</h3>
        <p className="texto-secundario">Orden aparte: los tres años juntos.</p>
        <EstadoOrden resultado={ciclo} />
        {registros.length > 0 && <TablaCiclo resultado={ciclo} casos={casos} />}
      </section>

      <Aviso tipo="info" titulo="Recuerda">
        No predice cosecha ni dinero. Dato regional, no de tu chacra. Consulta a tu técnico.
      </Aviso>
    </div>
  )
}

