# Datos, modelo, KPI y alertas de Raíz (tareas D1, asumidas por Dev 2)

> **Actualización 15-nov-2026, 01:40: integrado el contenido de P6** (`content/`, commit P6-1 a P6-6).
>
> - **Punto:** Obrajes, Soracachi (−17,83; −67,00; NASADEM 3809 m), la parcela de un productor.
>   - La meteorología de POWER es idéntica al punto anterior (misma celda de 0,5°).
>   - Solo cambia la radiación, que viene en una celda distinta de 1°.
> - **Calendario del productor:**
>   - papa: siembra 1-oct, cosecha 14-abr (195 d);
>   - quinua: siembra 15-oct, cosecha 13-abr (180 d);
>   - haba: siembra 1-sep, cosecha 28-feb (180 d).
>   - Coincide 3/3 con sus ventanas de siembra y cosecha.
> - **Heladas por etapa** (P6-2), porque la helada en floración es su principal pérdida:
>   - en floración: papa −2,5, quinua −2, haba −1 °C;
>   - en el resto del ciclo: papa −2,5, quinua −8, haba −5 °C.
> - **Dos suelos como escenarios:**
>   - SoilGrids en Obrajes: 106 mm/m;
>   - descripción del productor: 150 mm/m (P6, rango genérico NRCS).
>   - Las 3 primeras posiciones del ranking son la rotación papa→quinua→descanso con ambos suelos.
> - **«4 de 5»:** reproducido con el método exacto de P6 (normal 365 mm, n = 13). Los desvíos de los Niños fuertes son −37, −40, +30, −36 y −8 %.
> - **Límites declarados:**
>   - granizo (no modelable con POWER);
>   - umbrales de planta frente a aire a 2 m;
>   - riego por pozo.
> - **Audios del boletín de P6** (español MMS y quechua grabado por el productor) con el acta de P5. Ver `content/audio/LEEME.md` y `python -m raiz_data boletin p6`.
> - **Resultado:** 288 resultados (antes 144), que pasan el contrato. Las cifras de abajo que vienen de la versión anterior se reemplazan por las de `RESULTADOS.md`.

Fecha: 15-nov-2026. Código: `raiz_data/`. Cifras actuales: [RESULTADOS.md](RESULTADOS.md), generado desde los datos.

## 0. Cómo se ejecuta

```powershell
python -m raiz_data fuentes        # registro de fuentes por capas
python -m raiz_data todo           # descarga (una vez, con internet) + procesa
python -m raiz_data procesar       # reprocesa SIN internet desde datos/raw/ (~20 s)
python -m raiz_delivery build --input datos --output build/paquete-real --audio-assets assets/audio/<build_id>
python -m raiz_data alertas revisar | listar | simulacro | aprobar <id> --por "Nombre" [--audio]
python -m raiz_data boletin semanal [--audio]     |  boletin manual --texto "..." --autor "Nombre" [--audio]
python -m raiz_data programar      # imprime los comandos para tareas periódicas de Windows
```

Solo usa la biblioteca estándar de Python 3.10+. El audio necesita `.venv-tts` (ver `docs/dev2/AUDIO.md`).

## 1. Registro de fuentes por capas (`raiz_data/registry.py`)

| Capa | Para qué | Fuentes |
| --- | --- | --- |
| 1 · Base (global) | Entran al modelo | NASA POWER diario (16 variables, 1981–hoy), NOAA ONI, ISRIC SoilGrids 2.0 |
| 2 · Contraste (Bolivia) | Sensibilidad | SENAMHI: resúmenes mensuales con montos y normales 1991–2020 de Oruro – Ciudad |
| 3 · Verificación (Bolivia + NASA) | Comprobar, no alimentar | SENAMHI (predicción trimestral), INE (rendimiento, superficie y producción 1984–2025), VIDECI/prensa (sequías, heladas), calendario agrícola, NASA MERRA-2 (humedad del suelo) |
| 4 · Eventos (casi tiempo real) | Alertas | NASA FIRMS (incendios), USGS (sismos), GDACS (desastres) |
| Pendientes | Requieren cuenta Earthdata gratuita | NASA GPM IMERG, SMAP, MODIS NDVI |

**Adaptación a otras regiones:** las capas 1 y 4 son globales y funcionan cambiando el punto en
`registry.POINT`. Las capas 2 y 3 son nacionales: para otro país se agregan sus servicios
equivalentes (meteorológico, estadística agrícola, defensa civil) como nuevas entradas del registro.

**Respaldo local:** `raiz_data/fetch.py` guarda cada descarga tal cual llegó en `datos/raw/<fuente>/`,
con URL, fecha y SHA-256 en `datos/raw/registro.json`. Todo el procesamiento corre después sin red.
`datos/raiz_oruro.sqlite3` reúne en tablas el clima diario, la ET0, el ONI, el suelo, las 2322
campañas simuladas, los 144 resultados, los datos del INE, las verificaciones, las alertas y los boletines.

### Hallazgos al descargar (registrados, no ocultados)

- **SENAMHI no publica series diarias:** se piden a dirmethi@senamhi.gob.bo. Se usaron las cifras escritas en sus PDF mensuales.
- **INE:** en su web, los títulos de los enlaces de descarga estaban desfasados respecto de sus archivos. Se verificó el título interno de cada hoja y se renombró.
- **NASA POWER:** no tiene radiación solar antes de 1984 (1101 días). Para esos días la ET0 usa Hargreaves calibrada mes a mes contra Penman-Monteith.
- **FIRMS:** el feed de Suomi-NPP está vacío. Se usan los de NOAA-20 VIIRS y MODIS.

## 2. Cómo se «predice»: análogos históricos, no pronóstico

Raíz **no pronostica** el clima ni la cosecha. Responde: *en las campañas pasadas que empezaron
con un Pacífico parecido al actual, ¿cómo le fue a cada rotación?*

1. **Balance de agua diario** (FAO-56, un depósito) para cada rotación de 3 campañas, con el clima real de cada año.
2. **Clasificación ENSO:** cada campaña de decisión se clasifica con el ONI de NOAA del trimestre nov–dic–ene.
   - Niño: ≥ +0,5, e incluye a los fuertes.
   - Niño fuerte: ≥ +1,5.
   - Niña: ≤ −0,5.
   - Normal: entre −0,5 y +0,5.

   Las otras dos campañas de la ventana conservan su clima real.
3. **Datos recientes:**
   - El ONI de ago–oct 2026 es **+2,46**, y la NOAA (12-nov-2026) considera probable un Niño de fuerte a muy fuerte hasta ene–mar 2027. Por eso el escenario actual es «Niño fuerte».
   - Los análogos recientes son **2009, 2015 y 2023**; los del periodo 1981–2000, **1982 y 1997**.
   - El boletín semanal usa además la última semana de POWER.
4. **Muestra visible:** el sistema siempre muestra n, el rango (mínimo–máximo), la desviación y la sensibilidad. Con n < 3 no hay ranking ni conclusión.

## 3. Parámetros (`raiz_data/agro.py`; cada uno declara su fuente)

| Parámetro | Valor | Fuente |
| --- | --- | --- |
| ET0 | Penman-Monteith (ec. 6), ea del punto de rocío | FAO-56. Validado con los ejemplos 8 y 18 de FAO-56 en las pruebas |
| Kc papa | 0,50 / 1,15 / 0,75 | FAO-56 Tabla 12 |
| Kc haba (grano seco) | 0,50 / 1,15 / 0,30 | FAO-56 Tabla 12 |
| Kc quinua | 0,50 / 1,00 / 0,70 | García, Raes y Jacobsen (2003), lisímetro en el Altiplano boliviano |
| Raíz y p (agotamiento permitido) | papa 0,5 m / 0,35; haba 0,6 m / 0,45 | FAO-56 Tabla 22 |
| Raíz y p de la quinua | 0,8 m / 0,55 | **Supuesto** |
| Siembra | papa 1-nov (150 d), quinua 1-oct (170 d), haba 15-sep (170 d) | Épocas bolivianas reportadas (verificado 3/3). Fecha exacta y duración: **supuesto** |
| Descanso y rastrojo | Kc 0,30 / cobertura 25 %; Kc 0,25 / cobertura 10 % | **Supuesto** |
| Suelo (0–60 cm) | CC 0,290, PMP 0,142, ADT 148 mm/m | SoilGrids 2.0 (wv0033 y wv1500), estimación de mapa |
| Escorrentía | SCS, CN 75 | **Supuesto** |
| Estrés severo | Ks < 0,5 | Ec. 84 de FAO-56. Umbral: **supuesto** |
| Lluvia erosiva | ≥ 12,7 mm con cobertura < 30 % | Wischmeier y Smith (1978) |
| Viento erosivo | WS2M_MAX ≥ 6 m/s | **Supuesto** (≈ percentil 90) |
| Helada dañina | papa −2, haba −3, quinua −4 °C | **Supuesto** |
| Campaña aceptable | estrés ≤ 30 % del ciclo, ≤ 5 heladas y ≤ 5 días de lluvia erosiva con suelo expuesto | **Supuesto** de demostración |

Los «supuestos» deben ser revisados por P6/INIAF. Están en `catalog.json` para que la web los muestre.

### Decisión clave: por qué «estrés severo» y no cualquier déficit

En secano, el Altiplano tiene déficit de agua casi todo el ciclo: ETc ≈ 675 mm frente a ≈ 330 mm de
lluvia entre nov y mar. Contando cualquier déficit (Ks < 1), las 9 rotaciones daban 150/150 días y el
indicador no distinguía nada. Con Ks < 0,5 sí distingue años y cultivos, y coincide con las sequías reportadas.

## 4. Los 8 KPI (contrato v3.1)

Se calculan para la **campaña de decisión** y para el **ciclo de 3 campañas**. Se reporta la media de
las ventanas, con su mínimo, máximo, mediana y desviación.

| KPI | Definición |
| --- | --- |
| Riego neto requerido (mm) | Riego para mantener el agotamiento ≤ agua fácilmente disponible (corrida sin límite) |
| Riego neto aplicado (mm) | Riego aplicado con el presupuesto (0 en secano; 100 mm en el escenario hipotético) |
| Días de estrés severo | Días de cultivo con Ks < 0,5. En descanso, no aplica (`null` con motivo) |
| Cobertura planificada (%) | Promedio diario de la cobertura según etapa, descanso y rastrojo |
| Suelo expuesto con lluvia (días) | Cobertura < 30 % y lluvia ≥ 12,7 mm |
| Suelo expuesto con viento (días) | Cobertura < 30 % y viento máximo ≥ 6 m/s |
| Exposición térmica (días) | Días de cultivo con Tmin ≤ umbral de helada |
| Frecuencia de cumplimiento | Años en que la campaña fue «aceptable» (numerador/denominador) |

**Ranking:**
- Solo con n ≥ 3, sobre los KPI del ciclo.
- Normalización min–max común a los 9 casos.
- Pesos de demostración: estrés 0,30; riego 0,20; heladas 0,15; lluvia erosiva 0,15; viento 0,10; cobertura 0,10.
- Los empates comparten puesto.
- **Sesgo declarado:** las rotaciones con descanso tienen menos campañas cultivadas. Gastan menos agua y sufren menos estrés, pero también producen menos, y eso no se cuantifica.

**Balance:** cierra con un error de 10⁻¹² mm. El cambio de profundidad de raíz entre cultivos se
aproxima conservando el agotamiento relativo; el agua que esto agrega o quita se contabiliza en
`balance_adjust_mm` (media de 6,7 mm por campaña).

## 5. Sensibilidad con SENAMHI (segunda fuente boliviana)

Factor mensual = normal SENAMHI Oruro–Ciudad / normal POWER (1991–2020, periodo común): nov 0,85 ·
dic 0,80 · ene 1,02 · feb 1,08 · mar 1,01 · abr 0,90. Se repite toda la simulación con la lluvia
corregida y cada resultado guarda `sensitivity.decision_kpis_alt` y `delta`.

Ejemplo: papa, Niño fuerte reciente.
- Estrés: de 68 a 77 días.
- Campaña aceptable: de 1/3 a 0/3.

O sea, la conclusión **no es robusta** frente a la fuente de lluvia. El rango entre fuentes no es un intervalo de confianza.

## 6. Verificación (detalle y cifras en RESULTADOS.md)

- **SENAMHI:** la normal nov–mar de POWER difiere +3 % de la de la estación. Mismo signo de anomalía en 4/6 periodos recientes, pero POWER subestima la magnitud de las tormentas locales.
- **Sequías reportadas** (1982, 2015, 2022): 3/3 en el tercio más seco de 45 años.
- **Heladas reportadas** (2023, 2025): 0/2. POWER es una celda de ~50 km y no capta heladas locales. Por eso el KPI de heladas **subestima** el riesgo y la web debe decirlo.
- **INE:** las 3 campañas más secas simuladas (1991, 2022, 1988) tuvieron rendimientos bajo la tendencia en los tres cultivos.
  - Spearman: papa 0,24, quinua 0,40, haba 0,02.
  - El rendimiento departamental depende de muchos factores; esto es corroboración, no calibración.
- **Calendario:** 3/3 fechas de siembra dentro de las épocas reportadas.
- **NASA MERRA-2 (GWETROOT):** Spearman 0,93 con el balance. Comparte la lluvia de entrada, así que valida la física y no la lluvia.

## 7. Eventos repentinos y alertas (`raiz_data/alerts.py`)

| Fuente | Regla | Nivel |
| --- | --- | --- |
| NASA FIRMS | Foco a ≤ 30 km de una localidad o dentro del departamento | informativa (1–2 focos), precaución (3–9), alerta (≥ 10) |
| USGS | M ≥ 3,5 a ≤ 50 km, M ≥ 4,5 a ≤ 150 km o M ≥ 5,5 a ≤ 300 km | alerta si M ≥ 6 a ≤ 150 km; precaución si M ≥ 5 |
| GDACS | Evento a ≤ 500 km; naranja/roja en toda Bolivia | según el color de GDACS |

**Flujo:**
1. `revisar` (manual, o cada 30 min con el Programador de tareas) crea **borradores**. Cada uno lleva las localidades más cercanas con distancia y dirección, la evidencia, la fuente y la frase «pendiente de confirmación oficial».
2. Una persona ejecuta `aprobar <id> --por "Nombre"`. Recién entonces se exporta el texto y, opcionalmente, el MP3, a `datos/alertas/para_radio/`.

**Nunca se difunde automáticamente:** una falsa alarma causa daño, y las alertas oficiales son de
SENAMHI, VIDECI y el Observatorio San Calixto. `simulacro` crea una práctica rotulada como tal.

Prueba real del 15-nov-2026 a las 00:18:
- **5 focos FIRMS** a ~57 km al norte de la ciudad de Oruro (precaución);
- un sismo de M4,5 a 113 km de profundidad (informativa);
- dos avisos verdes de GDACS (informativa).

## 8. Boletines (`raiz_data/bulletins.py`)

- **Semanal:** lluvia de los últimos 7 días de POWER frente a la normal 1991–2020, noches con helada, la fase ENSO más reciente con la perspectiva de NOAA, y el análogo histórico de la papa. Dura menos de 60 s y es un borrador con vigencia editorial de 7 días.
- **Manual:** texto escrito por el equipo, con autor.
- **Periódico:** `programar` imprime los comandos `schtasks` (boletín los lunes a las 07:00 y alertas cada 30 min). La persona los ejecuta; no se crean solos.

## 9. Límites que la presentación debe decir

- **Punto provisional:** es una celda POWER de ~50 km sobre Oruro, no una parcela. P6 debe confirmarlo.
- **Muestras chicas:** Niño fuerte tiene n = 2 en 1981–2000 (sin ranking) y n = 3 en 2001–2025. **2009 fue un Niño fuerte lluvioso**, así que el promedio reciente no es una regla.
- **Supuestos sin revisar:** los parámetros marcados como supuesto no tienen revisión agronómica humana.
- **Heladas:** el KPI subestima el riesgo real.
- **Lo que no se cuantifica:** rendimiento, ingresos, erosión en toneladas ni carbono.
- **ET0 en altura:** FAO-56 Penman-Monteith no está calibrado por encima de 3000 m (García et al. 2003), así que la ET0 podría estar sobrestimada.
