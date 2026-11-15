# Raíz · beta-frontend

Aplicación React/Vite que **lee el paquete precalculado de Dev 2**. No necesita levantar una API del backend para explorar la publicación local. Cifras, mensajes y audios conservan su versión y procedencia.

## Ejecutar

Node 18 o superior y Python 3.10 o superior:

```sh
cd beta-frontend
npm ci
npm run dev
```

Abrir **http://127.0.0.1:5173/?fuente=paquete**. En PowerShell usar npm.cmd si la política bloquea npm.ps1. El servidor prepara el paquete antes de iniciar; si falla en desarrollo, informa la causa y permite usar la publicación anterior.

```sh
npm run paquete           # regenerar los JSON y audios publicados
npm run test:integration  # comprobar integridad y contrato del paquete
npm test                  # pruebas unitarias de lógica heredada
npm run build             # preparar paquete y compilar a dist/
npm run preview           # servir dist/ en el puerto 4173
```

El preparador utiliza raiz-hackaton/datos/ cuando existe; en su ausencia utiliza el fixture, identificado como tal. El publicador raiz_data.web añade vistas derivadas de clima y cobertura sin modificar los KPI científicos. Conserva releases y cambia current.json de forma atómica.

Otra entrada: `node scripts/preparar-paquete.mjs --entrada ../ruta/datos --audio ../ruta/audios`. En Windows puede fijarse `$env:PYTHON='C:\\Python313\\python.exe'`.

## Las cuatro vistas

| Vista | Función |
| --- | --- |
| Comparar rotaciones | Nueve casos, tres secuencias; tres cifras visibles y seis indicadores en detalles. Sin ranking ni ganador. |
| Clima histórico | Campañas completas noviembre–marzo, periodos 1981–2000 y 2001–2025, variación, muestras y tabla alternativa. |
| Suelo y cobertura | Cobertura mensual publicada, datos de suelo y límites. Sensibilidad sin evaluar cuando corresponde. |
| Ficha y audio | Caso, texto y audio de la misma publicación; boletín regional aparte, audio al pulsar y ficha imprimible. |

Escenario común a las cuatro vistas. La publicación actual tiene ocho escenarios: dos periodos × cuatro fases ENSO, un suelo del productor y secano. No calcula rendimiento ni dinero, no recomienda siembra y no es un pronóstico.

URL: `?vista=rotaciones|clima|suelo|ficha` y `?fuente=paquete|ejemplo`. Atrás/Adelante cambia la vista. fuente=ejemplo es una demostración sintética, rotulada de forma visible.

## Diseño y configuración

Referencia y procedimiento reutilizable en [DESIGN.md](DESIGN.md), aplicado mediante AGENTS.md. Navegación horizontal arriba, marcos rectangulares, tema claro. Tamaño de tipografía Normal/Grande/Muy grande en Configuración, guardado en el navegador.

Fraunces y Jost se autoalojan con licencias en src/assets/fonts/. Las familias exactas de Vital Farms no están incluidas. Ver DESIGN.md para integrar una hoja CSS de marca autorizada mediante VITE_BRAND_FONTS_STYLESHEET.

## Dominio del túnel

Se conserva `allowedHosts: ['front-nasa.los5furiosos.cloud']`. Si cambia el túnel, añadir el hostname sin protocolo ni ruta en vite.config.js y reiniciar Vite. Los JSON se sirven desde el mismo origen: allowedHosts controla hosts permitidos y no equivale a configurar CORS en una API externa.

En Windows, detener Vite con Ctrl+C antes de regenerar o compilar el paquete: el servidor puede mantener abierto current.json y bloquear su reemplazo atómico. Después ejecutar npm run dev otra vez.

La composición combina tipografía y marcos editoriales con bloques de color y movimiento basados en Plantella. Hay pausa visible, preferencia de animaciones y respeto de movimiento reducido.
