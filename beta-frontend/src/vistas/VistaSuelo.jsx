// D3-4 · Calendario de cobertura + semáforo de suelo descubierto + panel de sensibilidad y calidad.
// El semáforo usa CONTEOS de días y el umbral del catálogo; nunca toneladas de erosión.
// El color nunca va solo: cada nivel lleva forma (●▲■) y palabra.
import Icono from '../components/Icono.jsx'
import { Aviso, EtiquetaEstado, NoDisponible, Secuencia } from '../components/Comunes.jsx'
import { formatoKpi, nombreCultivo } from '../lib/dominio.js'

const MESES = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' }
const COBERTURA = {
  bare: { texto: 'Suelo desnudo', clase: 'cob-desnudo', icono: 'desnudo' },
  crop: { texto: 'Cultivo', clase: 'cob-cultivo', icono: 'planta' },
  residue: { texto: 'Rastrojo', clase: 'cob-rastrojo', icono: 'rastrojo' },
  fallow_vegetation: { texto: 'Descanso con plantas', clase: 'cob-descanso', icono: 'hoja' },
}

// Nivel del semáforo a partir de días expuestos (lluvia + viento, mostrados por separado).
export function nivelSemaforo(dias, umbral) {
  if (dias === null || dias === undefined || !umbral) return null
  if (dias <= umbral.green_max_days) return { id: 'bajo', texto: 'Bajo', icono: 'nivel-bajo', clase: 's-bajo' }
  if (dias <= umbral.yellow_max_days) return { id: 'medio', texto: 'Medio', icono: 'nivel-medio', clase: 's-medio' }
  return { id: 'alto', texto: 'Alto', icono: 'nivel-alto', clase: 's-alto' }
}

function Semaforo({ registro, umbral }) {
  const lluvia = registro.decision_kpis?.bare_rain_exposure_days
  const viento = registro.decision_kpis?.bare_wind_exposure_days
  const fila = (etiqueta, icono, metrica) => {
    const nivel = nivelSemaforo(metrica?.value, umbral)
    const f = formatoKpi(metrica)
    return (
      <div className={`semaforo-fila ${nivel?.clase ?? 's-sin'}`}>
        <Icono nombre={icono} />
        <span className="semaforo-etiqueta">{etiqueta}</span>
        <span className="semaforo-nivel">
          {nivel ? <><Icono nombre={nivel.icono} tam={16} /> Riesgo {nivel.texto}</> : 'Sin nivel'}
        </span>
        <span className="semaforo-valor">{f.vacio ? <NoDisponible motivo={f.motivo} compacto /> : f.texto}</span>
      </div>
    )
  }
  return (
    <div className="semaforo" aria-label="Semáforo de suelo descubierto">
      {fila('Suelo desnudo con lluvia fuerte', 'lluvia', lluvia)}
      {fila('Suelo desnudo con viento fuerte', 'viento', viento)}
    </div>
  )
}

function Calendario({ registro }) {
  const meses = registro.coverage_calendar
  if (!meses?.length) {
    return <NoDisponible motivo={registro.calendar ? `Solo hay descripción: «${registro.calendar}»` : 'El paquete no trae calendario de cobertura mensual.'} />
  }
  return (
    <>
      <ol className="calendario" aria-label="Cobertura del suelo mes a mes, de agosto a julio">
        {meses.map((m) => {
          const c = COBERTURA[m.cover] ?? { texto: 'Sin dato', clase: 'cob-sin', icono: 'info' }
          return (
            <li key={m.month} className={`mes ${c.clase}`}>
              <span className="mes-nombre">{MESES[m.month]}</span>
              <span className="mes-marca"><Icono nombre={c.icono} tam={20} /></span>
              <span className="mes-texto">{c.texto}</span>
            </li>
          )
        })}
      </ol>
      <p className="leyenda">
        {Object.values(COBERTURA).map((c) => (
          <span key={c.clase} className={`leyenda-item ${c.clase}`}><Icono nombre={c.icono} tam={16} /> {c.texto}</span>
        ))}
      </p>
      {registro.calendar && <p className="texto-secundario">Calendario declarado: {registro.calendar}</p>}
    </>
  )
}

export default function VistaSuelo({ paquete, registros, casoId, setCasoId }) {
  const casos = paquete.catalog.data?.cases ?? []
  const umbral = paquete.catalog.data?.rules?.bare_soil ?? null
  const registro = registros.find((r) => r.case_id === casoId) ?? registros[0]
  const caso = casos.find((c) => c.case_id === registro?.case_id)
  const suelo = (paquete.catalog.data?.soil_profiles ?? []).find((s) => s.soil_profile_id === registro?.soil_profile_id)
  const punto = paquete.catalog.data?.analysis_point

  return (
    <div className="vista">
      <header className="pregunta-guia">
        <h2>¿Cuándo queda el suelo sin protección?</h2>
        <p className="texto-secundario">Días de suelo desnudo con lluvia o viento fuertes. No mide erosión.</p>
      </header>

      <label className="selector">
        <span>Caso a revisar</span>
        <select value={registro?.case_id ?? ''} onChange={(e) => setCasoId(e.target.value)}>
          {casos.map((c) => (
            <option key={c.case_id} value={c.case_id}>
              {c.case_id} · este año {nombreCultivo(c.decision_crop)} ({c.campaigns.map(nombreCultivo).join(' → ')})
            </option>
          ))}
        </select>
      </label>

      {!registro ? (
        <Aviso tipo="alerta" titulo="Sin resultados">No hay registros para este escenario.</Aviso>
      ) : (
        <>
          <section className="tarjeta" aria-labelledby="titulo-cal">
            <h3 id="titulo-cal" className="h-sub">Calendario de cobertura, caso {registro.case_id}</h3>
            {caso && <Secuencia campanas={caso.campaigns} />}
            <Calendario registro={registro} />
          </section>

          <section className="tarjeta" aria-labelledby="titulo-sem">
            <h3 id="titulo-sem" className="h-sub">Semáforo de suelo descubierto</h3>
            <Semaforo registro={registro} umbral={umbral} />
            {umbral ? (
              <p className="texto-secundario">
                Umbral: lluvia ≥ {umbral.rain_threshold_mm} mm/día o viento ≥ {umbral.wind_threshold_m_s} m/s. Niveles: Bajo hasta {umbral.green_max_days} días,
                Medio hasta {umbral.yellow_max_days} días, Alto más. Fuente: {umbral.source} <EtiquetaEstado estado={umbral.nature} />
              </p>
            ) : (
              <NoDisponible motivo="El catálogo no define umbrales del semáforo (P6). Se muestran solo los conteos, sin color." />
            )}
          </section>

          <section className="tarjeta" aria-labelledby="titulo-sem-todos">
            <h3 id="titulo-sem-todos" className="h-sub">Los 9 casos de un vistazo</h3>
            <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Semáforo de los 9 casos">
              <table className="tabla">
                <thead><tr><th scope="col">Caso</th><th scope="col">Este año</th><th scope="col">Con lluvia</th><th scope="col">Con viento</th></tr></thead>
                <tbody>
                  {registros.map((r) => {
                    const celda = (m) => {
                      const f = formatoKpi(m)
                      const n = nivelSemaforo(m?.value, umbral)
                      return <td className={n?.clase}>{f.vacio ? 'No disponible' : <>{n && <><Icono nombre={n.icono} tam={14} /> </>}{f.texto}{n && ` · ${n.texto}`}</>}</td>
                    }
                    return (
                      <tr key={r.result_id}>
                        <th scope="row"><button type="button" className="enlace" onClick={() => setCasoId(r.case_id)}>{r.case_id}</button></th>
                        <td>{nombreCultivo(r.decision_crop)}</td>
                        {celda(r.decision_kpis?.bare_rain_exposure_days)}
                        {celda(r.decision_kpis?.bare_wind_exposure_days)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tarjeta" aria-labelledby="titulo-calidad">
            <h3 id="titulo-calidad" className="h-sub">Sensibilidad y calidad de la evidencia</h3>
            <dl className="ficha-datos">
              <div>
                <dt>Sensibilidad entre fuentes</dt>
                <dd>
                  <EtiquetaEstado estado={registro.sensitivity_status === 'not_evaluated' ? 'not_evaluated' : 'simulated'} texto={registro.sensitivity_status === 'not_evaluated' ? 'No evaluado' : 'Evaluado'} />{' '}
                  {registro.sensitivity_reason ?? ''}
                </dd>
              </div>
              <div><dt>Ventanas históricas (n)</dt><dd>{registro.n_windows} (campañas distintas: {registro.n_unique_campaigns}). Las ventanas se solapan.</dd></div>
              <div><dt>Punto de análisis</dt><dd>{punto?.region} · {punto?.location_status === 'validated_plot' ? 'parcela validada' : 'punto regional sin confirmar'} {punto?.missing_reason && `(${punto.missing_reason})`}</dd></div>
              <div><dt>Suelo</dt><dd>{suelo ? <>{suelo.label ?? suelo.soil_profile_id} <EtiquetaEstado estado={suelo.nature} /></> : 'No disponible'}</dd></div>
              <div><dt>Inicio del balance</dt><dd>{registro.initialization ?? 'No declarado'}</dd></div>
              <div><dt>Revisión de campo</dt><dd><EtiquetaEstado estado="not_evaluated" texto="Sin validación de campo" /></dd></div>
            </dl>
                      </section>
        </>
      )}
    </div>
  )
}
