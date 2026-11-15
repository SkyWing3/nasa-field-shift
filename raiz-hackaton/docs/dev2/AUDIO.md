# Audio español y boletín regional · Dev 2

El módulo `raiz_delivery.audio` publica únicamente archivos MP3 existentes y
coincidentes. No llama a SAPI, NASA, NOAA ni a servicios TTS desde la web o
durante la construcción normal del paquete.

## Voz Meta MMS: vía vigente desde el 14-nov-2026

La voz de Windows (SAPI) quedó bloqueada en este equipo (ver más abajo). El audio
se genera ahora con **Meta MMS-TTS** (modelos abiertos de Hugging Face) ejecutado
localmente en lote. La web solo sirve los MP3 ya guardados.

| Idioma | Modelo de voz | Texto | Estado |
| --- | --- | --- | --- |
| Español | `facebook/mms-tts-spa` | Texto equivalente del mensaje (números y siglas dichos en palabras) | Revisión de escucha P5 pendiente |
| Quechua | `facebook/mms-tts-quh` (sudboliviano) | Traducción automática NLLB-200 a `quy_Latn` (Ayacucho) o traducción humana | **Experimental**: falta revisión por hablante |
| Aymara | `facebook/mms-tts-ayr` (central) | Traducción automática NLLB-200 a `ayr_Latn` o traducción humana | **Experimental**: falta revisión por hablante |

Comprobado el 14-nov-2026 en la API de Hugging Face:

- `mms-tts-quz` es quechua de **Cusco (Perú)**. Para Oruro se usa `mms-tts-quh`
  (quechua sudboliviano). También existen `qul` (norte de Bolivia) y `quy` (Ayacucho).
- Ningún proveedor de inferencia gratuita de Hugging Face sirve estos modelos:
  hay que ejecutarlos localmente. No se necesita cuenta ni token, porque son públicos y sin acceso restringido.
- Licencia de MMS y NLLB: **CC BY-NC 4.0**. Uso no comercial y con atribución.
  La ficha y el índice muestran el crédito de la voz. Si el proyecto pasa a uso
  comercial, hay que cambiar de voz. P6 debe incluir ambos modelos en la declaración de IA.
- NLLB-200 no incluye quechua sudboliviano. Su texto sale en quechua sureño de
  Ayacucho, que es inteligible pero distinto, y la voz `quh` lo lee. Un hablante de Oruro debe adaptarlo.

### Instalar el entorno de voz (una vez, ~1 GB más ~2,7 GB de modelos)

```powershell
python -m venv .venv-tts
.venv-tts\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv-tts\Scripts\python -m pip install "transformers>=4.40" sentencepiece lameenc num2words numpy
```

Los modelos se descargan en la primera ejecución a `~/.cache/huggingface`.
`raiz_delivery` sigue usando solo la biblioteca estándar: el entorno de voz únicamente
hace falta para generar los MP3, no para construir, validar ni servir el paquete.

### Generar y empaquetar

```powershell
# 1. MP3 (español + experimentales). La salida es por build_id.
.venv-tts\Scripts\python scripts\generate_audio_mms.py --input fixtures\dev2-v31 --output assets\audio\fixture-dev2-v31-demo --languages es,quh,ayr
# 2. Comprobación completa con esos audios (pruebas, build, check, publicación local)
python scripts\check_dev2.py --audio-assets assets\audio\fixture-dev2-v31-demo
```

Con datos reales de D1 se usa `--input <carpeta real>` y, si existe, `--editorial`
con el mismo JSON del build: el texto del boletín cambia con la vigencia editorial y el
importador rechaza un audio cuyo texto no coincida (hash).

Para usar una traducción humana en lugar de NLLB:

```json
{"quh": {"translator": "Nombre de la persona", "texts": {"message-fixture-a-1": "…", "regional-bulletin": "…"}}}
```

`--translations traducciones.json`. Se registra `method: human` y el traductor.
Cada corrida automática deja `source/traducciones-borrador.json` con este formato ya
lleno (borrador NLLB y referencia `_es_hablado`). Se entrega al hablante, que lo corrige
y escribe su nombre en `translator`. Si `translator` queda vacío, el generador lo rechaza.

La traducción automática prohíbe trigramas repetidos y rechaza las salidas anormalmente
largas o en bucle (en la primera prueba NLLB repitió «mana allinchu» 29 veces). Además
conserva sin traducir las frases de una sola palabra, como «Oruro.», que NLLB había
traducido al aymara como «Jisk'a manq'aña».

Qué hace el generador:

- **Texto hablado:** convierte números, fechas, horas, rangos de años, `mm` y `%` a
  palabras (MMS omite los dígitos) y lee las siglas (KPI → «indicadores», NOAA →
  «ene o a a», fixture → «datos de ejemplo»). El catálogo guarda el hash del texto
  publicado (`text_sha256`) y del hablado (`spoken_text_sha256`). El texto hablado
  queda en `source/*.txt`.
- **Reproducible:** VITS es estocástico. Usa la semilla fija `--seed 1234` en cada frase,
  así que el mismo texto produce el mismo audio. La semilla y el commit del modelo quedan en `voice`.
- **Boletín ≤ 60 s:** si se pasa, acelera poco a poco hasta 1,25×, registra
  `speaking_rate` y, si aun así no entra, falla y pide acortar el guion.
- **Sin silencios:** rechaza audio vacío por RMS. `dropped_characters` lista las letras
  que la voz no conoce y omitió.
- **MP3:** LAME (`lameenc`), 48 kbps, mono, 16 kHz. No requiere ffmpeg.

### Contrato de los otros idiomas

En el catálogo de audio, los elementos `message_translation` y
`bulletin_translation` añaden `language` (ISO 639-3), `language_name`, `text`,
`text_sha256`, `source_text_sha256` (hash del texto español vigente),
`translation` (`method` machine/human con modelo o traductor) y `speaker_review`.
En `communications.json` aparecen como `translations` dentro de cada mensaje o
del boletín, **junto al** español, sin reemplazarlo. El importador rechaza:

- una traducción de otro texto, caso o build;
- la voz de otro idioma;
- la procedencia ausente;
- los idiomas o rutas repetidas;
- un boletín de más de 60 s.

La producción (`--production`) solo admite otros idiomas con licencia confirmada,
`speaker_review` aprobado con nombre y fecha, y revisión editorial aprobada. Es la
regla del plan: otros idiomas solo con hablante y contenido agronómico revisado.

## Preparar voz en lote con Windows SAPI (bloqueada en este equipo)

El script `scripts/generate_audio.py` acepta `communications.json` de fixture:

```powershell
python scripts/generate_audio.py --communications build/package-v31/data/communications.json --output assets/audio-demo
```

En Windows utiliza la voz española instalada Microsoft Helena Desktop mediante
SAPI, guarda WAV PCM y convierte a MP3 con Windows Media Foundation. No requiere
paquetes de Python ni red. Guarda el texto exacto que se sintetizó, hash, duración
real de frames MP3 y RMS PCM para rechazar audio vacío/silencio. Un fallo del motor
termina el comando con error: no crea un catálogo exitoso ni sustituye voz por tonos.

Los MP3 fixture son demostración y requieren escucha. No se declara que P5 o P6
ya revisaron el contenido. `license.status=pending_confirmation` señala que debe
comprobarse la licencia de redistribución de la voz Windows; la documentación de
SAPI demuestra el mecanismo técnico, no concede derechos de distribución.

Fuentes técnicas oficiales consultadas 14-nov-2026:

- SAPI SpVoice y salida a archivo:
  https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee125640(v=vs.85)
- Perfil de codificación MP3 de Windows:
  https://learn.microsoft.com/en-us/uwp/api/windows.media.mediaproperties.mediaencodingprofile.createmp3
- Términos del producto instalado: https://www.microsoft.com/useterms

## Importar grabaciones o TTS revisados

Se puede generar/grabar fuera de este equipo y entregar una carpeta con
`catalog.json` y `audio/*.mp3`. Ejemplo de metadatos por elemento:

```json
{
  "kind": "message",
  "communication_id": "message-RESULT_ID",
  "result_id": "RESULT_ID",
  "case_id": "A-1",
  "build_id": "BUILD_ID",
  "path": "audio/mensaje.mp3",
  "text_sha256": "SHA256_DEL_TEXTO_UTF8_EXACTO",
  "sha256": "SHA256_DEL_ARCHIVO",
  "bytes": 1000,
  "duration_seconds": 12.5,
  "voice": {"provider": "Grabación propia", "name": "Voz autorizada", "language": "es"},
  "license": {"status": "licensed", "url": "https://URL_DE_AUTORIZACION", "notes": "Referencia de permiso real"},
  "review": {"status": "approved", "reviewer": "REVISOR_REAL", "reviewed_at": "2026-11-14T20:00:00-04:00"}
}
```

El sobre del catálogo es `schema_version: "1.0"`, `build_id`, `mode`, `items`.
Cada elemento de boletín usa `kind=regional_bulletin`, su `communication_id`
(nulo si el contrato del mensaje no lo tiene), `result_id=null`, `case_id=null`.
La duración se vuelve a calcular; no basta cambiar el número del catálogo.

`attach_audio(communications, assets_dir, output_dir, production=False)` copia
los archivos y agrega solo metadatos de audio. Rechaza versiones mezcladas,
texto no coincidente, IDs incorrectos, rutas inseguras, archivos ausentes,
hashes/tamaños/duraciones falsos y boletín superior a 60 s. No modifica el guion.
`validate_attached_audio` vuelve a comprobar los recursos publicados.

La validación de producción exige modo no fixture, licencia confirmada, revisión
de escucha aprobada y revisión editorial aprobada con vigencia válida. Un `at`
explícito comprueba que el instante esté dentro de la vigencia; no se usa el reloj
implícitamente para invalidar el respaldo histórico de una release.

## Límites de la comprobación

La lectura de frames MPEG Layer III verifica estructura/duración, no el contenido
hablado ni la correcta pronunciación. La coincidencia por hash del texto verifica
la declaración del productor; la escucha humana P5 comprueba equivalencia real.
Radio queda `prepared_not_broadcast`; un MP3 no transmite ondas.

## Evidencia del entorno de esta sesión

Las voces Microsoft Helena Desktop, Zira y Haruka se enumeraron. La síntesis
SAPI de Helena devolvió `SPERR_INVALID_REGISTRY_KEY` (`0x80045040`); System.Speech
informó que ninguna voz estaba disponible con la configuración de seguridad
actual y WinRT reportó un error interno de voz. No se ha modificado el registro
ni solicitado privilegios. El generador queda preparado para un entorno Windows
con acceso al motor, y la importación permite usar MP3 revisados ya producidos.
No se presentan los WAV vacíos de esa prueba como voz ni se publica un MP3 falso.
