// Raíz · Dev 3 · Recorrido web de 4 pasos (D3-1 … D3-6).
// Lee el paquete precalculado; no calcula ciencia ni llama a proveedores externos.
import { useEffect, useMemo, useState } from 'react'
import Icono from './components/Icono.jsx'
import { Aviso } from './components/Comunes.jsx'
import Escenario from './components/Escenario.jsx'
import VistaClima from './vistas/VistaClima.jsx'
import VistaRotaciones from './vistas/VistaRotaciones.jsx'
import VistaSuelo from './vistas/VistaSuelo.jsx'
import VistaFicha from './vistas/VistaFicha.jsx'
import Portada from './vistas/Portada.jsx'
import { cargarFuente, FUENTES, naturalezaPaquete } from './lib/datos.js'
import { escenarioInicial, opcionesEscenario, registrosDelEscenario } from './lib/dominio.js'

const PASOS = [
  { id: 'clima', nombre: 'Clima', icono: 'sol' },
  { id: 'rotaciones', nombre: 'Rotaciones', icono: 'planta' },
  { id: 'suelo', nombre: 'Suelo y calidad', icono: 'suelo' },
  { id: 'ficha', nombre: 'Ficha y audio', icono: 'altavoz' },
]
const TAMANOS = [
  { id: 'normal', nombre: 'A', escala: 1, etiqueta: 'Texto normal' },
  { id: 'grande', nombre: 'A+', escala: 1.18, etiqueta: 'Texto grande' },
  { id: 'muy-grande', nombre: 'A++', escala: 1.36, etiqueta: 'Texto muy grande' },
]

function fuenteInicial() {
  const p = new URLSearchParams(window.location.search).get('fuente')
  return FUENTES.some((f) => f.id === p) ? p : 'paquete'
}

// D3-6 · Aviso de red: mensaje claro si se pierde la conexión.
function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return enLinea
}

export default function App() {
  const [idFuente, setIdFuente] = useState(fuenteInicial)
  const [estado, setEstado] = useState({ cargando: true, error: null, paquete: null })
  const [paso, setPaso] = useState('inicio')
  const [escenario, setEscenario] = useState({ periodo: null, enso: null, presupuesto: null, suelo: null })
  const [casoId, setCasoId] = useState('A-1')
  const [tamano, setTamano] = useState('normal')
  const enLinea = useEnLinea()

  useEffect(() => {
    let vigente = true
    setEstado({ cargando: true, error: null, paquete: null })
    cargarFuente(idFuente)
      .then((paquete) => {
        if (!vigente) return
        setEscenario(escenarioInicial(opcionesEscenario(paquete)))
        setEstado({ cargando: false, error: null, paquete })
      })
      .catch((error) => vigente && setEstado({ cargando: false, error, paquete: null }))
    const url = new URL(window.location.href)
    url.searchParams.set('fuente', idFuente)
    window.history.replaceState(null, '', url)
    return () => {
      vigente = false
    }
  }, [idFuente])

  useEffect(() => {
    const escala = TAMANOS.find((t) => t.id === tamano)?.escala ?? 1
    document.documentElement.style.setProperty('--escala-texto', String(escala))
  }, [tamano])

  const { paquete } = estado
  const opciones = useMemo(() => (paquete ? opcionesEscenario(paquete) : null), [paquete])
  const registros = useMemo(() => (paquete ? registrosDelEscenario(paquete, escenario) : []), [paquete, escenario])
  const naturaleza = paquete ? naturalezaPaquete(paquete) : null
  const punto = paquete?.catalog.data?.analysis_point

  const irA = (id) => {
    setPaso(id)
    requestAnimationFrame(() => document.getElementById('contenido')?.focus())
  }
  const verCaso = (destino) => (id) => {
    setCasoId(id)
    irA(destino)
  }
  const indice = PASOS.findIndex((p) => p.id === paso)

  return (
    <>
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <header className="cabecera no-imprimir">
        <div className="cabecera-interior">
          <button type="button" className="marca" onClick={() => irA('inicio')} aria-label="Raíz, ir al inicio">
            <span className="marca-nombre">Raíz</span>
            <span className="marca-lema">Sembramos decisiones, cosechamos el futuro</span>
          </button>
          <div className="herramientas">
            <div className="tamanos" role="group" aria-label="Tamaño del texto">
              {TAMANOS.map((t) => (
                <button key={t.id} type="button" className={`boton-tam${tamano === t.id ? ' activa' : ''}`} aria-pressed={tamano === t.id} aria-label={t.etiqueta} onClick={() => setTamano(t.id)}>
                  {t.nombre}
                </button>
              ))}
            </div>
            <label className="selector-fuente">
              <span>Datos</span>
              <select value={idFuente} onChange={(e) => setIdFuente(e.target.value)}>
                {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>
        <nav className="pasos" aria-label="Pasos del recorrido">
          <ol>
            {PASOS.map((p, i) => (
              <li key={p.id}>
                <button type="button" className={`paso${paso === p.id ? ' activo' : ''}`} aria-current={paso === p.id ? 'step' : undefined} onClick={() => irA(p.id)}>
                  <span className="paso-num">{i + 1}</span>
                  <Icono nombre={p.icono} />
                  <span>{p.nombre}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main id="contenido" tabIndex={-1} className="principal">
        {!enLinea && (
          <Aviso tipo="peligro" titulo="Sin conexión">Se perdió la conexión. Lo ya cargado sigue visible; los audios y archivos nuevos no se podrán abrir hasta reconectar.</Aviso>
        )}
        {estado.cargando && <p className="cargando" role="status">Cargando datos…</p>}
        {estado.error && (
          <Aviso tipo="peligro" titulo="No se pudieron mostrar los datos">
            <p>{estado.error.message}</p>
            {estado.error.detalle && <p className="texto-secundario">Archivo: <code>{String(estado.error.detalle)}</code></p>}
            {idFuente === 'paquete' && <p>Si es la primera vez, ejecuta <code>npm run paquete</code> para preparar el paquete de Dev 2, o elige «Ejemplo de interfaz» en Datos.</p>}
          </Aviso>
        )}

        {paquete && (
          <>
            <div className={`banda-datos banda-${naturaleza.tipo}`} role="note">
              <Icono nombre={naturaleza.tipo === 'simulado' || naturaleza.tipo === 'descargado' ? 'satelite' : 'alerta'} tam={26} />
              <div>
                <p className="banda-titulo">{naturaleza.titulo}</p>
                <p>{naturaleza.texto} <span className="banda-build">Versión de datos <code>{paquete.puntero.build_id}</code></span></p>
              </div>
            </div>

            {paso === 'inicio' && <Portada rotaciones={paquete.catalog.data?.rotations ?? []} alEmpezar={() => irA('rotaciones')} />}
            {paso !== 'inicio' && <div className="disposicion">
              <aside className="carril no-imprimir" aria-label="Zona y escenario">
                <div className="zona">
                  <p className="zona-titulo">{punto?.region ?? 'Oruro'}, Altiplano de Bolivia</p>
                  <p className="texto-secundario">
                    {punto?.latitude != null ? `Punto ${punto.latitude}, ${punto.longitude}.` : 'Punto por confirmar.'} Dato regional, no de tu finca.
                  </p>
                </div>
                <Escenario opciones={opciones} escenario={escenario} setEscenario={setEscenario} registros={registros} />
              </aside>
              <div className="columna">
                {paso === 'clima' && <VistaClima paquete={paquete} escenario={escenario} registros={registros} />}
                {paso === 'rotaciones' && (
                  <VistaRotaciones paquete={paquete} escenario={escenario} registros={registros} alVerFicha={verCaso('ficha')} alVerSuelo={verCaso('suelo')} />
                )}
                {paso === 'suelo' && <VistaSuelo paquete={paquete} registros={registros} casoId={casoId} setCasoId={setCasoId} />}
                {paso === 'ficha' && <VistaFicha paquete={paquete} escenario={escenario} registros={registros} casoId={casoId} setCasoId={setCasoId} />}

                <nav className="navegacion-pasos no-imprimir" aria-label="Paso anterior y siguiente">
                  {indice > 0 && (
                    <button type="button" className="boton secundario" onClick={() => irA(PASOS[indice - 1].id)}>Volver a {PASOS[indice - 1].nombre}</button>
                  )}
                  {indice < PASOS.length - 1 && (
                    <button type="button" className="boton primario" onClick={() => irA(PASOS[indice + 1].id)}>Seguir con {PASOS[indice + 1].nombre}</button>
                  )}
                </nav>
              </div>
            </div>}
          </>
        )}
      </main>

      <footer className="pie no-imprimir">
        <p>Raíz, equipo Raíz. NASA Space Apps Challenge 2026, reto «Field Shift: Adapting Farms with NASA Data».</p>
        <p>Clima histórico: NASA POWER. Fases ENSO: ONI de NOAA. Herramienta de apoyo: la decisión final es del agricultor.</p>
      </footer>
    </>
  )
}

