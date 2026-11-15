# Raíz · contrato del MVP integrado v3.1

Especificación para implementar; estos archivos no son resultados agrícolas ya
construidos. Plan: `plan-equipo.json`, versión `2026-11-14-altiplano-fusion-v3.1`.
Zona horaria de presentación: America/La_Paz.

## Alcance y responsables

- Una zona piloto Oruro. P6 fija el punto y su representatividad; no reutilizar
  Patacamaya como si fuera Oruro ni ciudad como finca validada.
- Papa, quinua, haba y descanso. Secuencias de tres campañas anuales: base
  candidata papa/quinua/descanso; alternativas papa/quinua/haba y papa/haba/descanso.
  `baseline_status: assumed` hasta confirmar orden en una parcela y riego.
- D1: descarga, QA, ONI, clima, balance y resultados. D2 (Nicole): validar/publicar
  paquetes, ficha, mensajes, audio y radio. D3: controles y accesibilidad.
  P6: agronomía y fuentes; P5: contenido/pruebas; P4: formato/hora y entrega.
- Procesamiento por lotes, JSON precalculado y servidor estático HTTPS.
  No llamadas a NASA, NOAA ni TTS al interactuar. FastAPI solo si ya integrado,
  como adaptador del mismo contrato; no dependencia nueva obligatoria.

Fuera: Santa Cruz, MODIS obligatorio, pronóstico/corrección a 24 h, `/forecast`,
`/verification`, «¿Acertamos?», `POST /api/simulate`, `POST/GET /api/observations`,
SQLite agrícola, Telegram, PWA y sincronización offline. `/api/tasks` y SQLite
existentes pertenecen al centro de coordinación: no borrar esa base ni confundirla
con una API agrícola. Los archivos de este contrato se implementan en la futura app.

## Archivos públicos

| Archivo | Contenido | Dueño |
| --- | --- | --- |
| `/data/catalog.json` | Punto, cultivos, suelo, secuencias, reglas y presupuestos | D1 + P6 |
| `/data/climate.json` | Periodos, décadas, campañas y ONI | D1 |
| `/data/results.json` | Ventanas, KPI, exclusiones y fuentes | D1 |
| `/data/communications.json` | Ficha/texto/audio por resultado y boletín regional | D2 + P5/P6 |
| `/data/manifest.json` | Versión, fuentes, método, hashes y archivos | D2 integra |
| `/audio/*.mp3` | Grabaciones o TTS revisados, ya generados | D2 |

## Sobre común

```json
{
  "schema_version": "3.0",
  "build_id": "fixture-v3",
  "mode": "fixture",
  "generated_at": null,
  "data_as_of": null,
  "model_version": null,
  "sources": [],
  "assumptions": [],
  "warnings": ["Ejemplo de contrato; no resultado real"],
  "data": null
}
```

`mode`: `fixture`, `downloaded` o `simulated`. Clima real en una simulación no
convierte su salida en observación. Etiquetar naturalezas por variable. Faltante
`null` con motivo; no cero. Instantes ISO 8601 con zona; campañas con calendario.
Alinear UTC/LST de POWER antes de cruzar otra fuente. Un `build_id` común evita
mezclar archivos de corridas diferentes.

Por fuente: ID, agencia, producto, versión, URL pública estable, consulta, periodo,
resolución espacial/temporal, unidades, QA, original, sha256, bytes y licencia.
No publicar credenciales ni URLs firmadas. NASA POWER es la base climática;
ONI es NOAA, clasificación externa. Registrar regla, umbral, persistencia y
ventana de ONI antes de clasificar; no equivale a Niño 1+2 ni predicción agrícola.

## Dos ejes de evaluación

1. Periodos iniciales: 1981–2000 y 2001–2025, ajustables según completitud con
   método registrado. Comparar medias/tasas por campaña, no totales de periodos
   de distinta longitud. Mostrar n, dispersión y vacíos. Una diferencia no prueba
   tendencia, significancia ni causalidad. 2026 parcial se distingue expresamente.
2. ENSO: Normal/Niño/Niña en la primera campaña de cada ventana histórica de tres
   campañas. Las otras dos conservan su meteorología histórica; no repetir un año
   seco tres veces ni suponer ENSO persistente. Mostrar campañas y regla usada.

Nov–mar cruza el año civil. Cada ventana exige tres campañas consecutivas completas.
Cada secuencia se evalúa en sus tres posiciones cíclicas (nueve casos).
Declarar la posición y el cultivo de decisión, con meteorología, suelo,
inicialización hídrica y manejo comparables; no exigir papa en todos los inicios. Excluir ventanas que crucen periodos de comparación y
registrar motivo. Mostrar ventanas válidas y campañas únicas: ventanas solapadas
no son independientes. Muestra insuficiente: no concluir robustez; sin ventanas:
KPI/ranking `null` con motivo. No forzar un ranking diferente para la demo.

`analysis_point_id: oruro-pilot` identifica el punto, no prueba sus coordenadas.
Latitud/longitud desconocidas `null`; no descargar hasta fijar punto real.
`location_status` separa punto regional y parcela validada. Perfil de suelo:
`measured`, `map_estimate` o `scenario_assumption`; retención y profundidad con
fuente/método. Un calendario aportado no confirma el orden en la misma parcela.

## Resultados y controles

Cada registro contiene `result_id`, `build_id`, punto, secuencia, `position_id`, `case_id`, `decision_crop`, `period_id`,
`enso_initial_phase`, ventanas y n, `water_budget_id`, suelo, calendario, fase
inicial, residuos, `decision_kpis` para la campaña y y `cycle_kpis` para y/y+1/y+2,
KPI por ventana/agregado, fuente/método/unidad y exclusiones.

El catálogo enumera presupuestos ya calculados. Secano se usa solo si procede;
valores hipotéticos adicionales son entradas, no límites agronómicos oficiales.
Cambiar presupuesto selecciona otra corrida precalculada, no solo otro rótulo.
No ofrecer controles que simulen cálculos inexistentes.

Los pesos no negativos con suma positiva reordenan KPI válidos comparables.
Declarar normalización, dirección de preferencia, empates y faltantes; no mejorar
una puntuación por omitir un KPI. Aplicar restricciones con reglas explícitas.

## Balance y KPI

- Balance diario de lluvia, escorrentía, infiltración, ET, riego, drenaje y
  almacenamiento con límites físicos. Continuidad entre cultivos e inicialización
  declarada por ventana; comprobar conservación. Kc con fuente, nunca inventado.
- `net_irrigation_requirement_mm`: demanda bajo objetivo declarado; separar
  `net_irrigation_applied_mm` restringido por presupuesto. Presupuesto cero no
  borra la necesidad de agua ni el estrés residual. No es riego bruto/extracción.
- `water_stress_days`: umbral por cultivo/etapa y fuente explícitos.
- `planned_coverage_pct`: calendario/residuos; descanso no implica desnudez.
- `bare_rain_exposure_days`, `bare_wind_exposure_days`: coincidencias separadas
  con umbral documentado. Si se unen, evitar doble conteo. Proxy, no erosividad
  calibrada ni toneladas de erosión derivadas solo de lluvia diaria.
- `thermal_exposure_days`: etapa/umbral; no mortalidad ni helada de chacra medida.
- `constraint_pass_frequency`: numerador/denominador de ventanas válidas del
  escenario inicial. Denominador cero → `null`. Frecuencia, no garantía futura.
- Calidad: fuente, completitud, n, campañas únicas, supuestos y revisión humana.

No cuantificar rendimiento, ingresos, carbono, fijación de N ni animales
alimentados sin calibración. Forraje y leguminosas se describen cualitativamente.

## Sensibilidad

Mostrar dispersión entre ventanas y, si existe contraste utilizable, KPI por
fuente en periodo común. Comprobar variables y linaje: dos proveedores pueden
compartir reanálisis. Min–max entre fuentes no es intervalo de confianza ni toda
la incertidumbre. Sin contraste, `sensitivity_status: not_evaluated` con motivo.
No duplicar POWER con otro nombre para fingir dos fuentes. Sin estación
representativa, no declarar validación de campo.

## Ficha, texto, audio y radio

Ficha/audio se enlazan a `result_id`, `build_id`, periodo, ENSO de decisión,
presupuesto, secuencia, posición y caso. Distinguir KPI de decisión y ciclo. Texto/audio expresan lo mismo. Sin audio coincidente,
mostrar no disponible o resumen general claramente identificado; no reproducir
mensaje de otro escenario como específico.

Separar fecha de datos de `issued_at` y `valid_until`: vigencia editorial, no
horizonte meteorológico. Español revisado; otros idiomas fuera si no hay hablante
y revisión agronómica. Licencia de voz registrada. Reproducción al pulsar, texto
equivalente y descarga real. Ficha imprimible con tres secuencias y sus posiciones (9 casos), selección, cultivo de decisión, n,
suelo, presupuesto, reglas, fuentes y límites; impresión nativa suficiente.

Boletín regional general de hasta 60 s con zona, fuente, fecha y vigencia editorial.
Sin nombres, coordenadas de finca ni heladas futuras presentadas como aviso.
`distribution_status: prepared_not_broadcast` hasta emisión comprobada. Radio
unidireccional al oyente sin internet; alcance depende de emisora real. Caducado
o ausente se informa, no se recicla. La generación de MP3 no transmite ondas.

## Aceptación

Un comando reproduce el paquete con archivos reales y versionados. Recorrido:
Oruro y NASA → periodos/ENSO → tres rotaciones → suelo/sensibilidad → ficha/audio
y boletín. Verificar esquema, IDs, referencias, fechas, unidades y hashes. Sin
mezclar builds ni consultar proveedores al interactuar. Mostrar errores, `null`,
muestra insuficiente, empates, falta de red y MP3 ausente. Probar teclado, móvil,
impresión y audio. No hay formulario agrícola ni sincronización offline.

Meta interna domingo 10:30–11:00 Bolivia frente al cierre local de 12:00 indicado
en la fusión, por confirmar por P4; adelantar si organización exige antes. Se
retira el cronograma de entrega a las 22:00/23:59.

## Corrección integrada P6 · v3.1 · 14-nov-2026 19:10

El documento `correcciones_raiz_v3_compacto.md` modifica el plan principal:

- A: papa/quinua/descanso; quinua/descanso/papa; descanso/papa/quinua.
- B: papa/quinua/haba; quinua/haba/papa; haba/papa/quinua.
- C: papa/haba/descanso; haba/descanso/papa; descanso/papa/haba.

Son tres secuencias por tres posiciones, nueve casos; no nueve secuencias nuevas.
Catálogo/rotations.json debe enumerar posición, caso y cultivo de decisión.
D1/D2/D3 acuerdan los valores de IDs; estos campos no prueban que el adaptador
inicial de fixtures ya soporte el nuevo paquete científico.

Campaña y = nov y–mar y+1. Ventana = y, y+1, y+2 completas; última decisión
y=2023 con datos hasta 2026-11-10. Se requieren datos hasta marzo de 2026 para
la campaña 2025; 2026 parcial no se inventa ni se presenta como campaña futura.
Mantener los periodos y exclusiones comparables; documentar por año de campaña.

Fase de decisión: ONI NDJ, YR=y, Niño >=0,5, Niña <=-0,5, Normal entre umbrales.
La clasificación operativa por campaña no reemplaza la definición de evento
con persistencia. y+1/y+2 conservan su clima histórico. Niño fuerte: ONI >=1,5.
El n=5 comunicado por P6 se recalcula para el punto y las ventanas válidas;
mostrar n de ventanas y campañas únicas, sin conclusión si n<3.
No mezclar KPI de campaña con KPI de ciclo en un ranking. La web muestra el
cultivo de decisión, sus KPI y n; debajo, el ciclo del caso seleccionado.

### Contexto y cifra histórica

Se permite citar pronóstico estacional NOAA/IRI como contexto externo fechado,
no como pronóstico agrícola de Raíz. IRI Quick Look 19-oct-2026 y NOAA CPC
12-nov-2026 consultados el 14-nov; ver enlaces en la página del plan.
No implica sequía asegurada en Oruro ni habilita pronósticos propios a 24 horas.
Niño 1+2 no es ONI; la anomalía >+5 °C corresponde al informe IRI de octubre,
no a una medición agrícola ni necesariamente a la última lectura disponible.

P6 informa cuaderno `prueba_descarte_oruro.ipynb`; aún no está en esta copia.
D1 reproduce con punto final P6-1. Punto preliminar reportado: ciudad de Oruro
(-17,97; -67,11), sin atribuirlo a finca validada. Método de la estadística:
POWER AG diario PRECTOTCORR/T2M_MIN 1981-01-01..2026-11-10, lluvia nov–mar,
excluir menos de 140 días válidos; ONI NDJ. Normal = media de campañas Normales.
El filtro >=140 días solo aplica a esa reproducción; el modelo sigue exigiendo
campañas completas. Normal 365 mm (n=13), cinco episodios y promedios del informe
son reportados, no reproducidos aquí. P4 usa «4 de 5» solo tras reproducción
final y lo llama frecuencia histórica con n=5, nunca probabilidad.

D1 + D3: nueve casos antes de Sáb 23:30. P6 → P4: afirmaciones/pitch Sáb 21:00.
P6 → D1: cuaderno/reproducción Sáb 21:00. No se declara implementado el cálculo
por haber actualizado el plan.
