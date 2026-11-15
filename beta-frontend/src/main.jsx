import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Fuentes libres autoalojadas; el CSS de marca licenciado se puede integrar sin recompilar los componentes.
import './fonts.css'
import './styles.css'
import './editorial.css'

const brandStylesheet = import.meta.env.VITE_BRAND_FONTS_STYLESHEET
if (brandStylesheet) {
  try {
    const url = new URL(brandStylesheet, window.location.href)
    if (url.protocol === 'https:' || url.origin === window.location.origin) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url.href
      document.head.appendChild(link)
    }
  } catch { console.warn('La hoja de tipografía de marca no tiene una URL válida. Se usarán las fuentes incluidas.') }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
