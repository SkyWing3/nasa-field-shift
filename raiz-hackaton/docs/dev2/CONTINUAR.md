# Dev 2 · punto de entrada para continuar

Responsable: **Nicole**. Alcance: `2026-11-14-altiplano-fusion-v3`.
Fecha de inicio: 14 de noviembre de 2026, America/La_Paz.

## Qué se está construyendo

Una herramienta de publicación por lotes, no una API de simulación. D1 entrega
resultados científicos precalculados; Dev 2 comprueba y empaqueta JSON,
mensajes, ficha imprimible, audio español y boletín regional. Dev 3 consume
los archivos y construye los controles y la experiencia accesible.

El estado actual es **una estructura inicial verificable con fixtures**.
No hay recomendaciones, datos NASA/NOAA descargados, coordenadas confirmadas,
ventanas evaluadas, presupuestos calculados, voz sintetizada ni boletín emitido.
Los tres registros fixture representan las tres alternativas del contrato,
con cero ventanas y KPI/ranking `null` con motivo. No son resultados científicos.

## Cómo retomar en cinco minutos

1. Leer `README.md`, `plan-equipo.json`, `contracts/README.md` y este archivo.
2. Leer `docs/dev2/CONTRATO-INICIAL.md` antes de cambiar rutas o campos.
3. Desde la raíz de esta copia ejecutar `python scripts/check_dev2.py`.
4. Revisar `build/verification.json`: cada paso debe terminar con código 0.
5. Consultar `docs/dev2/PROCESO.md`, tomar la siguiente tarea y registrar
   cambios, evidencia y pendientes. No marcar una tarea completa por tener fixture.

Requisitos: Python 3.10 o posterior; biblioteca estándar, sin instalación de paquetes.
Comprobado inicialmente en Windows con Python 3.13.5. No se ha probado otro SO.

## Archivos de trabajo

| Ruta | Función |
| --- | --- |
| `raiz_delivery/contracts.py` | Lee JSON estricto y valida el perfil inicial de fixture |
| `raiz_delivery/communications.py` | Mensajes de falta de evidencia, referencias y estados de audio/radio |
| `raiz_delivery/print_sheet.py` | HTML imprimible por resultado con las tres alternativas |
| `raiz_delivery/package.py` | Construcción temporal, hashes y publicación local por release |
| `raiz_delivery/__main__.py` | CLI `build`, `check`, `publish` |
| `fixtures/dev2-v3/` | Única entrada soportada hoy: fixture estructural sin cifras científicas |
| `tests/test_delivery.py` | Validación, errores, preservación de release y recorrido HTTP local |
| `scripts/check_dev2.py` | Ejecuta pruebas, construye, valida, publica y registra resultado |
| `build/package/` | Paquete generado y validado; nunca editar a mano |
| `build/site/current.json` | Puntero local a una release completa y validada |
| `build/site/releases/<build_id>/` | JSON y fichas inmutables de una versión |

## Ejecución individual

```powershell
python -m raiz_delivery build --input fixtures/dev2-v3 --output build/package
python -m raiz_delivery check --package build/package
python -m raiz_delivery publish --package build/package --site-root build/site
```

`publish` copia archivos localmente y cambia `current.json` solo después de
validar. No despliega en internet. Repetir el mismo build es idempotente;
contenido diferente exige un `build_id` nuevo y otra ruta de salida.
No se borran releases previas. Si falla la entrada se conserva el puntero previo.
La publicación simultánea desde varios procesos todavía no está soportada.

Para inspeccionar los archivos localmente:

```powershell
python -m http.server 8790 --bind 127.0.0.1 --directory build/site
```

Abrir `http://127.0.0.1:8790/current.json`, tomar `base_path` y añadir
`data/manifest.json`, `data/communications.json` o
`print/fixture-papa-quinua-descanso.html`. El servidor local sirve exclusivamente
el directorio generado. Detener con Ctrl+C. El HTTPS público y su comprobación
se harán al integrar con el hosting de Dev 3; no están implementados aquí.

## Límites de esta comprobación

Se comprueban el perfil de fixture, IDs, ausencia de cifras inventadas,
coherencia de mensajes/fichas, inventario, hashes, tamaños, construcción
reproducible, publicación local y descargas HTTP desde loopback.
Un hash prueba integridad, no validez científica ni autenticidad del autor.
`manifest.json` no se hashea a sí mismo; `current.json` guarda su hash externo.

No se ha probado impresión visual en navegador, móvil, teclado, audio real,
duración MP3, proveedor de voz, disponibilidad HTTPS ni revisión P5/P6.
Esos puntos siguen pendientes y no se presentan como aprobados.

## Primera tarea pendiente

Acordar con D1 y D3 el detalle JSON de `CONTRATO-INICIAL.md`. D1 debe entregar
un primer paquete real con procedencia y método; P6 confirma punto y parámetros.
Después se implementará el adaptador real y su validación científica estructural.
El adaptador actual **rechaza `downloaded` y `simulated`** a propósito: no basta
cambiar `mode` para convertir el fixture en datos reales. El contrato v3 permite
esos modos; este primer incremento todavía no los procesa.

## Relación con el centro de coordinación

La fuente inspeccionada fue `C:\Users\milae\Documents\raiz-hackathon`.
Esta es una copia editable en la carpeta de trabajo de la sesión.
No se modificó la fuente original ni se copió `team.sqlite3` (base activa del
tablero). El `server.py` copiado sigue siendo del centro; no sirve los nuevos
paquetes. No ejecutarlo como backend agrícola. Tampoco se actualizó el estado
del tablero ni se afirmó que otros integrantes aceptaron este detalle de contrato.

No introducir pronósticos a 24 horas, observaciones comunitarias, SQLite agrícola,
POST de simulación, Telegram, modo offline ni otras funciones retiradas del MVP.

## Audio con Meta MMS (14-nov-2026, noche)

El código de Dev 2 se trajo de la copia de trabajo de ChatGPT/Codex
(`Documents\Codex\2026-11-14\new-chat\work\raiz-hackathon`) a esta carpeta, sin tocar
`dist/`, `plan-equipo.json`, `raiz.html`, `server.py` ni `team.sqlite3`.
Ver `docs/dev2/AUDIO.md` y la bitácora de `PROCESO.md`.

```powershell
# Generar MP3 (requiere .venv-tts; ver AUDIO.md)
.venv-tts\Scripts\python scripts\generate_audio_mms.py --input fixtures\dev2-v31 --output assets\audio\fixture-dev2-v31-demo --languages es,quh,ayr
# Comprobar y publicar localmente con esos MP3
python scripts\check_dev2.py --audio-assets assets\audio\fixture-dev2-v31-demo
# Ver la demo: http://127.0.0.1:8790
python -m raiz_delivery serve --site-root build\agricultural-site
```

Un mismo `build_id` no admite contenido distinto. Para regenerar el demo fixture
con otros audios, primero hay que borrar `build/` (es salida generada).

## Actualización de planificación v3.1

El plan vigente ahora exige tres posiciones por secuencia (9 casos), KPI de
decisión/ciclo separados y contexto NOAA/IRI fechado. Ver
`docs/actualizacion-plan-v3.1.md`. Este adaptador inicial sigue probando solo
los tres registros fixture originales: no constituye integración de nueve
casos ni del paquete real. Antes de ampliarlo, acordar IDs caso/posición con D1/D3.
