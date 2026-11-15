// Idiomas de la interfaz.
// El español es el idioma de origen y la referencia. Cada otro idioma es un
// archivo src/i18n/<código>.json que se carga solo (ver src/i18n/LEEME.md):
//   - "claves": textos con nombre (menú, portada, franja…), usados con t().
//   - "textos": frase en español → traducción; el traductor de pantalla
//     (lib/traductor.js) los cambia en toda la app.
//   - "patrones": frases con números o nombres, p. ej. "{n} días".
// Quechua y aymara: traducción automática con IA, pendiente de revisión por
// hablantes. "Otro idioma" usa la traducción del navegador.
const ES = {
  saltar: 'Saltar al contenido',
  lugar: 'Obrajes, Oruro · Altiplano de Bolivia',
  rotaciones: 'Comparar rotaciones',
  rotaciones_corto: 'Comparar',
  clima: 'Clima histórico',
  clima_corto: 'Clima',
  suelo: 'Suelo y cobertura',
  suelo_corto: 'Suelo',
  ficha: 'Ficha y audio',
  ficha_corto: 'Ficha',
  fuentes: 'Datos y fuentes',
  configuracion: 'Configuración',
  simulacion: 'Simulación 3D',
  tutorial: 'Tutorial',
  simulacion_ayuda: 'Abre TerraLab 3D en otra pestaña: prepara parcelas y prueba rotaciones en 3D.',
  idioma: 'Idioma',
  pie: 'Datos regionales, no una medición de tu parcela. No estima cosecha, dinero ni erosión.',
  limites: 'Fuentes y límites',
  hero_titulo_1: 'Una mirada al pasado.',
  hero_titulo_2: 'Más claridad para decidir.',
  hero_texto: 'Compara rotaciones con clima histórico de NASA POWER. La decisión sigue siendo tuya.',
  hero_boton: 'Explorar mi escenario',
  desc_clima: 'El pasado del clima, puesto en contexto para tu próxima decisión.',
  desc_suelo: 'Sigue la cobertura de cada rotación a lo largo del año.',
  desc_ficha: 'La evidencia de tu escenario, lista para leer, llevar y escuchar.',
  pausar: 'Pausar movimiento',
  activar: 'Activar movimiento',
  observar: 'Observar',
  comparar: 'Comparar',
  decidir: 'Decidir',
  aviso_ia: 'Traducción automática con IA: puede tener errores y está pendiente de revisión por hablantes. Las cifras, las fuentes y los mensajes aprobados siguen en español, que es la referencia.',
  aviso_otro: 'Para leer en otro idioma, usa la opción “Traducir” de tu navegador (en Chrome: clic derecho → Traducir). Es traducción automática: el español es la referencia.',
}

const archivos = import.meta.glob('../i18n/*.json', { eager: true, import: 'default' })

export const DICCIONARIOS = Object.fromEntries(
  Object.values(archivos)
    .filter((d) => d?._meta?.codigo && d._meta.codigo !== 'es')
    .map((d) => [d._meta.codigo, d]),
)

// Primero las lenguas de Bolivia; después, las demás por nombre.
const PRIMERO = ['qu', 'ay', 'gn']
const orden = (codigo) => (PRIMERO.includes(codigo) ? PRIMERO.indexOf(codigo) : PRIMERO.length)

export const IDIOMAS = [
  { id: 'es', nombre: 'Español' },
  ...Object.values(DICCIONARIOS)
    .sort((a, b) => orden(a._meta.codigo) - orden(b._meta.codigo) || a._meta.nombre.localeCompare(b._meta.nombre))
    .map((d) => ({ id: d._meta.codigo, nombre: d._meta.nombre })),
  { id: 'otro', nombre: 'Otro idioma…' },
]

export const CODIGOS = IDIOMAS.map((i) => i.id)

/** Idioma de los textos: uno con diccionario, o español. */
export const idiomaTexto = (idioma) => (DICCIONARIOS[idioma] ? idioma : 'es')

export const metaIdioma = (idioma) => DICCIONARIOS[idioma]?._meta ?? null

export const CLAVES_ES = ES

// Una traducción vacía ("") cuenta como pendiente: se muestra el español.
export const t = (clave, idioma) => DICCIONARIOS[idioma]?.claves?.[clave] || ES[clave] || clave
