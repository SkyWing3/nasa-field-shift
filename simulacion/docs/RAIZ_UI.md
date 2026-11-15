> **Retirado el 15-nov-2026.** El prototipo oscuro descrito aquí (`frontend/src/raiz/`) se eliminó a pedido de Dev 1. `/raiz.html` y `/creditos.html` redirigen a Raíz 2D (`docs/RAIZ_2D.md`, ADR-043). Este registro se conserva como historia de la entrega.

# Raíz: interfaz P6 / Dev 1

Registro del 15-nov-2026 para la extensión React/Vite en `/raiz.html` (comparador y boletín) y `/creditos.html` (fuentes, licencias, IA y límites). Ambas entradas montan `frontend/src/raiz/main.tsx`; `App.tsx` elige la página por la ruta. Este documento describe esa entrega, sin establecer un sistema visual nuevo.

## Continuidad con TerraLab

La autoridad visual existente es `frontend/src/ui/styles/global.css`, junto con `StartScreen.tsx` y `StartScreen.module.css`: fondo verde casi negro, superficies verdes, texto claro, acento dorado y tipografía Inter con alternativas del sistema. `src/raiz/raiz.css` importa ese CSS y reutiliza el fondo (`#0c100e`), texto (`#e6eae3`), dorado (`#d8b36a`) y su contraste (`#1c160a`).

Los tamaños editoriales y las tablas de Raíz pertenecen a estas dos páginas. Para extenderlas, conservar los tokens y componentes de TerraLab; no promover sus reglas locales para `body`, títulos, navegación o tablas al CSS global. La ausencia de `PRODUCT.md` y `DESIGN.md` no autoriza sustituir la identidad existente. Esta entrega no crea esos archivos ni repara deriva global.

## Interacción y estados

- El comparador mantiene los nueve casos A/B/C, cada uno en tres posiciones cíclicas. Los filtros eligen fase ONI NDJ (Niño, Niña o Normal), período y año análogo o promedio. Cambiar fase o período restablece el año al promedio. El selector de nivel alterna campaña de decisión y ciclo de tres campañas; cada botón de caso actualiza su detalle y declara selección con `aria-pressed`.
- El aviso regional permanece visible al desplazar la página: «Datos regionales (celda NASA POWER de ~50 km), no mediciones de la parcela».
- A 800 px o menos, cabecera, filtros e introducción pasan a una columna. Las tablas conservan sus columnas y desplazan su contenido horizontalmente, con la primera columna fija. Las regiones tienen nombre accesible y `tabIndex={0}` para enfocarlas y usar flechas; las instrucciones aparecen hasta 1100 px. Se conservan enlace de salto, foco visible, controles nativos y anuncios de cambios mediante `aria-live`. El movimiento reducido desactiva el desplazamiento suave.
- La carga anuncia «Cargando datos precalculados…». Un fallo de descarga o mezcla de `build_id` muestra una alerta y permite reintentar. Una selección sin ventanas conserva los casos, muestra «sin dato» y anuncia la ausencia. El audio declara reproducción/pausa y ofrece texto y aviso si falla.
- Todo valor desconocido permanece `null` y se presenta como «sin dato», sin convertirlo a cero. Faltan fechas de floración y factor numérico de cobertura; no se completan esos KPI. Descanso conserva su descripción de cobertura parcial. El granizo no se calcula.

## Contenido y generación

La fuente agronómica y editorial está en `content/p6/`, desde la raíz del repositorio: `point.json`, `crops.json`, `soils.json`, `rotations.json`, registro de afirmaciones, boletín, fuentes/licencias y audio. `simulacion/scripts/build_raiz.py` genera `frontend/public/raiz/`; modificar los insumos o el generador y regenerar, en vez de editar esa salida manualmente. `data.ts` carga catálogo, resultados, clima, créditos y audio del mismo `build_id`; los filtros consultan datos estáticos, sin ejecutar cálculos ni consultar proveedores.

La entrega usa la grabación humana quechua y su transcripción original, con atribución anónima y permiso conservado fuera de los archivos públicos. El MP3 español fue omitido por instrucción del usuario: `spanish_mp3` es `null` y queda disponible el texto. La referencia española Meta MMS-TTS y su licencia CC-BY-NC-4.0 se distinguen de la voz humana entregada. El boletín se presenta como preparado para radio.

## Evidencia y alcance de revisión

La corrida documentada es `raiz-p6-v3-59c8f1646809`. Las [capturas y metadatos](validaciones/P6-dev1-v3/capturas.json) registran Chromium mediante Playwright a 1440 × 1000 y 390 × 844, ambas páginas y la tabla KPI móvil desplazada; informan cero desbordamiento de página y ningún error capturado. Se cotejaron con el código actual; no constituyen una auditoría exhaustiva de accesibilidad.

El dictamen acotado fue **ship** tras resolver cuatro hallazgos: limitar la reproducción por P6/Dev 1 al análisis histórico «4 de 5»; aclarar radiación desde 1984; nombrar y enfocar las regiones de tablas con primera columna fija; y distinguir MMS español del audio quechua humano. La segunda revisión cubrió esos cuatro puntos. El detector sobre `src/raiz` devolvió `[]`.

La reproducción histórica no certifica los nueve escenarios de demanda: siguen siendo cálculos preliminares con supuestos explícitos, pendientes de revisión agronómica de P6. Tampoco es certificación en campo; no hay contraste con estación y CHIRPS figura como no disponible. Mantener estos límites junto a los resultados y en los créditos.
