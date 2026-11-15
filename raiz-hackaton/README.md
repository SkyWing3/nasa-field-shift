# Raíz · Centro de coordinación del hackatón

## Desarrollo Dev 2 · Nicole

La base inicial de publicación agrícola vive en `raiz_delivery/`, separada del
servidor de coordinación. Para retomar el trabajo, leer
[`docs/dev2/CONTINUAR.md`](docs/dev2/CONTINUAR.md); el plan y la bitácora están en
[`docs/dev2/PROCESO.md`](docs/dev2/PROCESO.md). Comprobación ejecutable:

```sh
python scripts/check_dev2.py
```

Esta primera versión trabaja **solo con fixtures sin métricas científicas**.
Prepara JSON, mensajes y fichas; informa audio y boletín ausentes. No incluye
datos NASA/NOAA reales, FastAPI, MP3 ni hosting HTTPS. El paquete real y las
revisiones D1/P5/P6/D3 siguen pendientes. La copia de trabajo no incluye la
base activa del tablero original.

Página en español con el enunciado traducido, el plan integrado v3.1 y el tablero compartido. La fusión y las mejoras están adoptadas en el contenido principal, el alcance, las fichas y las tareas; no son anexos con alcances alternativos.

## Plan vigente v3.1

- Una zona piloto en Oruro; confirmar punto, orden de cultivos en una parcela y riego con el productor.
- Tres secuencias de tres campañas anuales: papa/quinua/descanso, papa/quinua/haba y papa/haba/descanso. Cada una se evalúa en tres posiciones cíclicas: nueve casos. Son candidatas hasta confirmación local.
- NASA POWER descargado + ONI NDJ de NOAA. Comparación histórica/reciente y ENSO de la campaña de decisión como ejes distintos; KPI de esa campaña y del ciclo separados. Niño fuerte con n visible, sin conclusión si n<3.
- Agua, estrés, cobertura, exposición térmica, suelo descubierto coincidente con lluvia/viento, robustez y calidad de evidencia. Sensibilidad entre fuentes cuando haya contraste utilizable; si no, declararla no evaluada.
- Resultados JSON precalculados; web accesible, ficha imprimible, audio español y boletín regional MP3. FastAPI solo si ya está integrado; no dependencia nueva.
- Fuera: Santa Cruz, MODIS obligatorio, pronóstico/corrección a 24 h, «¿Acertamos?», observaciones comunitarias, SQLite agrícola, Telegram y modo offline.
- Envío interno domingo 10:30–11:00 Bolivia frente al cierre local de 12:00 indicado en la fusión; Persona 4 confirma con organización y adelanta si procede.

El detalle de las 37 tareas está en `plan-equipo.json`; el contrato de la futura app en `contracts/README.md`. Los IDs, responsables y estados del tablero se conservan al actualizar títulos y alcance. `plan_revisions` guarda una instantánea del plan y tablero anteriores para trazabilidad.

## Inicio rápido en macOS

1. Abrir `Iniciar-red-local.command` con doble clic. Muestra la URL local, la IP de la red y abre el navegador.
2. Para internet, abrir `Compartir-por-internet.command` con doble clic. Si el servidor no está abierto, lo inicia solo.
3. Mantener ambas ventanas abiertas y la Mac despierta.

`raiz.html` es una copia autocontenida que se puede abrir directamente para leer la información sin servidor; el tablero compartido requiere iniciar el servidor.

## Iniciar

Desde esta carpeta:

```sh
python3 server.py --port 8787
```

Abrir <http://localhost:8787>. En otros equipos de la misma red, usar `http://IP-DE-ESTA-MAC:8787`. El servidor escucha en `0.0.0.0`; si macOS pregunta por conexiones entrantes, permitirlas para Python. La red debe permitir conexiones entre clientes. La IP puede cambiar al reconectarse.

## Compartir por internet

Con el servidor en ejecución, abrir otra terminal:

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

Compartir el enlace HTTPS `trycloudflare.com` que imprima Cloudflare. Es temporal y cambia al reiniciar el túnel. La Mac debe seguir encendida y sin suspensión, con ambos procesos en ejecución. `Ctrl+C` detiene cada proceso. Documentación: <https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/>.

Cualquier persona que acceda puede leer el contenido y modificar las tareas. Está pensado para coordinación temporal del equipo, sin datos sensibles. No hay cuentas ni autenticación.

## Archivos

- `dist/index.html`: contenido integrado, fuentes, alcance, cronograma y fichas de los seis roles.
- `dist/style.css`: diseño adaptable y versión de impresión.
- `dist/app.js`: navegación, filtros, exportación y sincronización cada cinco segundos.
- `server.py`: servidor Python sin dependencias externas. Solo sirve los cuatro archivos públicos y la API; no publica otras carpetas del proyecto.
- `team.sqlite3`: creado al iniciar, guarda tareas compartidas. Respaldarlo con el servidor detenido. Cada cambio modifica un campo; cambios simultáneos del mismo campo conservan el último recibido.
- `plan-equipo.json`: tareas y criterios vigentes, alineados con las fichas y el tablero.
- `contracts/README.md`: especificación de archivos JSON, modelo, KPI y comunicación para implementar en la aplicación agrícola.

Las tareas se guardan en el servidor, no en cada navegador. La exportación JSON permite descargar una copia; no hay importación en esta versión. El contenido informativo funciona como HTML estático, pero el tablero requiere `server.py`.

El reto es «Field Shift: Adapting Farms with NASA Data» (NASA Space Apps 2026). La integración del 14 de noviembre de 2026 usa la propuesta de fusión y el informe de observaciones críticas; las correcciones P6 del 14-nov 19:10 se integran en v3.1. El pronóstico NOAA/IRI se cita solo como contexto externo con fecha/fuente. La cifra 4 de 5 queda condicionada a reproducción D1 del cuaderno con el punto final; no es probabilidad. Las puntuaciones estimadas no son evidencia ni notas oficiales. El calendario aportado por el productor se distingue de la secuencia y el riego aún por confirmar.

Este repositorio sigue siendo el centro de coordinación: no calcula todavía recomendaciones agrícolas ni publica los JSON/MP3 previstos en el contrato. La base SQLite y `/api/tasks` organizan al equipo; retirar SQLite agrícola del MVP no implica eliminar el tablero.

## Correcciones P6 incorporadas · v3.1

El HTML servido (`dist/index.html`), la copia autocontenida (`raiz.html`),
`plan-equipo.json`, las fichas exportables y `contracts/README.md` comparten las
correcciones: nueve casos cíclicos, contexto externo con fuentes fechadas y
reproducción pendiente de «4 de 5». Véase `docs/actualizacion-plan-v3.1.md`.
La base inicial Dev 2 sigue siendo fixture de tres registros sin métricas;
no implementa aún los nueve casos científicos del plan actualizado.

### Servidor de coordinación en Windows

Desde esta carpeta: `python server.py --host 127.0.0.1 --port 8787`.
Abrir http://127.0.0.1:8787. Para un túnel temporal en otra terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

La instancia preparada en esta sesión usa la copia de trabajo actualizada,
con snapshot consistente del tablero original. Se preservaron IDs, responsables
y estados; se actualizaron títulos por código y se guardó la revisión anterior
para trazabilidad. El proyecto original no fue sobrescrito.
