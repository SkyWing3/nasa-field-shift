# P6-6 · Fuentes, licencias y declaración de IA (borrador 14-nov, 22:10)

Esto va en la página del proyecto (Space Apps) y en la sección "Créditos" de la app. Estado: COMPLETO (14-nov, 23:15).

## 1. Datos usados (lo que alimenta el cálculo)
| Dato | Fuente | Uso en Raíz | Licencia / condición | Cita |
| --- | --- | --- | --- | --- |
| Lluvia, Tmin, Tmax, viento, humedad, radiación diarias desde 1981 | **NASA POWER** (Daily API, comunidad AG; reanálisis MERRA-2) | Lluvia y helada por campaña; KPIs | Acceso libre; pide citar NASA POWER | NASA Langley Research Center POWER Project, consultado el 14-nov-2026: https://power.larc.nasa.gov |
| Elevación del punto | **NASADEM** (NASA) | Contexto del punto (3809 m) | Dominio público (NASA) | https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001 |
| Fases Niño, Niña y Normal | **NOAA CPC ONI** (`oni.ascii.txt`) | Clasificar campañas | Dominio público (gobierno de EE. UU.) | https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt |
| Coeficientes de cultivo, etapas, raíces | **FAO-56** (Allen et al. 1998), Tablas 11, 12 y 22 | Demanda de agua por cultivo | Publicación FAO; se cita | Allen, R.G. et al. (1998) *Crop evapotranspiration*, FAO Irrigation and Drainage Paper 56 |
| Agua disponible por textura | **USDA NRCS** | Suelo "franco arcillo arenoso" (no medido) | Dominio público | NRCS, Soil Survey Manual / tablas de AWC |
| Calendario, riego y pérdidas | **Productor de Obrajes** (comunicación personal, 14-nov-2026) | Calendario, escenarios, límites | Autorización escrita por WhatsApp (14-nov-2026, 22:41) para usar su audio, sus frases y su testimonio sin nombre | `permiso_productor.png` |

**Fuente intentada y no usada:** CHIRPS v2 (UCSB/USGS), por una serie incompleta en el espejo NOAA ERDDAP; queda `unavailable` (ver P6-4).

## 2. Literatura citada en afirmaciones
- **Chen, P.M. y Li, P.H. (1980).** *Plant Physiology*: tolerancia a la helada de la papa (−2,5 °C).
- **Garcia, M. et al. (2003).** Kc de la quinua, en *Agricultural Water Management*.
- **Jacobsen, S.-E. et al.:** resistencia de la quinua a la helada según la etapa.
- **CIREN:** ficha de haba (helada en floración).
- **Remote Sensing (2024):** CHIRPS e IMERG en Bolivia.
- **Maina y Kumar (2025),** *J. Hydrometeorology*; **Birkel et al. (2022),** *Earth and Space Science*; **Blacutt et al. (2015),** *Atmospheric Research*: desempeño de MERRA-2 en los Andes y Bolivia.
- **NOAA CPC, ENSO Diagnostic Discussion (12-nov-2026):** solo como contexto y solo si la líder lo aprueba.

La lista completa con enlaces está en `registro_fuentes_afirmaciones.md` y `crops.json` (`sources`).

## 3. Software y modelos
| Herramienta | Uso | Licencia |
| --- | --- | --- |
| Meta **MMS-TTS** (`facebook/mms-tts-spa`, `facebook/mms-tts-quz`) | Voz sintética del boletín | **CC-BY-NC-4.0** (confirmado en Hugging Face, 14-nov): uso no comercial con atribución. https://creativecommons.org/licenses/by-nc/4.0/legalcode.txt |
| Python, pandas, requests, transformers, Google Colab | Descarga, cálculo y audio | Software libre (BSD, Apache 2.0) |
| FastAPI (backend) | API y cálculo | MIT |
| React (frontend) | Página web (prototipo; luego será la app) | MIT |

## 4. Declaración de uso de IA (texto para pegar)
> Usamos asistentes de IA generativa (Claude de Anthropic, ChatGPT y Codex de OpenAI, y Gemini de Google) para: buscar y resumir literatura, redactar borradores de textos y del boletín, y escribir y depurar código en Python. Todas las cifras del proyecto salen de datos descargados de NASA POWER y NOAA y de cálculos reproducidos por dos integrantes del equipo; ninguna cifra fue generada por IA. Las frases en quechua fueron leídas y grabadas por un hablante de la comunidad, sin correcciones. La voz en español del boletín es sintética (Meta MMS-TTS). Las frases en quechua las grabó con su voz un productor de la comunidad, con su autorización escrita..

## 5. Límites declarados (van en la app y en el speech)
- **Datos regionales:** los datos de POWER son de una celda de unos 50 km, no una medición de la parcela.
- **Muestra pequeña:** el "4 de 5" es una frecuencia histórica con n = 5, no un pronóstico.
- **Granizo:** no se mide con estos datos.
- **Suelo:** no se midió; su retención de agua es genérica por textura.
- **Validación:** sin contraste con estación ni con una segunda fuente satelital (P6-4 `unavailable`).
- **Uso:** no reemplaza al técnico agrícola; no promete rendimiento ni dinero.

## Checklist antes de las 10:00
- ✅ Captura del permiso del productor (`permiso_productor.png`).
- ✅ Licencia de MMS confirmada (CC-BY-NC-4.0).
- ✅ Quechua: leído y grabado por el productor.
- ✅ Voz: español sintético; quechua del productor.
- ✅ IA: Claude, ChatGPT, Codex y Gemini. ✅ Framework: FastAPI (backend) + React (frontend), ambos MIT.
