import botanicalArt from '../assets/altiplano-botanical.jpg'
import { t } from '../lib/idioma.js'

const DESCRIPCIONES = {
  clima: 'El pasado del clima, puesto en contexto para tu próxima decisión.',
  suelo: 'Sigue la cobertura de cada rotación a lo largo del año.',
  ficha: 'La evidencia de tu escenario, lista para leer, llevar y escuchar.',
}

export default function EditorialIntro({ paso, titulo, animaciones, setAnimaciones, idioma = 'es', reduceSistema = false, forzarMovimiento = false, setForzarMovimiento }) {
  const enMovimiento = animaciones && (!reduceSistema || forzarMovimiento)
  const alternar = () => {
    if (enMovimiento) { setAnimaciones(false); setForzarMovimiento?.(false) } else { setAnimaciones(true); if (reduceSistema) setForzarMovimiento?.(true) }
  }
  const lang = ['qu', 'ay'].includes(idioma) ? idioma : 'es'
  return <>
    {paso === 'rotaciones' ? <header className="page-intro" lang={lang}>
      <div className="intro-copy">
        <h1>{t('hero_titulo_1', idioma)}<br className="intro-break" /> {t('hero_titulo_2', idioma)}</h1>
        <p>{t('hero_texto', idioma)}</p>
        <a className="boton hero-action" href="#tu-escenario">{t('hero_boton', idioma)} <span aria-hidden="true">↓</span></a>
      </div>
      <div className="intro-art" aria-hidden="true"><img className="hero-art-image" src={botanicalArt} width="1536" height="1024" alt="" fetchpriority="high" /></div>
    </header> : <header className="view-banner" lang={lang}><div><h1>{lang === 'es' ? titulo : t(paso, idioma)}</h1><p>{lang === 'es' ? DESCRIPCIONES[paso] : t(`desc_${paso}`, idioma)}</p></div><span aria-hidden="true" className="banner-mark">Raíz</span></header>}
    <div className="editorial-ribbon no-imprimir">
      <div className="ribbon-window" aria-hidden="true"><div className="ribbon-track">{[0, 1].map((n) => <div key={n} className="ribbon-group">{[0, 1, 2].map((i) => <span key={i}>{t('observar', idioma)} <i>·</i> {t('comparar', idioma)} <i>·</i> {t('decidir', idioma)} <i>✳</i></span>)}</div>)}</div></div>
      <button type="button" className="motion-toggle" aria-pressed={!enMovimiento} onClick={alternar} title={reduceSistema && !enMovimiento ? 'Tu sistema pide reducir el movimiento. Puedes activarlo aquí: la franja se moverá lento.' : undefined}>{enMovimiento ? t('pausar', idioma) : t('activar', idioma)}</button>
    </div>
  </>
}
