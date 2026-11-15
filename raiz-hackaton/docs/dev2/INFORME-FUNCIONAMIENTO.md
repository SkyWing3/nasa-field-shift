# Informe: cómo funciona el publicador de Dev 2 (`raiz_delivery`)

Fecha: 14-nov-2026. Base: el código de `raiz_delivery/`, `scripts/` y `tests/` de esta carpeta.
Cada afirmación remite al archivo que la implementa.

---

## 1. ¿Qué es D1?

**D1 = Dev 1**, uno de los seis roles del plan (`plan-equipo.json`). En el tablero, sus siete
tareas (D1-1 a D1-7) están asignadas a **Franco**. D1 es la parte científica:

| Tarea | Qué produce |
| --- | --- |
| D1-2 | Descarga y depura NASA POWER (clima diario) para el punto de Oruro |
| D1-3 | Compara el clima histórico (1981–2000) con el reciente (2001–2025) |
| D1-4 | Clasifica cada campaña como Normal, Niño o Niña con el índice ONI de NOAA |
| D1-5 | Calcula el balance de agua y los indicadores (KPI) de las tres rotaciones |
| D1-6 | **Entrega el paquete científico**: tres archivos JSON más los datos originales descargados |
| D1-7 | Sensibilidad y calidad de la evidencia |

Dev 2 (tú) **no calcula ciencia**. Recibe el paquete de D1, lo revisa, lo convierte en mensajes,
fichas y audio, y lo publica. Es la separación que fija el contrato (`contracts/README.md`).

### Qué entrega D1 exactamente

Una carpeta de entrada con esta estructura (`contracts/dev2-v31.md`):

```text
entrada/
  catalog.json   punto de Oruro, 3 rotaciones, 9 casos, periodos, presupuestos de agua, suelos
  climate.json   series diarias (lluvia, temperatura…) con su fuente
  results.json   un registro por caso y escenario, con ventanas históricas y KPI
  raw/…          archivos originales tal como se descargaron de NASA POWER y NOAA
```

**Hoy D1 no ha entregado nada.** Por eso todo usa `fixtures/dev2-v31/`, que es un paquete de
ejemplo con la misma forma, pero sin datos (KPI `null`, cero ventanas y la advertencia «FIXTURE»).

---

## 2. Validación: qué se comprueba y qué NO se puede comprobar

Código: `raiz_delivery/contracts.py`, más de 100 reglas. Se ejecuta en cada `build`, `check` y `publish`.
Si cualquier regla falla, el comando termina con error y **no publica nada**. La versión
anterior sigue activa.

### 2.1 ¿Cómo se sabe si un dato es inventado? Respuesta honesta: no se puede saber del todo

Ningún programa puede demostrar que un número viene de la NASA y no se escribió a mano.
Lo que sí hace el validador es **cerrar los caminos más comunes para colar datos falsos o
sin respaldo**, y **dejar rastro** para que una persona pueda verificarlos:

| Mecanismo | Qué detecta | Qué NO detecta |
| --- | --- | --- |
| **Procedencia obligatoria por fuente**: agencia, producto, versión, URL HTTPS pública, fecha de consulta, periodo, resolución, unidades, control de calidad, licencia | Datos «sin fuente» o con la fuente incompleta | Una fuente bien descrita pero falsa |
| **Original obligatorio con huella SHA-256**: cada fuente debe incluir el archivo descargado (`raw/…`), y el validador recalcula su hash y su tamaño | Que el archivo original falte o se haya modificado después de declararlo | Que el original en sí sea auténtico. Para eso, una persona (P6, tarea P6-3) vuelve a descargarlo desde la URL declarada y compara el hash |
| **Separación ejemplo/real**: el modo `fixture` exige cero fuentes, KPI `null`, coordenadas `null` y la palabra «FIXTURE» en las advertencias. El modo real exige fuentes, fechas y versión del modelo | Que un ejemplo se presente como resultado real, o al revés. **No basta con cambiar `mode`** | — |
| **Ningún faltante disfrazado**: un valor ausente debe ser `null` con motivo, nunca 0 | Rellenar huecos con ceros o con valores inventados sin explicación | — |
| **Coherencia interna** (detalle en 2.2) | Números imposibles o contradictorios | Números plausibles pero mal calculados |

Conclusión: el validador comprueba **integridad, estructura y coherencia**. La **veracidad
científica** la aseguran personas: P6 audita las fuentes (P6-3) y D1 entrega un método reproducible.
El propio informe de calidad (`data/quality.json`) lo declara siempre como bloqueo pendiente:
`human_editorial_and_agronomic_review_not_verified_by_data_validation`.

### 2.2 Lista de validaciones

**Formato JSON**
- Rechaza claves duplicadas, `NaN` e `Infinity`, y fechas sin zona horaria.
- Rechaza IDs con caracteres peligrosos y rutas con `..`, `\`, `%`, `?` o `#`. Esto evita leer archivos fuera de la carpeta.

**Sobre común** (los 3 archivos)
- `schema_version` debe ser 3.0.
- Los tres archivos deben llevar el mismo `build_id`. Así no se mezclan corridas distintas.
- `mode` debe ser `fixture`, `downloaded` o `simulated`, y no se puede mezclar ejemplo con real.
- En datos reales, el clima debe ser `downloaded` y los resultados `simulated`.
- La fecha de los datos no puede ser posterior a la fecha de generación.

**Fuentes**
- Todos los campos de procedencia mencionados en 2.1.
- La URL no puede llevar credenciales, tokens ni firmas temporales.
- El periodo no puede estar invertido.
- Cada `source_id` aparece una sola vez y con la misma procedencia en todos los archivos.

**Catálogo**
- Solo se acepta el piloto de Oruro (`oruro-pilot`).
- En datos reales: latitud y longitud válidas, el estado del punto (punto regional o parcela validada) y su representatividad documentada.
- Exactamente tres rotaciones (papa/quinua/descanso, papa/quinua/haba y papa/haba/descanso), sin alterar su secuencia.
- Exactamente nueve casos (3 rotaciones × 3 posiciones). Cada cultivo de decisión debe corresponder a su posición.
- Presupuestos de agua de 0 mm o más y suelo marcado como medido, estimado de mapa o supuesto.

**Clima**
- Cada serie tiene variable, unidad, fuente declarada y naturaleza `downloaded`.
- Ninguna fecha repetida.
- Cada valor es un número finito o `null` con motivo.

**Resultados** (lo más importante)
- Cada registro apunta a un periodo, presupuesto, suelo y caso existentes, con un escenario ENSO válido (Normal, Niño, Niña o Niño fuerte).
- **Ventanas históricas:**
  - cada una tiene tres campañas consecutivas y completas, dentro de su periodo y entre 1981 y 2023;
  - no se acepta repetir la misma terna de años con otro ID. Esto evita inflar la muestra (la auditoría lo detectó y se corrigió);
  - `n_windows` y `n_unique_campaigns` deben coincidir con la lista.
- **Muestra:**
  - sin ventanas, los KPI y el ranking deben ser `null` con motivo;
  - con menos de 3 ventanas, no se acepta ranking: la muestra es insuficiente para concluir.
- **KPI:**
  - solo se aceptan los 8 del alcance (riego neto requerido y aplicado, días de estrés hídrico, cobertura, suelo descubierto con lluvia o viento, exposición térmica y frecuencia de cumplimiento);
  - cada uno lleva la unidad correcta (mm, días, %, fracción), naturaleza `simulated`, método y fuentes declaradas;
  - porcentajes entre 0 y 100;
  - la frecuencia debe ser exactamente numerador/denominador, con denominador igual a las ventanas.
- **Ranking**, si D1 lo envía:
  - reglas explícitas: normalización, pesos ≥ 0, dirección (minimizar o maximizar) y regla de empate;
  - no puede mezclar KPI de campaña con KPI de ciclo;
  - un caso no puede ganar por tener un KPI ausente;
  - todos los casos comparados deben usar las mismas ventanas, rangos y pesos.
- Cada escenario (periodo × ENSO × presupuesto × suelo) debe traer los 9 casos, aunque sea con faltantes explícitos.

**Lo que el validador NO hace:** no recalcula el balance de agua, no verifica que el ONI
esté bien aplicado y no comprueba la conservación del agua. Eso corresponde a D1 y a la revisión de P6.

Las reglas tienen pruebas en `tests/test_contracts_v31.py` y `tests/test_audit_regressions.py`.

---

## 3. Mensajes: cómo, cuándo y con qué se generan

**No hay trigger, ni programación horaria, ni servidor que los genere solos.** Se generan
**una vez, por lotes, cuando alguien ejecuta el comando de construcción**:

```powershell
python -m raiz_delivery build --input <carpeta de D1> --output build/paquete [--editorial editorial.json] [--audio-assets assets/audio/<build_id>]
```

o todo junto, con pruebas incluidas: `python scripts/check_dev2.py --audio-assets …`.

Así lo exige el contrato: resultados **precalculados**, sin llamadas a NASA, NOAA ni TTS
mientras alguien usa la web. Mientras no cambie la entrada, los mensajes no cambian. Si D1
entrega un paquete nuevo, se vuelve a ejecutar el comando y sale un `build_id` nuevo.

**De qué manera** (`raiz_delivery/communications.py`, función `make_communications`):

1. Por cada registro de `results.json` se arma un mensaje con una **plantilla fija en
   español**. No usa inteligencia artificial: son frases de Python que se rellenan con los datos.
2. El encabezado dice: «Oruro. Secuencia candidata: papa, quinua, descanso. Cultivo de decisión: papa. Posición 1.»
3. El cuerpo depende del tipo de dato:
   - **Ejemplo (fixture):** «DEMOSTRACIÓN CON FIXTURE. No es un resultado agrícola real…».
   - **Real:** «EVALUACIÓN HISTÓRICA SIMULADA, no observación de parcela ni pronóstico. Periodo X; ENSO de la campaña inicial: Y. Presupuesto de agua… Ventanas válidas: n…». Después enumera los KPI de la campaña de decisión y los del ciclo completo; los que faltan aparecen como «no disponible (motivo)».
   - Si n < 3, añade: «Muestra insuficiente: no se concluye una preferencia ni robustez».
4. Todos terminan con la acción prudente: «Revisar agua, cobertura, suelo y calendario con el equipo técnico antes de decidir».
5. Cada mensaje lleva sus identificadores (`build_id`, `result_id`, `case_id`) y los datos para la ficha.

**Vigencia editorial** (`examples/editorial.pending.json`): un archivo opcional con `issued_at`
(fecha de emisión), `valid_until` (vigente hasta), `review_status` y el revisor. No es un
pronóstico, sino el periodo durante el cual el equipo respalda ese texto. Sin ese archivo,
el mensaje queda como «borrador no emitido».

**Lo que falta:** P5 y P6 deben redactar o aprobar las plantillas (tareas P5-1 y P6-2). Hoy el
texto es el que escribió ChatGPT, prudente pero sin revisar.

---

## 4. Boletín de radio: cómo se prepara

Tiene tres pasos, y ninguno transmite nada al aire:

1. **Texto:** se genera en el mismo `build`, con otra plantilla fija (`make_communications`, bloque
   `regional_bulletin`). Es un mensaje **general para la región**: zona (Oruro), fuentes (agencias),
   aviso de que el pasado no garantiza el futuro, la acción prudente y la vigencia editorial.
   No incluye nombres, coordenadas ni recomendaciones por finca, como pide el plan.
2. **Audio:** el script `scripts/generate_audio_mms.py` lo convierte en MP3. Como el boletín
   **debe durar 60 s o menos**, si se pasa el script acelera la voz poco a poco hasta 1,25× y lo
   registra. Si aun así no entra, falla y pide acortar el texto. El de ejemplo dura 46,8 s.
3. **Distribución:** el boletín queda marcado `distribution_status: prepared_not_broadcast`.
   Llevarlo a la radio es **manual**: alguien (P6, tarea P6-5) descarga el MP3 y lo entrega a una
   emisora real. Mientras no haya una emisión comprobada, el sistema no dice que se transmitió.

---

## 5. Fichas imprimibles y página índice

**Fichas** (`print/<result_id>.html`, generadas por `raiz_delivery/print_sheet.py`): una página
HTML **por cada caso**, hoy 9. Están pensadas para imprimir desde el navegador con Ctrl+P y
entregarlas en papel a un técnico o productor. Cada una contiene:

- **Mensaje y audio:** el mensaje completo, su audio (con el botón de descarga) y las versiones en quechua y aymara marcadas como EXPERIMENTAL.
- **Datos de la evidencia:** el caso elegido y su cultivo de decisión, el periodo, el ENSO, el número de ventanas, el suelo, el presupuesto de agua, el calendario y las reglas.
- **Comparación:** las tres rotaciones candidatas, con la elegida resaltada, y la tabla de los 9 casos.
- **Indicadores:** dos tablas, KPI de la campaña de decisión y KPI del ciclo completo, con valor, unidad, método y motivo del faltante.
- **Respaldo:** las fuentes, los supuestos y los límites.

Al imprimir se ocultan los reproductores de audio. Además, si la vigencia editorial venció, la
página oculta el audio y lo indica. No hace falta ningún motor de PDF.

**Página índice** (`index.html`): es la **portada del paquete**. Muestra:

- **Por cada caso:** una tarjeta con su mensaje, su audio y un enlace a su ficha.
- **El boletín regional:** su texto y su audio.
- **Enlaces técnicos:** el manifiesto de integridad y el JSON de textos.

Es la vista para revisar la entrega Dev 2 completa. La web final con controles y gráficos es tarea de Dev 3.

---

## 6. Audio: cómo se usa exactamente

**Para escucharlo (cualquier persona):**
1. Abre la página índice o una ficha.
2. Pulsa ▶ en el reproductor. Nunca se reproduce solo.
3. «Descargar MP3» baja el archivo, por ejemplo para pasarlo por WhatsApp o llevarlo a la radio.

**Para generarlo (Dev 2), en dos pasos:**

```powershell
# 1. Crear los MP3 (necesita el entorno .venv-tts; tarda ~4 min en español y ~10 min por idioma traducido)
.venv-tts\Scripts\python scripts\generate_audio_mms.py --input <carpeta de D1> --output assets\audio\<build_id> --languages es,quh,ayr

# 2. Unirlos al paquete y publicarlo
python scripts\check_dev2.py --audio-assets assets\audio\<build_id>
```

Qué ocurre en el paso 1:
- **Preparación del texto:** toma el texto de cada mensaje y lo pasa a «texto hablado»: números, fechas y siglas en palabras, porque la voz salta los dígitos.
- **Voz en español:** lo sintetiza con la voz de Meta MMS en español, en tu PC, sin internet una vez descargado el modelo.
- **Quechua y aymara:** el texto se traduce primero con NLLB o se toma de un archivo de traducción humana, y después se sintetiza con su propia voz.
- **Salida:** guarda los MP3 y un `catalog.json` con el hash de cada audio, su duración, la voz, la licencia y el estado de revisión.

Qué ocurre en el paso 2:
- El importador **rechaza** cualquier audio que no corresponda exactamente al texto vigente
  (lo compara por hash), que sea de otro caso, que esté alterado o que tenga una duración falsa.
- Si el texto cambia, hay que regenerar el audio.

**Estados:**
- **Español:** queda `review: pending` hasta que P5 lo escuche completo.
- **Quechua y aymara:** son EXPERIMENTALES (`speaker_review: pending`) y el modo producción los rechaza
  hasta que un hablante los apruebe.
- **Corrección de traducciones:** se hace con `source/traducciones-borrador.json`.
- **Licencia:** CC BY-NC 4.0 (uso no comercial y con atribución). El crédito aparece en la página.

---

## 7. «Web de solo lectura»: qué significa

El servidor del paquete (`python -m raiz_delivery serve`, en `raiz_delivery/serve.py`) **solo
entrega archivos ya generados**. Nadie puede modificar nada desde el navegador:

- Solo responde GET. Un POST, es decir enviar datos, devuelve el error 501.
- No hay formularios, ni cuentas, ni base de datos, ni cálculos al momento.
- Solo sirve los archivos listados en el manifiesto con hash. Cualquier otra ruta devuelve 404, igual que listar carpetas o intentar `../`.
- La raíz `/` redirige a la versión activa según `current.json`, después de comprobar el hash de su manifiesto.

Es distinto del **tablero** (`server.py`), que sí permite cambiar estados de tareas. Son dos sistemas separados a propósito.

---

## 8. Datos reales de D1, respaldo local y recomendaciones

### 8.1 Qué se necesita para usar datos reales

1. **P6 confirma el punto de Oruro** (coordenadas) y el calendario del productor (P6-1).
2. **D1 descarga NASA POWER y el ONI**, calcula y entrega la carpeta del §1 con `mode: downloaded/simulated`.
3. Dev 2 ejecuta `analyze` y `build`. Si algo no cumple el contrato, el error dice exactamente qué
   regla falló, y D1 lo corrige.
4. Se regeneran los audios con el texto real, P5 los escucha y P5/P6 aprueban la vigencia editorial.

### 8.2 Respaldo local sin depender de internet

**Ya existe, en archivos.** No hace falta una base de datos para esto:

- Cada versión publicada queda guardada en `build/agricultural-site/releases/<build_id>/`. Ahí están los JSON de D1, **los originales descargados de NASA y NOAA** (`data/raw/…`), los mensajes, las fichas, los MP3 y el manifiesto con hashes.
- La web nunca consulta a la NASA ni a NOAA: sirve esa copia local, así que funciona sin internet en la misma red.
- Las versiones anteriores no se borran. Si una nueva falla, la anterior sigue activa, y se puede volver a una versión previa con `activate`.

**Sobre guardarlo en una base de datos:** el plan vigente pone «SQLite agrícola» y «modo offline»
**fuera del alcance** del MVP. Las carpetas versionadas con hash cumplen la función de respaldo.
Si el equipo decide que igual quiere una base local, hay que cambiar el plan con P4 (alcance) y D1 (formato).

**Lo que no está respaldado:** `build/` está fuera de git. Para conservar el paquete final hay que
copiar esa carpeta a otro lado (es parte de D2-6: «respaldo del paquete final»).

### 8.3 ¿Cómo son las recomendaciones?

**Hoy no existe ninguna recomendación**, porque D1 no ha calculado resultados. Además, por diseño,
el sistema **no dice «siembra X»**:

- Muestra, para cada caso, los KPI históricos: agua requerida, días de estrés, suelo descubierto con lluvia o viento, cobertura y exposición térmica.
- Si D1 envía un ranking, lo muestra con sus reglas, pero solo cuando hay 3 ventanas o más.
- El cierre siempre es «revisar con el técnico antes de decidir».

Para ver cómo se vería una recomendación real hace falta, como mínimo, un paquete de D1 con datos.
Mientras tanto, se podría preparar un **ejemplo con cifras ficticias, rotulado como tal**, solo para
ver el formato. No puede presentarse como resultado.

---

## 9. El «enlace público con la versión vieja»

En esta PC hay un túnel de Cloudflare (`cloudflared`, activo desde el 14-nov 19:50) que publica en
internet **`https://otherwise-permitted-ala-writings.trycloudflare.com`**. Lo abrió la sesión de
ChatGPT. Ese enlace apunta al puerto 8790, donde sigue corriendo el servidor que dejó ChatGPT con
**su** paquete anterior, el que no tiene audio. Comprobado el 14-nov: 0 reproductores en la página.

- El paquete nuevo, con los 30 MP3, está en `raiz-hackathon/build/agricultural-site`, pero no está publicado en ese enlace.
- Los enlaces `trycloudflare.com` son temporales: cambian si se reinicia el túnel o la PC.
- No sabemos si alguien del equipo recibió ese enlace.
- La publicación final por HTTPS es una tarea pendiente (D2-6), junto con Dev 3.

---

## 10. Plan v3.1

**Aplicado el 14-nov-2026.** Se copiaron desde la copia de ChatGPT
(`Documents\Codex\2026-11-14\new-chat\work\raiz-hackathon`) los seis archivos que cambian:
`plan-equipo.json`, `raiz.html`, `README.md`, `contracts/README.md`, `dist/index.html` y `dist/app.js`.
Antes de copiarlos se comprobó que los de esta carpeta eran los originales v3 sin cambios, y
esas versiones v3 siguen en `Documents\raiz-hackathon`.

El tablero (`team.sqlite3`) se reemplazó por la base v3.1 usando la copia de respaldo de SQLite.
Conserva los 37 IDs, los estados (D2-1 a D2-6 «En curso») y la tabla `plan_revisions` con v3 y v3.1.
La base anterior quedó en `team.sqlite3.v3-respaldo`, que git ignora.

Verificación: se levantó `server.py` en un puerto de prueba. Las 37 tareas coinciden con el plan
v3.1, y la página y `app.js` servidos son idénticos a `dist/`. Las 63 pruebas de Dev 2 pasan.
El detalle de los cambios está en `docs/actualizacion-plan-v3.1.md`.

---

## 11. Actualización 15-nov-2026: lo que cambió respecto de este informe

Dev 2 asumió las tareas de D1 (acordado con Franco). Detalle completo en
[docs/datos/METODOLOGIA.md](../datos/METODOLOGIA.md) y cifras en [docs/datos/RESULTADOS.md](../datos/RESULTADOS.md).

- **§1 «D1 no ha entregado nada»: ya no aplica.**
  - `python -m raiz_data todo` descarga NASA POWER (1981–2026), el ONI, SoilGrids, SENAMHI, el INE y GeoNames.
  - Calcula el balance de agua y los 8 KPI de los 9 casos × 2 periodos × 4 fases ENSO × 2 presupuestos (144 resultados).
  - Escribe `datos/catalog.json`, `climate.json` y `results.json` en **modo real**: `downloaded` / `simulated`.
  - El validador de Dev 2 los acepta: `structurally_valid_precalculated_inputs`.
- **§2 «¿cómo sabemos si es inventado?»:** se suma la verificación externa (SENAMHI, INE, eventos de
  VIDECI, calendario, MERRA-2) y la sensibilidad con la lluvia corregida por SENAMHI. Los resultados que no coinciden también se publican.
- **§3 y §4: los mensajes ya no se generan «una sola vez».**
  - **Paquete:** `raiz_delivery build --input datos` regenera los 144 mensajes cuando cambian los datos.
  - **Bajo demanda:** `python -m raiz_data boletin semanal` (con los datos más recientes) y `boletin manual --texto "..."`.
  - **Periódico:** `python -m raiz_data programar` da los comandos del Programador de tareas de Windows (boletín semanal y revisión de alertas cada 30 min).
  - **Por evento:** `python -m raiz_data alertas revisar` crea borradores ante incendios (NASA FIRMS), sismos (USGS) o desastres (GDACS), con las localidades afectadas.
  - **Aprobación:** siempre requieren `alertas aprobar <id> --por "Nombre"`. No hay difusión automática.
- **Mensajes reales en lenguaje claro:** «la papa tuvo en promedio 68 días de estrés severo (entre 44 y 87),
  habría necesitado 355 mm de riego y la campaña resultó aceptable en 1 de 3 años; con la lluvia corregida
  según SENAMHI serían 77 días». La tabla completa sigue en la ficha.
- **§8.2 respaldo local:** además de las versiones publicadas, `datos/raw/` guarda cada descarga con su
  hash, y `datos/raiz_oruro.sqlite3` consolida todo en tablas. Se regenera sin red en ~20 s.
- **§8.3 recomendaciones:** ya existen.
  - Escenario actual (Niño fuerte, secano): papa→quinua→descanso queda primera en el ciclo; las rotaciones sin descanso, últimas.
  - Con el sesgo declarado: el descanso ahorra agua pero produce menos, y eso no se mide.
