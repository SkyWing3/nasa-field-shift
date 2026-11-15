// D3-2 · Clima histórico (1981–2000) vs reciente (2001–2025): gráfica + TABLA textual.
// Se muestran unidad, periodo, resolución y muestra (n). No se calcula tendencia ni significancia:
// solo se leen los resúmenes que entrega Dev 1. También se listan las campañas y su fase ENSO (ONI NDJ).
import Icono from '../components/Icono.jsx'
import { Aviso, EtiquetaEstado, NoDisponible } from '../components/Comunes.jsx'
import { formatoNumero } from '../lib/dominio.js'

const ICONO_VAR = { precip_campaign: 'lluvia', tmax_mean: 'sol', tmin_mean: 'termometro', frost_days: 'termometro' }

const fmt = (v, u) => (v === null || v === undefined ? null : `${formatoNumero(v, Math.abs(v) < 20 && !Number.isInteger(v) ? 1 : 0)} ${u}`)

// Gráfica de barras horizontales con rango mín–máx. SVG con alternativa textual (role=img + tabla).
function GraficaPeriodos({ filas, periodos, unidad, titulo }) {
  const valores = filas.flatMap((f) => [f.min, f.max, f.value]).filter((v) => typeof v === 'number')
  if (valores.length === 0) return null
  const lo = Math.min(0, ...valores)
  const hi = Math.max(...valores) * 1.08 || 1
  const ancho = 420
  const izq = 118
  const x = (v) => izq + ((v - lo) / (hi - lo)) * (ancho - izq - 80)
  const alto = 34 + filas.length * 56
  const resumenTexto = filas
    .map((f) => {
      const p = periodos.find((q) => q.period_id === f.period_id)
      return f.value === null ? `${p?.label ?? f.period_id}: no disponible` : `${p?.label ?? f.period_id}: media ${fmt(f.value, unidad)}, rango ${fmt(f.min, unidad)} a ${fmt(f.max, unidad)}`
    })
    .join('; ')
  return (
    <svg className="grafica" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}. ${resumenTexto}.`}>
      {filas.map((f, i) => {
        const p = periodos.find((q) => q.period_id === f.period_id)
        const y = 20 + i * 56
        return (
          <g key={f.period_id}>
            <text x="0" y={y + 20} className="g-etiqueta">{(p?.label ?? f.period_id).split(" ")[0]}</text>
            {f.value === null ? (
              <text x={izq} y={y + 20} className="g-vacio">No disponible</text>
            ) : (
              <>
                <rect x={x(lo)} y={y + 4} width={x(f.value) - x(lo)} height="24" rx="5" className={i === 0 ? 'g-barra-antes' : 'g-barra-ahora'} />
                {typeof f.min === 'number' && typeof f.max === 'number' && (
                  <g className="g-rango">
                    <line x1={x(f.min)} x2={x(f.max)} y1={y + 38} y2={y + 38} />
                    <line x1={x(f.min)} x2={x(f.min)} y1={y + 33} y2={y + 43} />
                    <line x1={x(f.max)} x2={x(f.max)} y1={y + 33} y2={y + 43} />
                  </g>
                )}
                <text x={x(f.value) + 6} y={y + 21} className="g-valor">{fmt(f.value, unidad)}</text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TarjetaVariable({ variable, filas, periodos }) {
  const unidad = filas[0]?.unit ?? ''
  const [antes, ahora] = periodos.map((p) => filas.find((f) => f.period_id === p.period_id))
  const ambos = antes?.value !== null && antes?.value !== undefined && ahora?.value !== null && ahora?.value !== undefined
  const diferencia = ambos ? ahora.value - antes.value : null
  return (
    <article className="tarjeta">
      <h3 className="h-sub"><Icono nombre={ICONO_VAR[variable] ?? 'info'} /> {filas[0]?.label ?? variable} <span className="texto-secundario">({unidad})</span></h3>
      <GraficaPeriodos filas={filas} periodos={periodos} unidad={unidad} titulo={filas[0]?.label ?? variable} />
      <p className="leyenda">
        <span className="muestra g-barra-antes" aria-hidden="true" /> Antes
        <span className="muestra g-barra-ahora" aria-hidden="true" /> Ahora
        <span className="muestra-rango" aria-hidden="true" /> Mínimo a máximo
      </p>
      {diferencia !== null ? (
        <p>
          Diferencia: <strong>{diferencia > 0 ? '+' : ''}{fmt(Math.round(diferencia * 10) / 10, unidad)}</strong>{' '}
          <span className="texto-secundario">(varía ±{fmt(antes.sd, unidad)} y ±{fmt(ahora.sd, unidad)} entre campañas). No es tendencia ni causa.</span>
        </p>
      ) : (
        <NoDisponible motivo={filas.find((f) => f.value === null)?.missing_reason ?? 'Falta uno de los periodos.'} />
      )}
    </article>
  )
}

function CampanasEnso({ campanas, periodos, escenario, registros }) {
  const decision = new Set((registros[0]?.windows ?? []).map((w) => w.campaign_years[0]))
  const fases = ['Normal', 'Niño', 'Niña']
  return (
    <section className="tarjeta" aria-labelledby="titulo-enso">
      <h3 id="titulo-enso" className="h-sub">Campañas por tipo de año (ONI de NOAA)</h3>
      <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Conteo de campañas por fase">
        <table className="tabla">
          <caption>Cuántas campañas hubo de cada tipo (n)</caption>
          <thead>
            <tr><th scope="col">Periodo</th>{fases.map((f) => <th key={f} scope="col">{f}</th>)}<th scope="col">Niño fuerte (ONI ≥ 1,5)</th></tr>
          </thead>
          <tbody>
            {periodos.map((p) => {
              const del = campanas.filter((c) => c.period_id === p.period_id && c.complete)
              const fuertes = del.filter((c) => c.strong_nino).length
              return (
                <tr key={p.period_id}>
                  <th scope="row">{p.label}</th>
                  {fases.map((f) => <td key={f}>{del.filter((c) => c.enso_phase === f).length}</td>)}
                  <td>{fuertes}{fuertes < 3 && <strong className="sin-conclusion-texto"> · sin conclusión (n&lt;3)</strong>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <details className="detalle">
        <summary>Ver cada campaña</summary>
        <ul className="lista-campanas">
          {campanas.map((c) => (
            <li key={c.campaign_year} className={`campana f-${(c.enso_phase ?? 'na').toLowerCase().replace('ñ', 'n')}${decision.has(c.campaign_year) ? ' elegida' : ''}`}>
              <span className="campana-ano">{c.label}</span>
              <span>{c.enso_phase ?? 'Sin dato'}{c.strong_nino ? ' fuerte' : ''}</span>
              <span className="texto-secundario">ONI {c.oni_ndj === null || c.oni_ndj === undefined ? '—' : formatoNumero(c.oni_ndj, 1)}</span>
              {decision.has(c.campaign_year) && <span className="sr-only">(año de decisión en el escenario elegido)</span>}
              {!c.complete && <span className="texto-secundario">incompleta</span>}
            </li>
          ))}
        </ul>
        <p className="texto-secundario">
          Borde grueso: años del escenario elegido. ENSO clasifica solo el primer año; no todos los años Niño fueron secos.
        </p>
      </details>
    </section>
  )
}

export default function VistaClima({ paquete, escenario, registros }) {
  const clima = paquete.climate
  const resumenes = clima.data?.period_summaries ?? null
  const campanas = clima.data?.campaigns ?? null
  const periodos = paquete.catalog.data?.periods ?? []
  const variables = resumenes ? [...new Set(resumenes.map((r) => r.variable))] : []
  const meta = resumenes?.[0]

  return (
    <div className="vista">
      <header className="pregunta-guia">
        <h2>¿Cómo fue el clima antes y cómo es ahora en Oruro?</h2>
        <p className="texto-secundario">Campañas de noviembre a marzo. Dato regional NASA, no un pronóstico.</p>
      </header>

      {!resumenes ? (
        <Aviso tipo="alerta" titulo="Resúmenes de clima todavía no disponibles">
          {clima.data?.missing_reason ?? 'El paquete no trae resúmenes por periodo.'}{' '}
          {clima.data?.series?.length ? `Hay ${clima.data.series.length} series diarias, pero falta el resumen por periodo de Dev 1.` : 'Dev 1 debe entregar climate.json con datos NASA POWER.'}
        </Aviso>
      ) : (
        <>
          <dl className="ficha-datos">
            <div><dt>Fuente</dt><dd>{meta?.source_id ?? 'Sin fuente (ejemplo)'} <EtiquetaEstado estado={meta?.nature} /></dd></div>
            <div><dt>Resolución</dt><dd>{meta?.spatial_resolution ?? 'no declarada'}; {meta?.temporal_resolution ?? ''}</dd></div>
            <div><dt>Periodos</dt><dd>{periodos.map((p) => `${p.label}`).join(' y ')}</dd></div>
            <div><dt>Estadístico</dt><dd>{meta?.statistic}</dd></div>
          </dl>
          <div className="rejilla-2">
            {variables.map((v) => (
              <TarjetaVariable key={v} variable={v} filas={resumenes.filter((r) => r.variable === v)} periodos={periodos} />
            ))}
          </div>
          <section className="tarjeta" aria-labelledby="titulo-tabla-clima">
            <h3 id="titulo-tabla-clima" className="h-sub">Tabla del clima</h3>
            <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Tabla de clima por periodo">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Variable</th><th scope="col">Periodo</th><th scope="col">Media</th>
                    <th scope="col">Variación (±1 desv.)</th><th scope="col">Mín – máx</th><th scope="col">Campañas (n)</th><th scope="col">Faltantes</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenes.map((r) => (
                    <tr key={`${r.variable}-${r.period_id}`}>
                      <th scope="row">{r.label} ({r.unit})</th>
                      <td>{periodos.find((p) => p.period_id === r.period_id)?.label ?? r.period_id}</td>
                      <td>{r.value === null ? <span title={r.missing_reason}>No disponible: {r.missing_reason}</span> : fmt(r.value, r.unit)}</td>
                      <td>{fmt(r.sd, r.unit) ?? '—'}</td>
                      <td>{r.min === null ? '—' : `${fmt(r.min, r.unit)} – ${fmt(r.max, r.unit)}`}</td>
                      <td>{r.n_campaigns}</td>
                      <td>{r.n_missing ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {campanas ? (
        <CampanasEnso campanas={campanas} periodos={periodos} escenario={escenario} registros={registros} />
      ) : (
        <Aviso tipo="alerta" titulo="Clasificación ENSO no disponible">El paquete aún no trae el ONI NDJ (NOAA) por campaña.</Aviso>
      )}
    </div>
  )
}
