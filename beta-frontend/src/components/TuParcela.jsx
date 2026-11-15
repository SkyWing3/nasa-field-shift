// Tarjeta «Tu parcela»: lo que se eligió en la simulación 3D aplicado a estos datos.
import Icono from './Icono.jsx'
import { dentroDeZona, distanciaKm, fmt, metrosCubicos } from '../lib/parcela.js'
import { urlSimulacion } from '../lib/simulacion.js'

export default function TuParcela({ parcela, paquete, idioma, olvidar }) {
  const punto = paquete?.catalog?.data?.analysis_point
  const enlace3d = urlSimulacion(idioma)
  if (!parcela) {
    return enlace3d ? (
      <aside className="tu-parcela vacia no-imprimir">
        <Icono nombre="mapa" tam={22} />
        <p>Elige tu parcela en la simulación 3D y aquí verás el agua en metros cúbicos para tu terreno.</p>
        <a className="boton secundario" href={enlace3d}>Elegir parcela</a>
      </aside>
    ) : null
  }
  const km = punto ? distanciaKm(parcela, { lat: punto.latitude, lon: punto.longitude }) : null
  const cerca = km !== null && dentroDeZona(km)
  const m3 = parcela.ha ? metrosCubicos(1, parcela.ha) : null
  return (
    <aside className={`tu-parcela ${cerca ? 'cerca' : 'lejos'}`} aria-labelledby="tu-parcela-titulo">
      <Icono nombre="mapa" tam={26} />
      <div>
        <p className="tu-parcela-origen">Elegida en la simulación 3D</p>
        <h2 id="tu-parcela-titulo"><span>Tu parcela</span>: <span translate="no">{parcela.nombre}</span></h2>
        <ul>
          {parcela.ha && <li>{`Superficie: ${fmt(parcela.ha, 2)} ha`}</li>}
          {km !== null && <li>{`A ${fmt(km)} km del punto de los datos (Obrajes).`}</li>}
          {m3 !== null && <li>{`En tu parcela, 1 mm de riego son ${fmt(m3, 1)} m³ de agua.`}</li>}
        </ul>
        {km !== null && <p className="tu-parcela-estado">{cerca
          ? 'Está dentro de la zona de los datos: estos resultados te sirven como referencia regional.'
          : 'Está lejos de la zona de los datos: los resultados son de Obrajes y pueden no parecerse a tu parcela.'}</p>}
      </div>
      <button type="button" className="boton-texto" onClick={olvidar}>Olvidar parcela</button>
    </aside>
  )
}
