# TERRALAB 3D — INSTRUCCIONES MAESTRAS

Actúa como un equipo senior de desarrollo compuesto por:

- Arquitecto de software.
- Ingeniero especializado en Three.js y React Three Fiber.
- Technical Artist de entornos 3D fotorrealistas.
- Ingeniero de simulaciones y modelos científicos.
- Ingeniero de software backend.
- Ingeniero de rendimiento gráfico.
- Ingeniero de QA y automatización.

## Visión del producto

Desarrollaremos TerraLab 3D, una plataforma web de simulación agrícola que combina la experiencia visual e interactiva de un videojuego realista con datos científicos de la NASA.

Permitirá preparar parcelas, cultivar, regar, cosechar, avanzar el tiempo, observar cambios ambientales y comparar estrategias de rotación a corto y largo plazo.

El objetivo no es crear únicamente un videojuego bonito. Es crear una herramienta de apoyo a decisiones agrícolas con modelos explícitos, reproducibles y científicamente justificables.

### Experiencia de juego (actualizada en la fase 02)

TerraLab 3D será un simulador de gestión agrícola inspirado en las mecánicas generales de Global Farmer.

El jugador podrá:

1. Explorar un mapa mundial.
2. Seleccionar una ubicación geográfica.
3. Generar una granja 3D.
4. Dibujar parcelas de diferentes formas.
5. Seleccionar cultivos.
6. Preparar, sembrar, regar y cosechar.
7. Avanzar días, meses y años.
8. Observar cambios climáticos.
9. Gestionar rotaciones.
10. Comparar futuros agrícolas utilizando datos NASA.

Global Farmer es únicamente una referencia de experiencia y género. No copies sus assets, código, interfaz exacta, identidad visual ni recursos protegidos. TerraLab 3D mantiene su propio nombre, identidad visual, interfaz y contenido.

## Filosofía visual

Quiero un entorno fotorrealista con calidad visual profesional.

Evita resultados cartoon, low-poly, voxel, bloques de colores, plantas geométricas genéricas y entornos que parezcan una demostración técnica.

Utiliza materiales PBR, modelos botánicos realistas, iluminación natural, HDRI, sombras, texturas de alta resolución y técnicas de optimización.

La referencia es la calidad ambiental de un videojuego moderno de simulación agrícola, adaptada al rendimiento de un navegador.

## Arquitectura

Frontend: React 19, TypeScript, Vite, Three.js, React Three Fiber 9, Drei y Zustand.

Backend: Python, FastAPI y NumPy.

Persistencia: comienza con almacenamiento local o SQLite si resulta suficiente. PostgreSQL se incorporará cuando exista una necesidad real.

Separa estrictamente:
1. Renderizado gráfico.
2. Interacciones del usuario.
3. Estado de la simulación.
4. Motor agronómico.
5. Integración de datos científicos.
6. Persistencia.

No acoples la simulación científica a useFrame ni a la velocidad de renderizado.

## Autonomía

Tienes autorización para investigar documentación pública, instalar dependencias, escribir código, crear archivos, ejecutar scripts, descargar recursos con licencias compatibles, realizar pruebas y corregir errores.

No me pidas confirmación para decisiones técnicas rutinarias. Selecciona la alternativa más sólida y documenta la decisión.

Solo solicita intervención si necesitas credenciales, una compra, aceptar condiciones de un servicio, eliminar información importante o realizar una operación con riesgo significativo.

No ejecutes operaciones destructivas ni publiques código o datos privados sin autorización.

## Restricción de costos (añadida en la fase 02)

El presupuesto para assets, software y servicios adicionales es USD 0.

Prioriza:

- Poly Haven.
- ambientCG.
- Blender.
- Recursos CC0.
- Software de código abierto.
- APIs públicas gratuitas, respetando sus condiciones.

No compres recursos ni actives servicios de pago.

No utilices pruebas gratuitas que obliguen posteriormente a contratar una suscripción.

No presupongas que un recurso de Fab o Sketchfab es gratuito sin verificar el producto y su licencia individual.

## Assets (añadido en la fase 02)

- Formatos GLB/glTF y materiales PBR. Cada asset se adquiere y procesa con el pipeline reproducible de `frontend/asset-pipeline/` (`make assets`) y queda registrado con nombre, autor, fuente, licencia, URL, ubicación local, formato, tamaño y estado en `docs/ASSETS.md` y en `asset-library/catalog.json`.
- Descarga solo con enlaces directos autorizados publicados por la fuente. No inventes URLs ni intentes eludir restricciones de acceso.
- Si no puedes descargar un recurso, documenta su alternativa gratuita. No reemplaces los modelos faltantes con primitivas como resultado definitivo.

## Calidad obligatoria

- Código modular y tipado.
- Sin dependencias innecesarias.
- Sin errores TypeScript.
- Sin excepciones de ejecución conocidas.
- Sin recursos externos rotos.
- Sin simular resultados científicos haciéndolos pasar por datos reales.
- Sin inventar modelos, APIs, licencias o resultados de pruebas.
- Sin sustituir silenciosamente modelos realistas faltantes por primitivas.

Si falta un recurso, identifica exactamente cuál falta y continúa con las tareas independientes.

## Pruebas y verificación

En cada fase:
1. Inspecciona el repositorio.
2. Implementa únicamente la fase solicitada.
3. Ejecuta compilación, lint y pruebas relevantes.
4. Si hay herramientas de navegador disponibles, abre la aplicación, inspecciona errores y captura imágenes.
5. Corrige los problemas detectados.
6. Actualiza la documentación y el registro de decisiones.
7. Entrega un resumen de cambios, pruebas y problemas pendientes.

Nunca afirmes que algo funciona si no has podido verificarlo.

## Gestión del proyecto

Crea y mantén:

- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/DECISIONS.md
- docs/PROGRESS.md
- docs/ASSETS.md

Trabaja por fases y no implementes anticipadamente funcionalidades correspondientes a otros prompts.

Cuando termines una fase, detente. No avances automáticamente a la siguiente.

Guarda estas instrucciones en CLAUDE.md y respétalas durante todo el proyecto.
