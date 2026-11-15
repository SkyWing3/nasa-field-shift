# Roadmap — TerraLab 3D

> **Importante:** esta es una hoja de ruta *orientativa*. El alcance real de cada fase lo define el prompt correspondiente. Si un prompt redefine, fusiona o reordena fases, esta tabla se actualiza para reflejarlo. No se implementa nada de una fase antes de recibir su prompt.

## Visión (actualizada en la fase 02)

TerraLab 3D es un simulador de gestión agrícola en 3D, del género de Global Farmer (referencia solo de experiencia y mecánicas generales; no se copian sus assets, código, interfaz ni identidad), apoyado en modelos agronómicos explícitos y datos científicos de la NASA. Presupuesto de assets, software y servicios: USD 0.

| # | Capacidad del jugador | Fase prevista |
|---|---|---|
| 1 | Explorar un mapa mundial | 3 ✅ |
| 2 | Seleccionar una ubicación geográfica | 3 ✅ |
| 3 | Generar una granja 3D | 4 ✅ |
| 4 | Dibujar parcelas de diferentes formas | 5 |
| 5 | Seleccionar cultivos | 5 (selección) · 8 (modelos 3D) |
| 6 | Preparar, sembrar, regar y cosechar | 5 (preparación) · 9 (ciclo completo) |
| 7 | Avanzar días, meses y años | 6 |
| 8 | Observar cambios climáticos | 7 · 9 |
| 9 | Gestionar rotaciones | 10 |
| 10 | Comparar futuros agrícolas con datos NASA | 10 |

## Fases

| Fase | Nombre | Objetivo resumido | Estado |
|---|---|---|---|
| 0 | Fundación | Instrucciones maestras en `CLAUDE.md`, documentación base del proyecto | ✅ Completada |
| 1 | Arquitectura y configuración inicial | Monorepo, frontend (React/TS/Vite/R3F/Drei/Zustand), arquitectura modular, tipos de dominio con unidades, primera pantalla, backend FastAPI con salud y CORS, lint, pruebas unitarias y e2e | ✅ Completada (2026-11-14) |
| 2 | Actualización de visión y pipeline de assets | Visión de simulador de gestión agrícola, restricción de costo cero, adquisición verificada de assets CC0, optimización web (GLB, LOD, WebP, meshopt), catálogo con licencias y visualizador de desarrollo | ✅ Completada (2026-11-14) |
| 3 | Mapa mundial y selección geográfica | Mapa mundial (MapLibre), búsqueda de lugares, selección de coordenadas, región rectangular con medidas geodésicas, marco local ENU para la escena, región demostrativa verificada del Valle Alto de Cochabamba, persistencia local de la ubicación | ✅ Completada (2026-11-14) |
| 4 | Generación geográfica del mundo 3D | Relieve real NASADEM, cobertura ESA WorldCover y elementos OSM; terreno con LOD, materiales PBR del catálogo, vegetación instanciada con impostores, HDRI, sombras, cámara explorable y selección del terreno | ✅ Completada (2026-11-14) |
| 5 | Parcelas e interacción | Dibujo de parcelas con formas libres, selección de cultivo, herramientas de preparación del suelo, sistema de comandos | ⏳ Pendiente de prompt |
| 6 | Motor agronómico v1 | Paso de tiempo discreto (días, meses, años), balance hídrico, crecimiento y fenología con modelos documentados | ⏳ Pendiente de prompt |
| 7 | Datos científicos NASA | Integración de fuentes NASA, caché, trazabilidad de procedencia, clima observado | ⏳ Pendiente de prompt |
| 8 | Cultivos 3D realistas | Papa, maíz y haba por estado fenológico (BBCH): modelado procedimental o assets con licencia compatible (ver faltantes en `ASSETS.md`) | ⏳ Pendiente de prompt |
| 9 | Ciclo completo de cultivo | Siembra, riego, cosecha, rendimiento y cambios ambientales visibles | ⏳ Pendiente de prompt |
| 10 | Rotaciones y futuros agrícolas | Estrategias multi-temporada/multi-año, escenarios climáticos, comparación de resultados | ⏳ Pendiente de prompt |
| 11 | Persistencia | Guardado y carga de partidas y escenarios (local/SQLite) | ⏳ Pendiente de prompt |
| 12 | Rendimiento y QA | Presupuestos medidos, KTX2/Basis, instancing, LOD masivo e impostores, pruebas E2E, endurecimiento | ⏳ Pendiente de prompt |
