# Raíz · Diseño editorial de campo

Referencia visual acordada con Franco el 15-nov-2026: [Vital Farms](https://vitalfarms.com/). Sustituye la anterior referencia al pitch. Aplicar a todas las vistas: navegación horizontal superior, tipografía editorial, marcos con carácter y tema claro.

## Referencia comprobada

Se inspeccionaron la web renderizada y el HTML/CSS de su tema actual `prpl-x-vtl`, sin deducir fuentes a ojo.

| Función | Familia real de Vital Farms |
| --- | --- |
| Títulos | Cheltenham Pro Cd, publicada como Cheltenham ITC Pro |
| Texto y navegación | Brandon Grotesque |
| Texto editorial secundario | Cheltenham Pro, publicada como ITC Cheltenham Std |
| Acentos decorativos | Pasta & Wine Little SVG; TAY Big Bird |

La referencia utiliza crema #F3EFE4, tinta #3C3835, botones rectangulares y marcos dibujados con border-image. Raíz conserva su verde y colores de cultivos. No incorpora los logotipos, fotografías, ilustraciones o textos de Vital Farms.

## Tipografía e integración

**Estado real:** no se incluyen archivos de Cheltenham o Brandon ni una licencia web para ellos. La aplicación utiliza **Fraunces 400/600 y Jost 400/600/700**, autoalojadas con sus licencias SIL OFL en `src/assets/fonts/`. Son fuentes de apoyo, no las fuentes exactas de Vital Farms. No hay llamadas a Google Fonts o Adobe en ejecución por defecto.

`src/fonts.css` declara los archivos libres. Los tokens `--titulo` y `--cuerpo` dan prioridad a las familias de marca cuando se integran. Para conectar una hoja CSS autorizada, configurar antes de iniciar Vite:

```dotenv
VITE_BRAND_FONTS_STYLESHEET=/fonts/brand.css
```

También se admite una URL HTTPS del proveedor autorizado. En `public/fonts/brand.css`, declarar mediante @font-face **Cheltenham Pro Cd** (400/600) y **Brandon Grotesque** (400/600/700), con archivos alojados conforme a su licencia. Si la hoja utiliza otros nombres, redefinir los dos tokens en ella. No copiar ni enlazar los WOFF de Vital Farms como dependencia del proyecto. Un kit debe pertenecer al titular del proyecto y cubrir su dominio.

- Título principal: serif expresiva, dos líneas en escritorio, escala fluida.
- Encabezados secundarios: misma familia, peso 400. No sustituir por sans geométrica.
- Texto y controles: sans legible, caja normal; mayúsculas espaciadas solo en navegación, filtros y etiquetas cortas.
- Cifras tabulares y unidades visibles; las notas usan la familia de cuerpo.
- Usar rem para que el ajuste de lectura cambie toda la interfaz.

## Tipos y marcos de la primera referencia

- Usar `src/assets/ink-frame.svg`, un marco original de Raíz, con border-image en escenario, paneles y diálogos. No distorsionar texto o controles.
- Tablas como un registro editorial: marco fino, cabeceras sobrias, líneas horizontales, cifras alineadas. Todos los casos tienen igual peso visual.
- Botones, campos, filtros, etiquetas y calendario rectangulares, radio cero. Círculos solo si la función los requiere.
- Evitar rejillas de tarjetas idénticas, bordes grises suaves, sombras flotantes, gradientes y ruido decorativo sobre los datos.
- Espacio y jerarquía antes que más contenedores. No enmarcar cada párrafo.

## Navegación y lectura

- Cabecera horizontal: Raíz, Comparar rotaciones, Clima histórico, Suelo y cobertura, Ficha y audio, Datos y fuentes, Configuración.
- Selección con subrayado y aria-current, además de color.
- Tablet: segunda fila superior. Móvil: cuatro secciones visibles, Comparar / Clima / Suelo / Ficha, con sus nombres accesibles completos. Nunca barra lateral o inferior.
- Configuración → **Tamaño de tipografía: Normal (100 %), Grande (112 %), Muy grande (125 %)**, con explicación y vista previa. Aplicación inmediata y persistencia en el navegador. Si el almacenamiento está bloqueado, el cambio sigue funcionando durante la sesión.
- Diálogos nativos, foco contenido, Escape para cerrar, devolución del foco al disparador.
- Audio solo al pulsar. Solo modo claro; no añadir interruptores de tema ni controles A/A+/A++.

## Composición y contraste · Plantella

Actualización solicitada por Franco: tomar de [Plantella](https://themes.shopify.com/themes/elixira/presets/plantella) y su [demo](https://plantella-demo.myshopify.com/) la alternancia de fondos, la portada dividida y el movimiento. Se mantienen los tipos editoriales y marcos de Vital Farms. No copiar la tienda ni sus contenidos comerciales.

`src/editorial.css` concentra esta capa de composición y movimiento sobre los estilos de componentes.

| Sección | Fondo | Texto |
| --- | --- | --- |
| Navegación horizontal | Pistacho #E7ECD6 | Verde/tinta |
| Portada o cabecera de vista | Verde #087A45 | Crema #FFFDF2 |
| Ilustración botánica | Durazno #EDCBB4 | Imagen decorativa |
| Franja de movimiento y pie | Verde oscuro #043723 | Crema |
| Escenario | Ocre #E3C987 | Tinta |
| Resultados | Hoja clara #FFFDF2 | Tinta |

Estos son bloques amplios de la página, no solo cambios mínimos entre tarjetas. La ilustración es original, generada para Raíz, y decorativa: no representa una observación NASA, una parcela o una medición. Su JPEG optimizado pesa aproximadamente 312 kB.

## Movimiento

- Entradas al aparecer en pantalla: desplazamiento de 22 px y opacidad durante 600 ms; secuencia de 65 ms entre elementos. Se ejecutan una vez por elemento.
- Portada: paralaje limitado a 22 px, actualizado con requestAnimationFrame mientras está visible.
- Franja editorial continua: vuelta de 32 s. Botón visible de pausa; también se pausa al pasar el puntero o enfocar sus controles.
- Botones: respuesta de 200 ms, sin animar números científicos.
- Configuración permite desactivar todas las animaciones. La preferencia se conserva y se respeta prefers-reduced-motion del dispositivo.
- El contenido es visible sin JavaScript de animación. Usar threshold 0: los paneles muy largos deben aparecer aunque no quepan completos en la pantalla.
- No secuestrar la rueda, añadir autoplay de audio ni convertir las cifras en contadores animados.

## Procedimiento reutilizable

1. Leer esta guía y los componentes afectados. Reutilizar sus tokens y componentes.
2. Componer título, explicación breve, controles y datos. Un marco principal por grupo funcional.
3. Conservar los KPI del paquete: seis indicadores, un suelo y secano. No fabricar ranking, ganador, recomendaciones o niveles de riesgo para decorar.
4. Probar las cuatro vistas, estados de carga y error, 390 px y tamaño Muy grande: sin desbordamiento de página ni valores cortados; tablas anchas en regiones desplazables.
5. Probar navegación, filtro, detalles, cambio de caso, audio, Escape y persistencia del tamaño tras recargar.
6. Ejecutar npm run test:integration. Comprobar compilación y consola del navegador, guardar capturas y declarar verificaciones bloqueadas.

## Disponibilidad

`AGENTS.md` remite a esta guía para que las siguientes tareas hereden el criterio. Está disponible en este repositorio. **No se instaló una skill personal**: la escritura en el directorio personal fue denegada y el clon alternativo no pudo conectarse. No presentar esta guía como una skill instalada en la cuenta.
