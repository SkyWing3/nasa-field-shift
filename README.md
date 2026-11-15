# NASA Field Shift · Monorepo

El repositorio reúne dos proyectos independientes:

| Carpeta | Proyecto | Inicio |
| --- | --- | --- |
| [simulacion](simulacion/README.md) | TerraLab 3D, frontend React/Vite y API FastAPI | `cd simulacion` y `make dev` |
| [raiz-hackaton](raiz-hackaton/README.md) | Centro de coordinación y entregas del hackatón | `cd raiz-hackaton` y `python3 server.py --port 8787` |

El código que antes estaba en `frontend/`, `backend/`, `docs/` y `scripts/` ahora está dentro de `simulacion/`. Sus comandos se ejecutan desde esa carpeta. El centro de coordinación conserva sus instrucciones y contratos propios.

La configuración de Cloudflare de TerraLab sigue usando el frontend en el puerto 5173; el proxy `/api` lo comunica con FastAPI en el puerto 8000. Ambos servidores deben estar en ejecución.

El contenido agronómico P6 v3 está en [`content/p6/`](content/p6/README.md). Los datos POWER y la copia de parámetros para el backend están en `simulacion/backend/data/`. Los paquetes de revisión están en `simulacion/docs/validaciones/`. Los assets, cachés, dependencias y archivos `.env` locales se conservan fuera del versionado.

La [entrega P6 / Dev 1](simulacion/docs/ENTREGA_P6_V3.md) incluye nueve casos precalculados, boletín quechua y una página de créditos. Con `cd simulacion && make dev`, se puede abrir el comparador en `http://localhost:5173/raiz.html` y los créditos en `http://localhost:5173/creditos.html`. El cálculo es preliminar y conserva como «sin dato» los parámetros ausentes.

La integración de los cambios locales está documentada en [Migración al monorepo](simulacion/docs/MIGRACION_MONOREPO.md).
