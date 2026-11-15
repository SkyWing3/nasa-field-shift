# Actualización integrada del plan · v3.1

Fuente: `correcciones_raiz_v3_compacto.md`, P6, 14-nov-2026 19:10 Bolivia.
Referencia: libfile_ab11f4f3b7748191ac40fec575200c70.

## Cambios adoptados

1. Tres secuencias por tres posiciones cíclicas: nueve casos. La vista pregunta
   por el cultivo en la campaña de decisión; muestra sus KPI y n y, debajo,
   los KPI del ciclo completo. La posición inicial ya no obliga a papa.
2. Campaña y = nov y–mar y+1; ventana y/y+1/y+2 completas, última decisión 2023.
   ONI NDJ de y clasifica el grupo; el clima de las otras campañas no se altera.
   Niño fuerte >=1,5; n=5 reportado por P6 se recalcula, sin conclusión si n<3.
3. El pronóstico ENSO externo puede citarse con fuente, fecha e incertidumbre.
   Se mantiene fuera el pronóstico propio a 24 h. Se distingue Niño 1+2 de ONI.
4. Cuaderno `prueba_descarte_oruro.ipynb` reportado por P6: entregar a D1 y
   reproducir con punto final. Se conservan método y cifras aportadas como
   referencia pendiente, no como resultados confirmados ni probabilidad.

## Fuentes externas consultadas el 14-nov-2026

- IRI Quick Look, emisión 19-oct-2026:
  https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/
  Sustenta contexto de evento muy intenso y Niño 1+2 >+5 °C en ese informe.
- NOAA CPC, emisión 12-nov-2026:
  https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml
  Describe como probable un Niño de fuerte a muy fuerte hasta ene–mar 2027.
  El pitch usa esa formulación probabilística; no garantiza sequía en Oruro.
- Garreaud y Aceituno (2001), Journal of Climate:
  https://journals.ametsoc.org/abstract/journals/clim/14/12/1520-0442_2001_014_2779_irvots_2.0.co_2.xml
  Respalda la asociación regional con excepciones. La revisión específica de
  Vuille y Keimig (2004) sigue asignada a P6.

Los enlaces NOAA/IRI cambian con nuevas emisiones. P6 conserva las emisiones
usadas antes del pitch. La actualización del plan no reproduce el cuaderno.

## Archivos alineados

`dist/index.html`, `dist/app.js`, `raiz.html`, `plan-equipo.json`, `README.md`
y `contracts/README.md`. Las 37 fichas se regeneraron desde el JSON del plan;
sus códigos, responsables de rol y dependencias se conservan salvo ajustes
explícitos de esta corrección. Dev 2 figura como Nicole.

El tablero se obtuvo mediante backup consistente de la base original en modo
lectura. Se conservaron los 37 IDs, responsables asignados y estados; los títulos
y áreas se actualizaron por código. La tabla `plan_revisions` conserva la versión
previa del plan y del tablero. No se modificó el proyecto original.

## Comprobación y continuidad

La evidencia ejecutable de este cambio está en `build/plan-v3.1-check.json`.
Se comprueban JSON, 37 fichas coherentes, nueve posiciones, exportación de
contexto, paridad de la copia autocontenida y servidor HTTP en 8787.
El módulo Dev 2 conserva sus pruebas de fixtures; no implementa los nuevos
nueve casos científicos por haber modificado el plan.

No se abrieron túneles ni se declaró una emisión de radio o validación humana.
Cloudflare puede apuntar a `http://127.0.0.1:8787` de esta computadora mientras
el servidor esté activo.
