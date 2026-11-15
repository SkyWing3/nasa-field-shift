// Piezas comunes: etiquetas de estado, datos ausentes y avisos.
// D3 · Regla de honestidad: todo dato lleva su estado y lo ausente se muestra con motivo.
import Icono from './Icono.jsx'
import { ESTADOS, formatoKpi, KPI } from '../lib/dominio.js'

export function EtiquetaEstado({ estado, texto }) {
  const def = ESTADOS[estado] ?? { texto: texto ?? estado ?? 'Sin estado', clase: 'e-noevaluado' }
  return <span className={`etiqueta ${def.clase}`}>{texto ?? def.texto}</span>
}

export function NoDisponible({ motivo, compacto }) {
  return (
    <span className={`no-disponible${compacto ? ' compacto' : ''}`}>
      <Icono nombre="info" tam={18} />
      <span>
        <strong>No disponible.</strong> {motivo ?? 'Dato ausente en el paquete.'}
      </span>
    </span>
  )
}

export function Aviso({ tipo = 'info', titulo, children, icono }) {
  const iconos = { info: 'info', alerta: 'alerta', ok: 'check', peligro: 'alerta' }
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'peligro' ? 'alert' : undefined}>
      <Icono nombre={icono ?? iconos[tipo]} tam={22} />
      <div>
        {titulo && <p className="aviso-titulo">{titulo}</p>}
        <div className="aviso-cuerpo">{children}</div>
      </div>
    </div>
  )
}

// Fila de KPI: icono + nombre en lenguaje de campo + valor + estado + motivo si falta.
export function FilaKpi({ nombre, metrica, barra }) {
  const def = KPI[nombre]
  const f = formatoKpi(metrica)
  return (
    <div className={`fila-kpi ${def?.clase ?? ''}`}>
      <span className="fila-kpi-icono"><Icono nombre={def?.icono ?? 'info'} tam={20} /></span>
      <span className="fila-kpi-nombre">
        {def?.nombre ?? nombre}
        
      </span>
      <span className="fila-kpi-valor">
        {f.vacio ? <NoDisponible motivo={f.motivo} compacto /> : f.texto}
      </span>
      {barra !== undefined && barra !== null && !f.vacio && (
        <span className="fila-kpi-barra" aria-hidden="true"><span style={{ width: `${Math.round(barra * 100)}%` }} /></span>
      )}
    </div>
  )
}

// Franja de rotación: los 3 años de la secuencia como tramos contiguos de una misma parcela.
const CUANDO = ['Este año', 'Año 2', 'Año 3']
export function Secuencia({ campanas }) {
  return (
    <ol className="franja" aria-label={`Secuencia: ${campanas.join(', luego ')}`}>
      {campanas.map((c, i) => (
        <li key={i} className={`franja-tramo c-${c}${i === 0 ? ' actual' : ''}`}>
          <span className="franja-cuando">{CUANDO[i] ?? `Año ${i + 1}`}</span>
          <span className="franja-cultivo">{c.charAt(0).toUpperCase() + c.slice(1)}</span>
        </li>
      ))}
    </ol>
  )
}

