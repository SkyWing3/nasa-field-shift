// D3-3 · Reordenar casos ya calculados según la prioridad del usuario.
// Reglas explícitas (contrato v3.1, sección ranking):
//  - normalización min–max entre los casos COMPARABLES del mismo escenario;
//  - dirección por métrica (menos riego es mejor, más cobertura es mejor);
//  - si falta una métrica ponderada, el caso queda SIN puntaje (no_rank_if_missing):
//    nunca se mejora una puntuación por omitir un KPI;
//  - si todos los casos tienen el mismo valor en una métrica, esa métrica no separa (empate);
//  - empates exactos comparten posición (1, 1, 3);
//  - n = 0 → sin ventanas, sin ranking; n < 3 → sin conclusión.
//  - decisión (decision_kpis) y ciclo (cycle_kpis) se ordenan POR SEPARADO.

export const GRUPOS_PRIORIDAD = {
  agua: {
    nombre: 'Cuidar el agua',
    metricas: [
      ['net_irrigation_requirement_mm', 'minimize'],
      ['water_stress_days', 'minimize'],
    ],
  },
  suelo: {
    nombre: 'Proteger el suelo',
    metricas: [
      ['planned_coverage_pct', 'maximize'],
      ['bare_rain_exposure_days', 'minimize'],
      ['bare_wind_exposure_days', 'minimize'],
    ],
  },
}

export const PRIORIDADES = [
  { id: 'equilibrio', nombre: 'Equilibrado', pesos: { agua: 50, suelo: 50 } },
  { id: 'agua', nombre: 'Cuidar el agua', pesos: { agua: 80, suelo: 20 } },
  { id: 'suelo', nombre: 'Proteger el suelo', pesos: { agua: 20, suelo: 80 } },
]

export const MUESTRA_MINIMA = 3
const TOLERANCIA = 1e-9

// Peso de cada métrica = peso del grupo repartido en partes iguales entre sus métricas.
export function pesosPorMetrica(pesosGrupo) {
  const salida = {}
  for (const [grupo, def] of Object.entries(GRUPOS_PRIORIDAD)) {
    const w = Number(pesosGrupo?.[grupo] ?? 0)
    for (const [metrica, direccion] of def.metricas) {
      salida[metrica] = { peso: w / def.metricas.length, direccion, grupo }
    }
  }
  return salida
}

const valor = (registro, grupoKpi, metrica) => {
  const v = registro?.[grupoKpi]?.[metrica]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function ordenarCasos(registros, grupoKpi, pesosGrupo) {
  const pesos = pesosPorMetrica(pesosGrupo)
  const activas = Object.entries(pesos).filter(([, p]) => p.peso > 0)
  const sumaPesos = activas.reduce((s, [, p]) => s + p.peso, 0)
  const metodo = {
    normalizacion: 'min–max entre casos comparables de este escenario',
    pesos,
    faltantes: 'Caso sin puntaje si le falta una métrica con peso',
    empates: 'Mismo puntaje → misma posición',
  }
  const base = registros.map((registro) => ({ registro, puntaje: null, posicion: null, faltantes: [], detalle: {} }))

  if (registros.length === 0) {
    return { estado: 'sin_registros', motivo: 'No hay resultados precalculados para este escenario.', filas: base, metodo }
  }
  const n = Math.min(...registros.map((r) => r.n_windows ?? 0))
  if (n === 0) {
    const motivo = registros.find((r) => r.missing_reason)?.missing_reason ?? 'Sin ventanas históricas válidas.'
    return { estado: 'sin_ventanas', motivo, filas: base, metodo, n }
  }
  if (n < MUESTRA_MINIMA) {
    return {
      estado: 'muestra_insuficiente',
      motivo: `Solo ${n} ${n === 1 ? 'ventana histórica' : 'ventanas históricas'}: se necesitan al menos ${MUESTRA_MINIMA}. Sin conclusión.`,
      filas: base, metodo, n,
    }
  }
  if (!(sumaPesos > 0)) {
    return { estado: 'pesos_invalidos', motivo: 'Elige al menos una prioridad con peso mayor que cero.', filas: base, metodo, n }
  }

  // 1) faltantes por caso
  for (const fila of base) {
    fila.faltantes = activas.filter(([m]) => valor(fila.registro, grupoKpi, m) === null).map(([m]) => m)
  }
  const comparables = base.filter((f) => f.faltantes.length === 0)
  if (comparables.length === 0) {
    return { estado: 'sin_comparables', motivo: 'Ningún caso tiene todos los indicadores necesarios.', filas: base, metodo, n }
  }

  // 2) rangos comunes a todos los casos comparables (no un rango por caso)
  const rangos = {}
  for (const [m] of activas) {
    const vs = comparables.map((f) => valor(f.registro, grupoKpi, m))
    rangos[m] = { min: Math.min(...vs), max: Math.max(...vs) }
  }

  // 3) puntaje 0..1 (1 = mejor)
  for (const fila of comparables) {
    let suma = 0
    for (const [m, p] of activas) {
      const v = valor(fila.registro, grupoKpi, m)
      const { min, max } = rangos[m]
      const constante = max - min < TOLERANCIA
      const norm = constante ? 1 : p.direccion === 'minimize' ? (max - v) / (max - min) : (v - min) / (max - min)
      fila.detalle[m] = { valor: v, normalizado: norm, peso: p.peso, constante }
      suma += norm * p.peso
    }
    fila.puntaje = suma / sumaPesos
  }

  // 4) posiciones con empates (ranking de competencia 1,1,3)
  const ordenados = [...comparables].sort((a, b) => b.puntaje - a.puntaje)
  ordenados.forEach((fila, i) => {
    const previo = ordenados[i - 1]
    fila.posicion = previo && Math.abs(previo.puntaje - fila.puntaje) < 1e-6 ? previo.posicion : i + 1
  })
  for (const fila of ordenados) {
    fila.empatadoCon = ordenados.filter((o) => o !== fila && o.posicion === fila.posicion).map((o) => o.registro.case_id)
  }

  const sinPuntaje = base.filter((f) => f.faltantes.length > 0)
  const todosEmpatados = ordenados.every((f) => f.posicion === 1)
  return {
    estado: todosEmpatados ? 'todos_empatados' : 'ok',
    motivo: todosEmpatados ? 'Todos los casos comparables quedan iguales con esta prioridad.' : null,
    filas: [...ordenados, ...sinPuntaje],
    rangos,
    metodo,
    n,
  }
}

// Nivel de riesgo RELATIVO de un caso frente a los demás casos del mismo escenario (no es un umbral
// agronómico ni un pronóstico). Tercios del rango min–max: tercio más bajo = Bajo, más alto = Alto.
// Devuelve null si falta el dato, si n < 3 o si todos los casos valen lo mismo.
export const RIESGOS = [
  { id: 'agua', nombre: 'Falta de agua', icono: 'gota', metricas: ['water_stress_days'] },
  { id: 'temperatura', nombre: 'Frío o calor', icono: 'termometro', metricas: ['thermal_exposure_days'] },
  { id: 'suelo', nombre: 'Suelo desnudo', icono: 'suelo', metricas: ['bare_rain_exposure_days', 'bare_wind_exposure_days'] },
]
const NIVELES = [
  { id: 'bajo', texto: 'Bajo', icono: 'nivel-bajo', clase: 's-bajo' },
  { id: 'medio', texto: 'Medio', icono: 'nivel-medio', clase: 's-medio' },
  { id: 'alto', texto: 'Alto', icono: 'nivel-alto', clase: 's-alto' },
]
const suma = (registro, grupoKpi, metricas) => {
  const vs = metricas.map((m) => valor(registro, grupoKpi, m))
  return vs.some((v) => v === null) ? null : vs.reduce((a, b) => a + b, 0)
}
export function nivelesRelativos(registros, grupoKpi = 'decision_kpis') {
  const salida = {}
  const n = registros.length ? Math.min(...registros.map((r) => r.n_windows ?? 0)) : 0
  for (const r of registros) salida[r.case_id] = {}
  for (const riesgo of RIESGOS) {
    const vs = registros.map((r) => suma(r, grupoKpi, riesgo.metricas))
    const validos = vs.filter((v) => v !== null)
    const min = Math.min(...validos)
    const max = Math.max(...validos)
    registros.forEach((r, i) => {
      const v = vs[i]
      if (v === null || n < MUESTRA_MINIMA || validos.length < 2 || max - min < TOLERANCIA) {
        salida[r.case_id][riesgo.id] = null
      } else {
        const t = (v - min) / (max - min)
        salida[r.case_id][riesgo.id] = NIVELES[t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2]
      }
    })
  }
  return salida
}

