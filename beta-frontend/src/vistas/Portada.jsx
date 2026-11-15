// Portada breve: qué hace Raíz y un solo botón. Las tres franjas son las secuencias reales del catálogo.
import { Secuencia } from '../components/Comunes.jsx'

export default function Portada({ rotaciones, alEmpezar }) {
  return (
    <section className="portada" aria-labelledby="titulo-portada">
      <div className="portada-texto">
        <h1 id="titulo-portada">¿Qué sembrar este año en tu parcela?</h1>
        <p className="portada-bajada">
          Compara tres rotaciones de papa, quinua, haba y descanso con el clima histórico de Oruro.
        </p>
        <button type="button" className="boton primario grande" onClick={alEmpezar}>Comparar rotaciones</button>
        <p className="texto-secundario">Clima histórico NASA. No es un pronóstico: la decisión es tuya.</p>
      </div>
      <div className="portada-parcelas" aria-label="Las tres rotaciones que se comparan">
        {rotaciones.map((r) => <Secuencia key={r.rotation_id} campanas={r.campaigns} />)}
      </div>
    </section>
  )
}

