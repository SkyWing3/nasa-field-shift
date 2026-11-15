# Raíz 2D

Interfaz principal desde el 15-nov-2026 (ADR-043). Entrada `/` → `frontend/src/raiz2d/main.tsx`. Lee solo `public/raiz/data/*.json` y `public/raiz/audio/`, generados por `scripts/build_raiz.py`. No consulta NASA, NOAA ni TTS.

## Recorrido (P4-3, D3-1 a D3-5)

| Paso | Qué muestra | Criterio del plan |
| --- | --- | --- |
| 1. Clima y contexto | Lluvia nov–mar de 45 campañas (SVG + tabla), promedio Normal, periodos 1981–2000 y 2001–2025 con n y rango, «4 de 5» con sus cinco campañas | D3-2 |
| 2. Rotaciones | Cultivo de la campaña de decisión, fase ENSO (incl. Niño fuerte), periodo, presupuesto de agua (4 corridas precalculadas), año de referencia, KPI de esa campaña, faja de tres campañas, prioridades (pozo, estrés, días sin cultivo, helada), frecuencia sin estrés y rango por supuestos de suelo, tabla de nueve casos | D3-1, D3-3 |
| 3. Suelo y confianza | Calendario de cobertura (36 meses) con % cultivo/descanso y días sin cultivo con lluvia o viento fuerte; semáforo de evidencia con conteos (incluye «evaluado con supuestos» y el cierre del balance); punto, suelo, exclusiones y límites | D3-4 |
| 4. Ficha y radio | Ficha imprimible y descargable en texto con identificador de resultado; boletín quechua (MP3) y español (texto) | D3-5 |

Créditos y licencias: `/?vista=creditos`.

## Archivos

- `analysis.ts`: lógica pura (campañas, ventanas, agregados, agua por posición, prioridades, calendario, identificador). Pruebas en `analysis.test.ts` sobre el paquete real.
- `state.ts`: selección sincronizada con la URL; cambiar de paso crea historial, los controles lo reemplazan.
- `components.tsx`, `ScenarioControls.tsx`, `hooks.ts`, `steps/*.tsx`, `raiz2d.css`.

## Sistema visual

Luz de altura: base `#edf0f5`, tinta `#18213a`, agua e interacción `#1f5fbf`. Un color por cultivo: papa `#6b4428`, quinua `#a8264e`, haba `#3e7136`, descanso `#c49a3a`. Alegreya (títulos) y Alegreya Sans (texto y cifras tabulares). Los estados combinan forma y texto (círculo con visto, círculo con raya, rombo discontinuo, medio círculo); el color nunca es la única señal.

## Verificación

- Datos: `backend/.venv/bin/python scripts/build_raiz.py` regenera el paquete (5 s); `pytest backend/tests` (162).
- `npx vitest run src/raiz2d` (19 pruebas; reproduce los 324 agregados publicados).
- `npx playwright test e2e/raiz2d.spec.ts` (8 pruebas): recorrido, cero proveedores, n < 3, prioridades y empate, presupuesto, tabla, ficha y audio, móvil, créditos.

Modelo de datos: ADR-044 (`fao56-balance-1`).
