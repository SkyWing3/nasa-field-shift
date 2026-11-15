# Auditoría independiente Dev 2

Fecha: 14-nov-2026. Revisor: agente de auditoría independiente de los autores de
contratos, comunicación/audio y publicación. No representa revisión humana P5/P6.

## Alcance

Se inspeccionaron el alcance v3.1, `raiz_delivery/{contracts,analysis,
communications,print_sheet,audio,package,serve}.py`, CLI y pruebas. Se ejecutó
compilación, pruebas de integración y ataques de regresión con archivos
**sintéticos**. No se descargó ni se validó científicamente NASA/NOAA. No se
escuchó ni se aprobó una voz por esta auditoría.

## Hallazgos reproducidos y corregidos

| Severidad | Hallazgo | Evidencia y corrección |
| --- | --- | --- |
| Alta | Una misma terna de campañas podía repetirse con distintos `window_id`, inflando n=1 a n=3 y evitando la advertencia de muestra insuficiente | Reproducción con entradas sintéticas: tres `[2001,2002,2003]` y n=3 eran aceptadas. `contracts._real` ahora exige ternas únicas además de IDs únicos. Regresión `test_duplicate_campaigns_cannot_inflate_sample` |
| Alta | Doble decodificación HTTP podía convertir una ruta original con `%2e%2e` literal en una ruta fuera de la release | Un paquete estructural sintético permitía GET con `%252e%252e` y devolvía un marcador `site/private.txt`, HTTP 200. `serve.translate_path` ya no decodifica otra vez; `package.safe_path` y `contracts.safe_relative` rechazan `%`, `?`, `#` y controles. Regresiones de auditoría verifican HTTP 404 y rechazo de la entrada |

Evidencia del ataque original de doble decodificación:
`build/audit/ad703fce8386499fb86026a2393c1cd0/evidence.json`. El contenido
expuesto en la prueba era el marcador inventado `AUDIT_PRIVATE_OUTSIDE_RELEASE`,
sin información de usuarios. Esa carpeta es evidencia interna, no un paquete
de producción ni un resultado agrícola.

## Verificaciones positivas

- La compilación de módulos, scripts y pruebas terminó sin errores.
- La suite inicial de auditoría tenía 43 pruebas aprobadas antes de agregar
  las nuevas regresiones; el reporte global final del proyecto prevalece sobre
  ese conteo intermedio.
- Se rechazan builds mezclados, referencias de caso incoherentes, ausencia de
  originales o alteración de sus hashes, fechas sin zona, KPI con unidades o
  naturaleza incompatibles y n insuficiente con ranking.
- Los textos científicos no se generan desde datos inventados; los fixtures
  llevan advertencia y conservan KPI `null` con motivo. La salida real se
  identifica como simulación histórica, no observación de parcela.
- HTML escapa contenido externo; el audio es voluntario y no usa autoplay.
  El texto no pasa a considerarse pronóstico por tener fechas editoriales.
- MP3 importado exige coincidencia de build, resultado, caso, hash del texto,
  integridad del archivo y duración leída desde sus frames. Boletines mayores
  de 60 s se rechazan. La lectura estructural de frames no sustituye escucha.
- El servidor agrícola no expone tablero, base SQLite, carpetas ni archivos no
  declarados. POST no está implementado. No hay consultas a proveedores en el
  recorrido web.
- Publicación fallida no cambia el puntero activo. Una regresión independiente
  publica dos versiones y vuelve a la primera, conservando ambas releases.

Regresiones propias: `tests/test_audit_regressions.py` (rutas, doble
decodificación y retorno efectivo a una release previa).

## Límites de la aceptación

No se certifica que las fuentes declaradas sean auténticas ni que D1 haya
conservado agua o aplicado ONI correctamente: los hashes y referencias son
integridad y estructura. La revisión agronómica requiere archivos y responsables
reales. El punto de finca y los parámetros no se inventan para pasar pruebas.

La producción exige datos no fixture, vigencia editorial, revisión atribuida,
licencia confirmada y MP3 aprobados. Esos campos representan registros aportados
por el equipo; el software no sustituye la revisión humana ni verifica firmas.

El motor SAPI español está bloqueado en este entorno; la generación real y
licencia/escucha siguen el estado del informe `docs/dev2/AUDIO.md`. No se acepta
un archivo silencioso o frames sintéticos de pruebas como entrega de voz.
HTTPS público, impresión visual, móvil y disponibilidad de túnel solo se
consideran probados si el reporte final incluye evidencia real de esos pasos.

Observación de mejora: al aceptar un ranking externo conviene exigir dirección
de preferencia y pesos asociados a KPI efectivamente disponibles del horizonte
de ranking. La demo actual no calcula rankings científicos.
