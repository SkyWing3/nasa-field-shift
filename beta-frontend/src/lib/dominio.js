// D3-1 / D3-3 · Modelo de dominio y textos para productor y técnico.
// Aquí solo hay etiquetas, formato y filtros; ningún cálculo científico.

export const FASES_ENSO = [
  { id: 'Normal', nombre: 'Año normal', corto: 'Normal', icono: 'sol' },
  { id: 'Niño', nombre: 'Año de El Niño', corto: 'El Niño', icono: 'calor' },
  { id: 'Niña', nombre: 'Año de La Niña', corto: 'La Niña', icono: 'lluvia' },
  { id: 'Niño fuerte', nombre: 'El Niño fuerte (ONI ≥ 1,5)', corto: 'Niño fuerte', icono: 'calor' },
]

export const CULTIVOS = {
  papa: { nombre: 'Papa', clase: 'c-papa' },
  quinua: { nombre: 'Quinua', clase: 'c-quinua' },
  haba: { nombre: 'Haba', clase: 'c-haba' },
  descanso: { nombre: 'Descanso', clase: 'c-descanso' },
}

export const nombreCultivo = (id) => CULTIVOS[id]?.nombre ?? id ?? 'no disponible'

// Dev 2 publica el calendario por cultivo; los fixtures antiguos usaban texto.
export function textoCalendario(calendario) {
  if (typeof calendario === 'string') return calendario
  if (!calendario || typeof calendario !== 'object') return null
  return Object.entries(calendario)
    .filter(([, detalle]) => typeof detalle === 'string')
    .map(([cultivo, detalle]) => `${nombreCultivo(cultivo)}: ${detalle}`)
    .join('; ') || null
}

export const nombreFuente = (fuente) => typeof fuente === 'string'
  ? fuente
  : [fuente?.agency, fuente?.product].filter(Boolean).join(' · ') || fuente?.source_id || 'Fuente sin nombre'

// KPI del contrato v3.1 traducidos a lenguaje de campo.
export const KPI = {
  net_irrigation_requirement_mm: {
    nombre: 'Riego que haría falta', icono: 'gota', mejor: 'menos', clase: 'k-agua',
    ayuda: 'Agua neta que faltaría para el cultivo. 1 mm = 10 m³ por hectárea.',
  },
  net_irrigation_applied_mm: {
    nombre: 'Riego dentro del presupuesto', icono: 'gota', mejor: null, clase: 'k-agua',
    ayuda: 'Lo que se podría aplicar sin pasar el límite de agua elegido.',
  },
  water_stress_days: {
    nombre: 'Días con falta de agua', icono: 'planta', mejor: 'menos', clase: 'k-agua',
    ayuda: 'Días en que el cultivo sufre por poca humedad en el suelo.',
  },
  planned_coverage_pct: {
    nombre: 'Suelo cubierto', icono: 'planta', mejor: 'más', clase: 'k-cultivo',
    ayuda: 'Parte del año con plantas o rastrojo protegiendo el suelo (según calendario).',
  },
  bare_rain_exposure_days: {
    nombre: 'Suelo desnudo con lluvia fuerte', icono: 'lluvia', mejor: 'menos', clase: 'k-suelo',
    ayuda: 'Días en que el suelo está descubierto y llueve sobre el umbral. Es un conteo, no toneladas de erosión.',
  },
  bare_wind_exposure_days: {
    nombre: 'Suelo desnudo con viento fuerte', icono: 'viento', mejor: 'menos', clase: 'k-suelo',
    ayuda: 'Días en que el suelo está descubierto y el viento supera el umbral.',
  },
  thermal_exposure_days: {
    nombre: 'Helada en floración', icono: 'termometro', mejor: 'menos', clase: 'k-frio',
    ayuda: 'Días con temperatura mínima bajo el umbral declarado para floración. Dato regional, no helada medida en tu chacra.',
  },
  constraint_pass_frequency: {
    nombre: 'Ventanas que cumplen las reglas', icono: 'check', mejor: 'más', clase: 'k-cultivo',
    ayuda: 'Frecuencia histórica de cumplimiento de las reglas declaradas en el paquete. No es una garantía futura.',
  },
}

export const ORDEN_KPI = Object.keys(KPI)

export const KPI_V32 = ['net_irrigation_requirement_mm', 'water_stress_days', 'thermal_exposure_days', 'bare_rain_exposure_days', 'bare_wind_exposure_days', 'planned_coverage_pct']
export function kpisDisponibles(paquete) {
  const declarados = paquete.catalog.data?.presentation?.kpis ?? KPI_V32
  return KPI_V32.filter((k) => declarados.includes(k))
}

const UNIDADES = { mm: 'mm', days: 'días', '%': '%', fraction: '' }

const numero = (v, dec = 0) =>
  new Intl.NumberFormat('es-BO', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v)

// Formato de un KPI. null → «no disponible» + motivo (nunca 0 silencioso).
export function formatoKpi(metrica) {
  if (!metrica || typeof metrica.value !== 'number' || !Number.isFinite(metrica.value)) {
    return { texto: 'No disponible', motivo: metrica?.missing_reason ?? 'Dato ausente en el paquete', vacio: true }
  }
  if (metrica.unit === 'fraction') {
    const { numerator: a, denominator: b } = metrica
    return { texto: Number.isFinite(a) && Number.isFinite(b) && b > 0 ? `${a} de ${b} ventanas` : numero(metrica.value * 100) + ' %', vacio: false }
  }
  const dec = Math.abs(metrica.value) < 10 && !Number.isInteger(metrica.value) ? 1 : 0
  return { texto: `${numero(metrica.value, dec)} ${UNIDADES[metrica.unit] ?? metrica.unit}`.trim(), vacio: false }
}

export const formatoNumero = numero

// Etiqueta de estado de un dato (descargado / simulado / supuesto / no evaluado / ejemplo).
export const ESTADOS = {
  downloaded: { texto: 'Descargado', clase: 'e-descargado' },
  simulated: { texto: 'Simulado', clase: 'e-simulado' },
  assumed: { texto: 'Supuesto', clase: 'e-supuesto' },
  scenario_assumption: { texto: 'Supuesto', clase: 'e-supuesto' },
  map_estimate: { texto: 'Estimado de mapa', clase: 'e-supuesto' },
  measured: { texto: 'Medido', clase: 'e-descargado' },
  not_evaluated: { texto: 'No evaluado', clase: 'e-noevaluado' },
  fixture: { texto: 'Ejemplo', clase: 'e-ejemplo' },
  confirmed: { texto: 'Confirmado', clase: 'e-descargado' },
}

// D3-1 · Opciones de escenario a partir del catálogo; si la lista está vacía el control
// se desactiva con motivo (no se ofrecen valores que el modelo no evaluó).
export function opcionesEscenario(paquete) {
  const cat = paquete.catalog.data ?? {}
  const registros = paquete.results.data?.records ?? []
  const fasesConDatos = new Set(registros.map((r) => r.enso_initial_phase).filter(Boolean))
  const suelosConDatos = new Set(registros.map((r) => r.soil_profile_id))
  const presupuestosConDatos = new Set(registros.map((r) => r.water_budget_id))
  return {
    periodos: cat.periods ?? [],
    presupuestos: (cat.water_budgets ?? []).filter((b) => presupuestosConDatos.has(b.water_budget_id)),
    suelos: (cat.soil_profiles ?? []).filter((s) => suelosConDatos.has(s.soil_profile_id)),
    fases: FASES_ENSO.filter((f) => fasesConDatos.has(f.id)),
    motivoCatalogo: cat.missing_reason ?? null,
  }
}

export function escenarioInicial(opciones) {
  return {
    periodo: opciones.periodos.at(-1)?.period_id ?? null,
    enso: opciones.fases.find((f) => f.id === 'Niño')?.id ?? opciones.fases[0]?.id ?? null,
    presupuesto: opciones.presupuestos[0]?.water_budget_id ?? null,
    suelo: opciones.suelos[0]?.soil_profile_id ?? null,
  }
}

// D3-3 · El escenario FILTRA corridas precalculadas: periodo, ENSO de decisión,
// presupuesto y suelo seleccionan registros existentes; no se simula nada.
export function registrosDelEscenario(paquete, esc) {
  return (paquete.results.data?.records ?? []).filter(
    (r) =>
      (r.period_id ?? null) === esc.periodo &&
      (r.enso_initial_phase ?? null) === esc.enso &&
      (r.water_budget_id ?? null) === esc.presupuesto &&
      (r.soil_profile_id ?? null) === esc.suelo,
  )
}

export function casosOrdenados(paquete) {
  return paquete.catalog.data?.cases ?? []
}

export const letraSecuencia = (caso) => String(caso?.case_id ?? '').split('-')[0] || '?'

export function etiquetaCampana(y) {
  return `${y}–${String(y + 1).slice(-2)}`
}
