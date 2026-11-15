# Entrega P6 / Dev 1 · 15-nov-2026

Se integró `P6_entregas_v3.zip` según `PROMPT_DEV1_IA.md`. Fuente de verdad: [`content/p6/`](../../content/p6/README.md). Los originales recibidos permanecen intactos y sus huellas constan en `recepcion.json`.

## Para devolver a P6

- **Interfaz:** React 19.3.1 y React DOM, licencia MIT. **Herramienta de desarrollo y compilación:** Vite 8.3.8, MIT. El backend existente usa FastAPI, MIT. Estas licencias corresponden a las dependencias; no asignan una licencia nueva al contenido del productor.
- **Captura de créditos:** [escritorio](validaciones/P6-dev1-v3/creditos-escritorio.png), [móvil](validaciones/P6-dev1-v3/creditos-movil.png).
- **Comparador:** [escritorio](validaciones/P6-dev1-v3/raiz-escritorio.png), [móvil con los KPI desplazados](validaciones/P6-dev1-v3/raiz-movil-kpi.png).
- **Paquete de revisión:** [P6_DEV1_v3_resultados.zip](validaciones/P6_DEV1_v3_resultados.zip). Contiene informe, capturas, fuentes P6 públicas, resultados y el ZIP D1-2 original. Es evidencia para revisión, no una distribución completa del frontend.

Con el entorno instalado, ejecutar `make dev` desde `simulacion/` y abrir:

- Comparador: `http://localhost:5173/` (Raíz 2D). La dirección `/raiz.html` del prototipo retirado redirige ahí.
- Créditos y límites: `http://localhost:5173/?vista=creditos` (antes `/creditos.html`, que redirige).

La entrada principal `/` de Raíz 2D y el archivo `/terralab.html` de TerraLab 3D se conservaron. Esta entrega documenta el comparador P6 y sus créditos; su revisión visual no certifica las otras entradas. Se entrega captura en lugar de un enlace público de despliegue. No se hizo push ni despliegue.

## Datos y nueve casos

Punto público: **−17,83; −67,00**, Obrajes, Soracachi, Oruro. La elevación de referencia recibida es **3809 m EGM96, NASADEM**, con fuente y DOI conservados. No se presenta como altitud de la celda meteorológica ni como nueva medición del suelo.

Las secuencias A/B/C y sus tres posiciones cíclicas producen **9 casos**. La campaña de decisión es la primera; su ONI NDJ determina la fase de la ventana. El ciclo usa esa campaña y las dos sucesoras reales, con meteorología distinta cada año. Los controles muestran los KPI de decisión o del ciclo, fase, período y año análogo/promedio, sin consultas en vivo a NASA, NOAA o TTS.

El análisis histórico de lluvia conserva **45 campañas completas, 1981–82 a 2025–26**, de noviembre a marzo y al menos 140 días válidos. La campaña parcial 2026–27 queda fuera. La referencia Normal es **364,803846 mm**, promedio de 13 campañas Normales. Cuatro de los cinco Niños fuertes quedan por debajo: 1982–83, 1997–98, 2015–16 y 2023–24; 2009–10 queda por encima. Es frecuencia histórica, n = 5.

Para los nueve casos de agua se exige ET0 y lluvia completas en las tres campañas. Quedan **40 ventanas**, con año inicial 1984–2023: 14 Niño, 15 Niña y 11 Normal; **360 registros** y 81 agregados. La radiación empieza en 1984, por eso no se asigna ET0 a las campañas anteriores. Los períodos separados requieren las tres campañas dentro de 1981–2000 o 2001–2025; las ventanas que cruzan ese límite aparecen solo en el total. Las ventanas se pueden solapar y no son muestras independientes.

Build: `raiz-p6-v3-59c8f1646809`, modelo `fao56-demand-screening-1`. Los cinco JSON de datos que consume la interfaz comparten ese identificador; se rechaza una mezcla de versiones. El manifiesto registra archivos y huellas. [Verificaciones](validaciones/P6-dev1-v3/verificaciones.json).

## Cálculo, supuestos y pendientes

ET0 diaria usa Penman–Monteith FAO-56, radiación en MJ/m²/día, viento a 2 m, aproximación con humedad relativa media y presión derivada de la elevación. Se comprobó contra el ejemplo 18 de FAO-56 (3,88 mm/día, tolerancia 0,03). La demanda diaria es ET0 × Kc.

La lluvia efectiva se aproxima como `min(lluvia diaria, demanda diaria)`; el riego neto de papa/haba y el déficit de quinua se obtienen sumando la diferencia no negativa. **Es una estimación simplificada de demanda, sin almacenamiento continuo del suelo, reserva inicial, escorrentía, eficiencia de aplicación ni presupuesto de riego.** Los milímetros resultantes no son una pauta de riego ni evidencia de calibración en campo. La comparación histórica «4 de 5» fue reproducida por P6/Dev 1; los nueve escenarios nuevos quedan pendientes de revisión agronómica de P6.

Los supuestos están etiquetados en los datos y explicados junto a los resultados:

- Calendario concreto 1-oct a 15-abr, inclusivo; 197/198 días. Las fechas exactas del productor no están confirmadas.
- Proporciones FAO-56 Tabla 11 escaladas: papa 25/30/45/30 y haba seca de otoño 90/45/40/60. Tabla 11 no tiene una fila de quinua: se usa un **proxy de cereales pequeños 20/30/60/40**, declarado como supuesto.
- Agua disponible NRCS 0,14–0,16 m/m por textura: **no medida**. Zr se conserva como referencia del cultivo; no se inventa una profundidad efectiva ni se usa para simular una reserva de suelo inexistente en este modelo.
- No hay fechas de floración: exposición a helada **null / sin dato**, conservando los umbrales recibidos. No se confunde toda la etapa Kc media con floración.
- No hay factor numérico de cobertura: **null / sin dato**. Descanso conserva cobertura parcial de maleza pastoreada.
- No hay umbrales numéricos acordados de viento/lluvia fuerte: **null / sin dato**, con fuentes `assumption_*_pending`. Se muestra la limitación de reanálisis para lluvias mayores a 50 mm/día.

El granizo no se calcula. No se publican rendimiento, nitrógeno ni dinero. No hay contraste con estación; CHIRPS conserva el estado `unavailable`. No se ejecutaron los cuadernos ni el script CHIRPS incluido por P6.

## Audio, créditos y privacidad

El MP3 quechua y su transcripción son idénticos a los recibidos. Se identifica como voz humana de un productor anónimo, con autorización; el comprobante se conserva fuera del repositorio. Se presenta como **preparado para radio**, sin afirmar emisión. El usuario indicó omitir el MP3 español ausente: se ofrece su texto, sin botón de reproducción ni audio generado.

La página propia de créditos conserva las secciones 1, 3, 4 y 5 de P6, con correcciones de publicación para distinguir radiación desde 1984, alcance de la reproducción «4 de 5» y audio humano quechua frente a MMS español no entregado. Declara Claude (Anthropic), ChatGPT y Codex (OpenAI), Gemini (Google), y sus usos. La referencia MMS mantiene CC-BY-NC-4.0 y uso no comercial; esa licencia no se atribuye al audio humano.

El ZIP D1-2 se conserva byte por byte, SHA-256:

```text
2b75d03c73d9467b148280d0709e54e640a5a69a2f455615ecd25cb4fe135d57
```

Se revisaron los archivos publicables del proyecto, los datos POWER de Obrajes, la compilación, los 27 miembros del ZIP científico y las 7 revisiones Git disponibles: cero coincidencias de la ubicación precisa. Se excluyen dependencias, cachés y respaldos privados; el comando genérico de P6 sobre todo el disco puede coincidir con tablas Unicode de dependencias por usar puntos como comodines. La verificación registrada usa coincidencias literales de los prefijos solicitados. Cero textos prohibidos en `frontend/src` y en las dos páginas comprobadas.

La reconsulta POWER redondeada preserva las seis variables meteorológicas y cambia la radiación respecto a la consulta anterior. El cálculo usa únicamente la serie redondeada; no mezcla la radiación anterior. Esto está registrado en `rounding_comparison.json`.

## Reproducción y pruebas

Desde `simulacion/`, con los datos POWER locales ya presentes:

```bash
backend/.venv/bin/python scripts/check_p6.py ../content/p6
make raiz-data
cd frontend
npm run dev
```

`make raiz-data` no consulta internet. Los insumos POWER locales no se versionan; están conservados en la carpeta de datos y en el ZIP D1-2 de la entrega. El ZIP de revisión incluye las salidas calculadas; para regenerar se usa el repositorio con esos insumos.

Comprobaciones completadas:

- P6-1 a P6-4: **ACEPTADO** por el comprobador entregado.
- Backend: **130 pruebas**; Ruff y mypy pasan para el motor y la solicitud de rotaciones.
- Frontend: **190 pruebas**; TypeScript y compilación de producción pasan. ESLint y Prettier pasan en la extensión P6.
- Navegador: **3 pruebas P6** pasan (nueve casos, selección y dos niveles, audio real, créditos, móvil, tabla desplazable y teclado). En la corrida conjunta también pasaron 7 pruebas de Raíz 2D y la conexión real de TerraLab. Se corrigió una espera de montaje en la prueba de teclado P6 y se repitieron sus tres pruebas, todas correctas.
- Regeneración determinista: archivos publicados idénticos antes/después de reconstruir; insumos, copias agronómicas, audio y manifiesto con hashes correctos.
- Capturas Chromium a 1440 × 1000 y 390 × 844: sin desbordamiento exterior ni errores de página registrados. Detector de la extensión UI: `[]`. Revisión visual final: **ship**, limitada al comparador y créditos; [alcance](RAIZ_UI.md).

No se modificó el centro de coordinación `raiz-hackaton/` ni se enviaron mensajes externos. Los cambios permanecen locales para revisión.
