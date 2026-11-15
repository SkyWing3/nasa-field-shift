# Integración de los cambios locales al monorepo

Se integró `origin/develop` en la rama de trabajo, conservando los avances locales posteriores a las fases 00–04. El remoto trasladó TerraLab a `simulacion/` e incorporó `raiz-hackaton/` como proyecto independiente.

## Conservación del trabajo

- Respaldo completo externo del directorio, con copia APFS, configuración, datos, assets, dependencias, cambios locales y bundle Git.
- Punto de restauración local antes de fusionar; no se publicó ningún commit en el remoto.
- Los 320 archivos locales versionables se comprobaron contra el respaldo. Antes de las correcciones de compilación, todos conservaban su contenido; la excepción fue `.gitignore`, distribuido según las reglas generales y específicas del monorepo.
- Los conflictos de Git eran de ubicación de archivos agregados. Se resolvieron trasladándolos a `simulacion/`, sin reemplazar el trabajo local por la versión antigua del remoto.
- Se trasladaron también `node_modules`, `.venv`, `.env.local`, la biblioteca de assets, GeoNames y las cachés geográficas. Se repararon las referencias absolutas del entorno virtual a su nueva ruta.
- Los datos científicos y el ZIP público de D1-2 conservan los mismos bytes y checksums. Solo se actualizaron las rutas externas de su comprobante de entrega.
- `raiz-hackaton/` se conserva como llegó del remoto, sin mezclar su centro de coordinación con la API científica.

## Compatibilidad del mundo 3D

Las pruebas previas del frontend aún no pasaban los campos nuevos de bioma, especies, imagen satelital y elementos del contexto. Se actualizaron sus entradas sintéticas para respetar los contratos actuales. La publicación de assets usaba un antiguo `layer.id`; ahora recoge los materiales y modelos de todos los biomas y conserva los modelos de respaldo. Una prueba comprueba que no se omitan los recursos de selva y altiplano.

## Comandos desde la nueva ubicación

```sh
cd simulacion
make dev
```

API y frontend también se pueden iniciar por separado con `make dev-backend` y `make dev-frontend`. Cloudflare sigue apuntando al mismo puerto 5173; la API usa el proxy `/api` del frontend.

El análisis POWER se ejecuta desde `simulacion/`:

```sh
backend/.venv/bin/python scripts/power_d1_2.py backend/data/power/obrajes/2026-11-14
```

La revisión de privacidad, los borradores de cultivos/rotaciones, el resultado 4/5 y la restricción de no ejecutar los nueve casos sin aprobación se conservan.

## Validación de la integración

| Comprobación | Resultado |
| --- | --- |
| Backend completo | 121 pruebas pasan |
| Frontend completo | 175 pruebas pasan en 24 archivos |
| TypeScript y build | Sin errores; build publica 55 recursos, 117,7 MB |
| POWER | 6 pruebas pasan; ZIP y todos sus checksums sin cambios |
| Navegador | 2 pruebas de inicio/reintento pasan; aviso regional verificado en escritorio y móvil, sin errores de consola |
| API local y proxy Vite | `/api/health` devuelve JSON correcto en 8000 y 5173 |
| Proyecto Raíz | Sin diferencias respecto de `origin/develop` |

Durante la verificación, el dominio público devolvía el error 1033 de Cloudflare y no había un conector `cloudflared` activo en esta máquina. Se conservó su configuración de frontend y proxy; hace falta volver a iniciar el túnel existente para recuperar el acceso público. No se cambiaron credenciales ni la configuración de la cuenta de Cloudflare.
