// Si algo falla al dibujar la app, se muestra un aviso con salida en vez de una página en blanco.
import { Component } from 'react'

export default class Fallo extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Raíz no pudo mostrarse:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const limpiarYRecargar = () => {
      try { ['raiz-tutorial-beta', 'raiz-movimiento-forzado'].forEach((k) => localStorage.removeItem(k)) } catch { /* sin almacenamiento */ }
      window.location.href = window.location.pathname
    }
    return (
      <main className="fallo-app" role="alert">
        <h1>Raíz no pudo mostrarse</h1>
        <p>Ocurrió un error al dibujar la página. Tus datos no se perdieron.</p>
        <p className="fallo-detalle">{String(this.state.error?.message ?? this.state.error)}</p>
        <div className="acciones">
          <button type="button" className="boton primario" onClick={() => window.location.reload()}>Volver a cargar</button>
          <button type="button" className="boton secundario" onClick={limpiarYRecargar}>Cargar desde el inicio</button>
        </div>
      </main>
    )
  }
}
