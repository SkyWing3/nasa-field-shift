# Parámetros agronómicos de P6 v3

La fuente de verdad es `content/p6/` en la raíz del monorepo. Estas copias sustituyen los borradores anteriores y conservan los bytes de P6. No se completan valores desconocidos con ceros.

`PROMPT_DEV1_IA.md` y `rotations.json` aprueban los nueve casos: tres secuencias y tres posiciones cíclicas. El generador por lotes está en `simulacion/scripts/build_raiz.py`; no se añadieron cálculos en vivo ni llamadas de proveedores desde la UI.

Siguen ausentes el factor numérico de cobertura parcial del descanso, las fechas precisas de floración y los umbrales numéricos de exposición a viento/lluvia. Esos KPI son null. Los umbrales térmicos suministrados se conservan, sin convertir todo el ciclo o todo Kc_mid en floración.

Las duraciones de etapas se suponen desde FAO-56 Tabla 11 y se escalan al calendario: papa 25/30/45/30; haba seca de noviembre 90/45/40/60. No hay quinua en Tabla 11: el proxy de cereales pequeños 20/30/60/40 se marca como supuesto explícito, no como parámetro local. Fechas concretas 1-oct a 15-abr: supuesto dentro del calendario indicado.

La estimación de agua es demanda ET0×Kc menos lluvia efectiva diaria acotada a la demanda. No acredita reserva de suelo entre días, no estima escorrentía ni es un balance continuo de suelo o una pauta de riego. Los rangos NRCS de retención y Zr se muestran como referencias no medidas; no se inventa una profundidad efectiva.

CHIRPS continúa unavailable. La líder aprobó los nueve casos, no una calibración agronómica de este modelo.
