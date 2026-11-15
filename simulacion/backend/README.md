# TerraLab API (backend)

Servicio FastAPI de TerraLab 3D. Expone:

- `GET /api/health`: estado del servicio (fase 01).
- `GET /api/geocoding/info` y `GET /api/geocoding/search?q=&limit=`: búsqueda de lugares a través
  de un proveedor intercambiable (fase 03). Por defecto es el nomenclátor GeoNames local que genera
  `make geodata`. Nominatim es opcional y está desactivado: antes de activarlo, lee su
  [política de uso](https://operations.osmfoundation.org/policies/nominatim/).

- `GET /api/world/datasets`, `/api/world/elevation`, `/api/world/landcover` y
  `/api/world/features`: datos geográficos para generar el mundo 3D (fase 04). Son NASADEM vía
  OpenTopography (citar a NASA JPL y a OpenTopography), ESA WorldCover (CC BY 4.0) y OpenStreetMap
  (ODbL). Se leen por rangos de bytes con caché en disco (`make worlddata` prepara la región
  demostrativa). Overpass en vivo solo funciona si se configura una instancia
  (`TERRALAB_OVERPASS_URL`).

El motor agronómico, los datos climáticos de la NASA y la persistencia de partidas se
implementarán en fases posteriores (ver `../docs/ROADMAP.md`).

Instrucciones de instalación y ejecución: ver el `README.md` de la raíz del repositorio.
