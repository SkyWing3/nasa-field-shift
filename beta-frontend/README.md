# Raíz · beta-frontend (Dev 3: web, comparación y accesibilidad)

Recorrido web de 4 pasos que **lee** el paquete precalculado de Dev 2 (`raiz-hackaton/`).
No calcula ciencia, no llama a NASA, NOAA ni TTS, no tiene PWA, modo offline ni formularios.

| Paso | Tarea | Qué muestra |
| --- | --- | --- |
| Escenario (arriba en pasos 2–4) | D3-1 | Normal / Niño / Niña / Niño fuerte (ONI ≥ 1,5) de la campaña de decisión, periodo, agua para riego, n y años evaluados |
| 1 · Clima | D3-2 | 1981–2000 frente a 2001–2025: gráfica y tabla en texto, unidad, resolución y n. Campañas por fase ENSO |
| 2 · Rotaciones | D3-3 | 9 casos (3 secuencias × 3 posiciones). KPI de la **campaña de decisión arriba** y del **ciclo y..y+2 abajo**, con órdenes separados |
| 3 · Suelo y calidad | D3-4 | Calendario de cobertura, semáforo de suelo descubierto (conteos y umbral) y sensibilidad («no evaluado») |
| 4 · Ficha y audio | D3-5 | Ficha imprimible, MP3 y texto del mismo `result_id`; boletín regional aparte, «preparado, no emitido» |
| Todo | D3-6 | Teclado, foco visible, texto A/A+/A++, botones de 48 px o más, tablas como alternativa a las gráficas, audio solo al pulsar |

## Ejecutar

Requisitos: Node 18 o superior y Python 3.10 o superior (para el publicador de Dev 2).

```sh
cd beta-frontend
npm ci
npm run dev          # prepara el paquete de Dev 2 y abre http://localhost:5173
```

- `npm run paquete`: regenera `public/paquete/` con el publicador oficial de Dev 2. Usa `raiz-hackaton/datos/` cuando contiene catalog, climate y results; si esa entrada no existe, usa `fixtures/dev2-v31`. Los MP3 se buscan en `raiz-hackaton/assets/audio/<build_id>`.
- Con datos reales de Dev 1: `node scripts/preparar-paquete.mjs --entrada ../ruta/entrada-dev1 --audio ../raiz-hackaton/assets/audio/<carpeta>`.
- `npm run ejemplo`: regenera el **ejemplo sintético** (`public/ejemplo-ui/`).
- `npm test`: pruebas del ranking (empates, faltantes, n<3, sin ventanas).
- `npm run test:integration`: comprueba el paquete publicado, sus escenarios de nueve casos, los dos perfiles de suelo, mensajes, rutas de audio, hash del manifiesto y rechazo de builds mezclados. Ejecutar después de `npm run paquete`; requiere Node 18 o superior y no usa dependencias externas.
- `npm run build` y luego `npm run preview`: versión de publicación en `dist/` (puerto 4173).

Para compartir por HTTPS, usar el mismo método del repo (`cloudflared tunnel --url http://127.0.0.1:4173`).

## Fuentes de datos (selector «Datos» en la cabecera)

1. **Paquete publicado por Dev 2** (por defecto). La naturaleza se lee del paquete: simulación histórica con datos NASA, datos descargados o fixture sin cifras. Los audios en borrador conservan su aviso de revisión pendiente.
2. **Ejemplo de interfaz (cifras inventadas)**: sirve para ver gráficas, ranking, empates y n<3. La web lo marca como
   **«DATOS DE EJEMPLO, NO NASA»**. Nunca usarlo en el pitch como resultado.

También se puede abrir con `?fuente=ejemplo` o `?fuente=paquete`.

El navegador lee archivos estáticos del mismo servidor de Vite; no necesita levantar una API ni configurar CORS entre servidores. `server.py` de `raiz-hackaton` sigue siendo el tablero de coordinación. Cada preparación copia una versión: al cambiar los datos o audios, repetir `npm run paquete` y recargar.

En Windows, el preparador busca `python` antes que `python3`. Puede fijarse un ejecutable con `$env:PYTHON='C:\Python313\python.exe'` en PowerShell. `npm run build` falla si el publicador rechaza los datos; el modo desarrollo permite seguir con el paquete previo y deja el motivo en la terminal.

Si `climate.json` solo trae series diarias, la vista de clima informa que faltan resúmenes por periodo y la clasificación por campaña. Si faltan `coverage_calendar` o umbrales del semáforo, se muestra la descripción por cultivo o los conteos sin inventar calendario ni niveles.

## Campos TEMPORALES de Dev 3, por acordar con Dev 1 y Dev 2 (marcados `TEMP-D3`)

La web funciona sin ellos y muestra «no disponible» con su motivo.

| Campo | Archivo | Para | Forma propuesta |
| --- | --- | --- | --- |
| `data.period_summaries[]` | climate.json | D3-2 | `variable, label, unit, period_id, statistic, value, sd, min, max, n_campaigns, n_missing, nature, source_id, spatial_resolution, temporal_resolution, missing_reason` |
| `data.campaigns[]` | climate.json | D3-1/D3-2 | `campaign_year, label, period_id, oni_ndj, enso_phase, strong_nino, complete, source_id` |
| `data.enso_rule` | catalog.json | D3-1 | `index, season, nino_min, nina_max, strong_nino_min, source` |
| `data.rules.bare_soil` | catalog.json | D3-4 | `rain_threshold_mm, wind_threshold_m_s, green_max_days, yellow_max_days, nature, source` |
| `records[].coverage_calendar[]` | results.json | D3-4 | `{month: 1..12, cover: bare / crop / residue / fallow_vegetation}` (año agrícola ago→jul) |
| `periods[].label`, `water_budgets[].label`, `soil_profiles[].label` | catalog.json | D3-1 | texto corto para el productor |

## Reglas de orden (D3-3)

Pesos de dos prioridades (agua, suelo) repartidos en partes iguales entre sus indicadores.
Agua: riego que haría falta y días con falta de agua (menos es mejor). Suelo: suelo cubierto (más es mejor)
y días de suelo desnudo con lluvia o con viento (menos es mejor).
Normalización min–max entre los casos del mismo escenario. Un caso al que le falte una métrica ponderada queda sin puntaje.
Los empates comparten posición. Con n<3 o sin ventanas no se ordena. Campaña y ciclo se ordenan por separado.

## Diseño

Paleta, tipografías, formas y reglas: ver `DESIGN.md` (tomadas del pitch en Canva).

## Añadidos del 15-nov (madrugada)

- **Portada** (`src/vistas/Portada.jsx`): una frase, las tres rotaciones del catálogo y un solo botón.
- **Riesgo Bajo / Medio / Alto por caso** (`nivelesRelativos` en `src/lib/ranking.js`): falta de agua, frío o calor y suelo desnudo.
  Es RELATIVO a los otros casos del mismo escenario (tercios del rango), con años pasados. No es un umbral agronómico ni un pronóstico.
  Sin nivel si falta el dato, si n<3 o si todos los casos son iguales. Por acordar con P6 si prefiere umbrales fijos.
- **Línea de tiempo del año agrícola** dentro de «Más indicadores» (usa `coverage_calendar`, campo TEMP-D3).
- **Una sola animación**: las filas del registro entran en orden al cargar; se desactiva con «reducir movimiento».
- Fuera a propósito (contrato v3): registro/login, formulario de parcela y pronósticos en semanas.

