# Contenido P6 v3

Fuente agronómica y editorial recibida en `P6_entregas_v3.zip`. Los archivos originales se conservaron sin editar; `recepcion.json` registra sus SHA-256 y el del ZIP. Las copias de `point.json`, `crops.json`, `rotations.json` y `soils.json` en `simulacion/backend/data/agronomy/` deben coincidir con estos originales.

La evidencia escrita de autorización del productor se conserva fuera del repositorio y no se publica. El audio quechua y su transcripción se distribuyen con atribución anónima. El usuario indicó omitir el MP3 español ausente; no se generó una voz nueva.

El generador `simulacion/scripts/build_raiz.py` usa estas fuentes y los datos POWER locales. No ejecuta los cuadernos ni el script CHIRPS de esta carpeta. Para reconstruir la salida, ejecutar `make raiz-data` desde `simulacion/`. Ver [entrega técnica](../../simulacion/docs/ENTREGA_P6_V3.md).

La publicación corrige tres descripciones del documento original de créditos: radiación desde 1984; reproducción independiente limitada al análisis histórico «4 de 5»; y distinción entre audio quechua humano y referencia MMS española sin MP3 entregado. Esas correcciones se aplican en el generador, manteniendo el documento recibido intacto.
