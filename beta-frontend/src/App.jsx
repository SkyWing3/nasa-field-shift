import { useEffect, useMemo, useState } from 'react'
import { AppShell, ConfiguracionDialog, FuentesDialog, SECCIONES } from './components/AppShell.jsx'
import { Aviso } from './components/Comunes.jsx'
import Escenario from './components/Escenario.jsx'
import EditorialIntro from './components/EditorialIntro.jsx'
import Alertas from './components/Alertas.jsx'
import TuParcela from './components/TuParcela.jsx'
import { leerParcela, olvidarParcela } from './lib/parcela.js'
import { Bienvenida, Recorrido, useLector, useTutorialDatos } from './components/Tutorial.jsx'
import useEditorialMotion, { useReduccionSistema } from './lib/useEditorialMotion.js'
import { useTraductorPantalla } from './lib/traductor.js'
import { CODIGOS } from './lib/idioma.js'
import VistaClima from './vistas/VistaClima.jsx'
import VistaRotaciones from './vistas/VistaRotaciones.jsx'
import VistaSuelo from './vistas/VistaSuelo.jsx'
import VistaFicha from './vistas/VistaFicha.jsx'
import { cargarFuente, FUENTES, naturalezaPaquete } from './lib/datos.js'
import { escenarioInicial, opcionesEscenario, registrosDelEscenario } from './lib/dominio.js'

const paginaDeUrl = () => {
  const id = new URLSearchParams(window.location.search).get('vista')
  return SECCIONES.some((s) => s.id === id) ? id : 'rotaciones'
}

export default function App() {
  const [idFuente, setIdFuente] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('fuente')
    return FUENTES.some((f) => f.id === id) ? id : 'paquete'
  })
  const [estado, setEstado] = useState({ cargando: true, error: null, paquete: null })
  const [paso, setPaso] = useState(paginaDeUrl)
  const [escenario, setEscenario] = useState({ periodo: null, enso: null, presupuesto: null, suelo: null })
  const [casoId, setCasoId] = useState('A-1')
  const [tamano, setTamano] = useState(() => {
    try {
      const guardado = localStorage.getItem('raiz-tamano-tipografia')
      return ['normal', 'grande', 'muy-grande'].includes(guardado) ? guardado : 'normal'
    } catch { return 'normal' }
  })
  const [configuracionAbierta, setConfiguracionAbierta] = useState(false)
  const [animaciones, setAnimaciones] = useState(() => {
    try { return localStorage.getItem('raiz-animaciones') !== 'off' } catch { return true }
  })
  const [fuentesAbiertas, setFuentesAbiertas] = useState(false)
  const reduceSistema = useReduccionSistema()
  const [forzarMovimiento, setForzarMovimiento] = useState(() => {
    try { return localStorage.getItem('raiz-movimiento-forzado') === 'si' } catch { return false }
  })
  const [revision, setRevision] = useState(0)
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [inicio] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    let guardado = null
    let visto = null
    let voz = null
    try { guardado = localStorage.getItem('raiz-idioma'); visto = localStorage.getItem('raiz-tutorial-beta'); voz = localStorage.getItem('raiz-voz') } catch { /* sin almacenamiento */ }
    return {
      configurado: Boolean(guardado) || CODIGOS.includes(params.get('idioma')),
      tutorial: params.get('tutorial') === 'si' && visto !== 'visto',
      voz: params.get('voz') === 'si' || (params.get('voz') !== 'no' && voz === 'si'),
    }
  })
  const [bienvenidaAbierta, setBienvenidaAbierta] = useState(() => !inicio.configurado)
  const [voz, setVoz] = useState(inicio.voz)
  const [parcela, setParcela] = useState(leerParcela)
  const [conTutorial, setConTutorial] = useState(true)
  const [recorridoActivo, setRecorridoActivo] = useState(inicio.tutorial)
  const datosTutorial = useTutorialDatos()
  const lector = useLector(datosTutorial)
  useEffect(() => { try { localStorage.setItem('raiz-voz', voz ? 'si' : 'no') } catch { /* preferencia de sesión */ } }, [voz])
  const [idioma, setIdioma] = useState(() => {
    try {
      const enUrl = new URLSearchParams(window.location.search).get('idioma')
      if (CODIGOS.includes(enUrl)) return enUrl
      const guardado = localStorage.getItem('raiz-idioma')
      return CODIGOS.includes(guardado) ? guardado : 'es'
    } catch { return 'es' }
  })
  useEffect(() => { try { localStorage.setItem('raiz-idioma', idioma) } catch { /* Preferencia válida durante la sesión. */ }
    document.documentElement.lang = idioma === 'otro' ? 'es' : idioma
  }, [idioma])

  useEffect(() => {
    const controller = new AbortController()
    setEstado({ cargando: true, error: null, paquete: null })
    cargarFuente(idFuente, controller.signal).then((paquete) => {
      if (controller.signal.aborted) return
      setEscenario(escenarioInicial(opcionesEscenario(paquete)))
      setEstado({ cargando: false, error: null, paquete })
    }).catch((error) => {
      if (!controller.signal.aborted) setEstado({ cargando: false, error, paquete: null })
    })
    const url = new URL(window.location.href)
    url.searchParams.set('fuente', idFuente)
    window.history.replaceState(null, '', url)
    return () => controller.abort()
  }, [idFuente, revision])

  useEffect(() => {
    const online = () => setEnLinea(true)
    const offline = () => setEnLinea(false)
    const pop = () => {
      setPaso(paginaDeUrl())
      const fuente = new URLSearchParams(window.location.search).get('fuente')
      if (FUENTES.some((f) => f.id === fuente)) setIdFuente(fuente)
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('popstate', pop)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('popstate', pop) }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--escala-texto', String({ normal: 1, grande: 1.12, 'muy-grande': 1.25 }[tamano]))
    try { localStorage.setItem('raiz-tamano-tipografia', tamano) } catch { /* Lectura disponible incluso con almacenamiento bloqueado. */ }
  }, [tamano])
  useEffect(() => { document.title = `Raíz · ${SECCIONES.find((s) => s.id === paso)?.nombre ?? 'Comparar rotaciones'}` }, [paso])

  const { paquete } = estado
  useEditorialMotion(animaciones, paso, paquete, forzarMovimiento)
  useTraductorPantalla(idioma)
  useEffect(() => { try { localStorage.setItem('raiz-movimiento-forzado', forzarMovimiento ? 'si' : 'no') } catch { /* Preferencia válida durante la sesión. */ } }, [forzarMovimiento])
  useEffect(() => { try { localStorage.setItem('raiz-animaciones', animaciones ? 'on' : 'off') } catch { /* Preferencia válida durante la sesión. */ } }, [animaciones])
  const opciones = useMemo(() => paquete ? opcionesEscenario(paquete) : null, [paquete])
  const registros = useMemo(() => paquete ? registrosDelEscenario(paquete, escenario) : [], [paquete, escenario])
  const naturaleza = paquete ? naturalezaPaquete(paquete) : null
  const indice = SECCIONES.findIndex((s) => s.id === paso)
  const irA = (id) => {
    if (id !== paso) {
      const url = new URL(window.location.href)
      url.searchParams.set('vista', id)
      url.hash = ''
      window.history.pushState(null, '', url)
      setPaso(id)
    } else if (window.location.hash) {
      const url = new URL(window.location.href)
      url.hash = ''
      window.history.replaceState(null, '', url)
    }
    requestAnimationFrame(() => { window.scrollTo(0, 0); document.getElementById('contenido')?.focus({ preventScroll: true }) })
  }
  const verCaso = (destino) => (id) => { setCasoId(id); irA(destino) }
  return (
    <AppShell paso={paso} irA={irA} abrirTutorial={() => setBienvenidaAbierta(true)} voz={voz} abrirConfiguracion={() => setConfiguracionAbierta(true)} abrirFuentes={() => setFuentesAbiertas(true)} idioma={idioma} setIdioma={setIdioma}>
      <main id="contenido" tabIndex={-1} className="principal">
        <EditorialIntro paso={paso} titulo={SECCIONES[indice]?.nombre} animaciones={animaciones} setAnimaciones={setAnimaciones} idioma={idioma} reduceSistema={reduceSistema} forzarMovimiento={forzarMovimiento} setForzarMovimiento={setForzarMovimiento} />
        <Alertas idioma={idioma} />
        {!enLinea && <Aviso tipo="alerta" titulo="Sin conexión">Lo que ya cargaste sigue visible. Necesitas reconectar para abrir nuevos archivos o audios.</Aviso>}
        {estado.cargando && <div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><div><strong>Preparando tu comparación</strong><p>Estamos leyendo los datos históricos y sus fuentes.</p></div></div>}
        {estado.error && <div className="error-state"><Aviso tipo="peligro" titulo="No pudimos cargar los datos"><p>{estado.error.message}</p><div className="acciones"><button type="button" className="boton primario" onClick={() => setRevision((r) => r + 1)}>Volver a intentar</button><button type="button" className="boton secundario" onClick={() => setFuentesAbiertas(true)}>Revisar fuente de datos</button></div></Aviso></div>}
        {paquete && <>
          {(naturaleza.tipo === 'ejemplo' || naturaleza.tipo === 'fixture') && <Aviso tipo="alerta" titulo={naturaleza.titulo}>{naturaleza.texto}</Aviso>}
          <TuParcela parcela={parcela} paquete={paquete} idioma={idioma} olvidar={() => { olvidarParcela(); setParcela(null) }} />
          <Escenario opciones={opciones} escenario={escenario} setEscenario={setEscenario} registros={registros} />
          <div className="view-content">
            {paso === 'clima' && <VistaClima paquete={paquete} escenario={escenario} registros={registros} />}
            {paso === 'rotaciones' && <VistaRotaciones paquete={paquete} escenario={escenario} registros={registros} alVerFicha={verCaso('ficha')} alVerSuelo={verCaso('suelo')} parcela={parcela} />}
            {paso === 'suelo' && <VistaSuelo paquete={paquete} registros={registros} casoId={casoId} setCasoId={setCasoId} />}
            {paso === 'ficha' && <VistaFicha paquete={paquete} escenario={escenario} registros={registros} casoId={casoId} setCasoId={setCasoId} />}
          </div>
          <nav className="navegacion-pasos no-imprimir" aria-label="Continuar explorando">
            {indice > 0 && <button type="button" className="boton secundario" onClick={() => irA(SECCIONES[indice - 1].id)}>Volver a {SECCIONES[indice - 1].corto}</button>}
            {indice < SECCIONES.length - 1 && <button type="button" className="boton primario" onClick={() => irA(SECCIONES[indice + 1].id)}>Explorar {SECCIONES[indice + 1].nombre.toLowerCase()}</button>}
          </nav>
        </>}
      </main>
      <FuentesDialog abierto={fuentesAbiertas} cerrar={() => setFuentesAbiertas(false)} paquete={paquete} idFuente={idFuente} cambiarFuente={setIdFuente} fuentes={FUENTES} />
      <ConfiguracionDialog abierto={configuracionAbierta} cerrar={() => setConfiguracionAbierta(false)} tamano={tamano} setTamano={setTamano} animaciones={animaciones} setAnimaciones={setAnimaciones} />
      <Bienvenida abierto={bienvenidaAbierta && Boolean(datosTutorial)} datos={datosTutorial} idioma={idioma} setIdioma={setIdioma} voz={voz} setVoz={setVoz}
        conTutorial={conTutorial} setConTutorial={setConTutorial} lector={lector}
        alEmpezar={(quiere) => {
          setBienvenidaAbierta(false)
          lector.detener()
          if (quiere) { if (paso !== 'rotaciones') irA('rotaciones'); setRecorridoActivo(true) }
        }} />
      {recorridoActivo && paquete && datosTutorial && paso === 'rotaciones' && (
        <Recorrido datos={datosTutorial} recorrido="beta" idioma={idioma} voz={voz} setVoz={setVoz} lector={lector}
          alTerminar={() => { setRecorridoActivo(false); try { localStorage.setItem('raiz-tutorial-beta', 'visto') } catch { /* sesión */ } }} />
      )}
    </AppShell>
  )
}
