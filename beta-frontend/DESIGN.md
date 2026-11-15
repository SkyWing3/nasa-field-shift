# Raíz · DESIGN.md

Sistema de diseño del frontend (`beta-frontend/`). Fuente de verdad visual: el pitch en Canva
(«Brown Clean Harvest Presentation», equipo F11). Los tokens viven en `:root` de `src/styles.css`.

## Para quién y dónde
Productor o técnico del Altiplano, celular en la mano, a pleno sol, conexión irregular.
Tema claro y cálido en toda la app; alto contraste; poco texto; nada que parezca plantilla.

## Color
| Token | Valor | Uso |
| --- | --- | --- |
| `--marca` | `#B3982B` | Mostaza del pitch: cabecera, botón principal, borde del caso ganador, bloques |
| `--marca-osc` | `#6B5A10` | Mostaza para texto y títulos (5,8:1 sobre `--bg`) |
| `--bg` | `#F4EED9` | Fondo base: papel con matiz mostaza (nunca blanco) |
| `--surface` | `#FBF7E8` | Superficies sobre el fondo |
| `--surface-2` | `#E9DFB4` | Mostaza clara: carril de escenario, cabeceras de tabla, boletín |
| `--tinta` | `#1A1708` | Texto y opción seleccionada (15,4:1 sobre `--bg`; 6,4:1 sobre `--marca`) |
| `--tinta-2` | `#57502F` | Texto secundario, teñido (no gris) |

Semánticos (texto sobre su fondo, todos ≥ 5:1): bajo `#2F6B2A`/`#DDEBCB`, medio `#8F3F00`/`#F8DDBF`,
alto `#A8221B`/`#F7D6D0`, agua `#1F5C85`/`#D9E8EE`. Cultivos: papa tierra, quinua mostaza, haba oliva, descanso piedra.
El riesgo siempre es color + icono + palabra.

## Tipografía
- **Poppins** (títulos; cursiva 600 para preguntas y portada, como «RAÍZ» y «El problema» del pitch).
- **Open Sans** (lectura y controles). **Playball** solo para el lema manuscrito.
- Autoalojadas con `@fontsource` (subconjunto latino): la demo no depende de Google Fonts.
- Las tres se identificaron A OJO desde el Canva; si el pitch usa otras, cambiar los imports de `src/main.jsx` y `--titulo/--cuerpo/--mano`.
- Base 18 px escritorio, 16 px móvil; control A / A+ / A++ escala todo.

## Forma y fondo
- Radios grandes como las fotos del pitch (12–28 px). Sin sombras: las superficies se separan por color.
- Bloque mostaza (cabecera, portada) como en las láminas; curvas de nivel finas como motivo (`--curvas`).
- Elemento propio: la **franja de rotación**, tres años como tramos de una misma parcela.
- Los casos son filas de un registro; solo el primero lleva borde mostaza e insignia.

## Movimiento
- Una entrada escalonada: filas de casos, 280 ms, 45 ms entre filas, `cubic-bezier(0.23, 1, 0.32, 1)`, solo al cargar la vista.
- Respuesta táctil: `scale(.97)` al presionar, 140 ms. Hover solo en dispositivos con puntero.
- `prefers-reduced-motion`: sin desplazamiento, solo un fundido corto.

## Prohibido
Gradientes, violetas, neón, brillos, sombras, blanco puro, gris neutro, emojis o glifos como iconos,
rejillas de tarjetas iguales, rótulos en mayúsculas sobre los títulos, barras laterales de color en avisos.

## Honestidad (viene del contrato del equipo)
Dato ausente = «No disponible» con motivo. Todo dato lleva estado (descargado, simulado, supuesto, no evaluado, ejemplo).
n < 3 = «sin conclusión». Nunca predicción, rendimiento, dinero ni erosión en toneladas.

## Skills de diseño consultadas (15-nov-2026)
Descargadas de sus repos públicos y usadas como guía de revisión, no ejecutadas:
- `Leonxlnx/taste-skill` (design-taste-frontend): lista «Never» y checklist.
- `pbakaus/impeccable`: `craft-floor.md` (contraste, superficies del navegador, glifos, barras laterales).
- `emilkowalski/skill` (emil-design-eng): qué animar, easing, duración, estados táctiles.

Para instalarlas en Claude Code de una laptop nueva (según sus README):
```sh
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
npx impeccable install
npx skills@latest add emilkowalski/skills
```
