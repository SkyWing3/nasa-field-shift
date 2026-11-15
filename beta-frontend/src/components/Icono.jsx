// Iconos de línea simples (SVG propio, sin librerías). Decorativos por defecto:
// siempre van junto a un texto, así que se ocultan al lector de pantalla.
const TRAZOS = {
  sol: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  calor: <><path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-5 1-7.5Z" /></>,
  lluvia: <><path d="M7 15a4.5 4.5 0 1 1 1.2-8.8A6 6 0 0 1 19.5 9 3.5 3.5 0 0 1 18 15Z" /><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21" /></>,
  gota: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
  termometro: <><path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></>,
  planta: <><path d="M12 21v-9" /><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7ZM12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5Z" /><path d="M6 21h12" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  viento: <><path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7" /></>,
  suelo: <><path d="M3 15c3-2 6-2 9 0s6 2 9 0" /><path d="M3 19c3-2 6-2 9 0s6 2 9 0" /><path d="M12 12V5m0 0-2.5 2.5M12 5l2.5 2.5" /></>,
  altavoz: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  imprimir: <><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="1.5" /><path d="M7 14h10v6.5H7Z" /></>,
  descargar: <><path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M5 19.5h14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  alerta: <><path d="M12 3.5 2.5 20h19Z" /><path d="M12 10v4.5M12 17.5v.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  satelite: <><path d="m7 7 3 3M14 14l3 3" /><rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" /><path d="m4 10 6-6 3 3-6 6ZM11 17l6-6 3 3-6 6Z" /></>,
  mapa: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  estrella: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8Z" />,
  balanza: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="m5 7-3 7a3 3 0 0 0 6 0Zm14 0-3 7a3 3 0 0 0 6 0Z" /></>,
  play: <path d="M8 5.5v13l10.5-6.5Z" />,
  texto: <><path d="M6 4h9l3 3v13H6Z" /><path d="M9 10h6M9 13.5h6M9 17h4" /></>,
  'nivel-bajo': <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  'nivel-medio': <path d="M12 4.5 20.5 19h-17Z" fill="currentColor" stroke="none" />,
  'nivel-alto': <rect x="5" y="5" width="14" height="14" fill="currentColor" stroke="none" />,
  desnudo: <path d="M4 16h2M9 16h2M14 16h2M19 16h1" />,
  rastrojo: <path d="M5 9h14M5 13h14M5 17h14" />,
  hoja: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14Z" /><path d="M5 19 13 11" /></>,
  radio: <><rect x="3" y="9" width="18" height="11" rx="2" /><circle cx="15.5" cy="14.5" r="2.5" /><path d="M6 13h4M6 16h4M7 9l10-5" /></>,
}

export default function Icono({ nombre, tam = 24, titulo }) {
  const trazo = TRAZOS[nombre] ?? TRAZOS.info
  return (
    <svg
      className="icono"
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : 'true'}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      focusable="false"
    >
      {trazo}
    </svg>
  )
}
