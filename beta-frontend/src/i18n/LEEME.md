# Idiomas de la interfaz

El español es el idioma de origen y la referencia. Cada otro idioma es un archivo
`<código>.json` en esta carpeta. La app lo carga sola y lo agrega al selector
«Idioma» de la cabecera.

| Archivo   | Idioma             | Estado                                                     |
| --------- | ------------------ | ---------------------------------------------------------- |
| `qu.json` | Runasimi (quechua) | Traducción automática con IA (Claude), sin revisión de hablantes |
| `ay.json` | Aymar aru (aymara) | Traducción automática con IA (Claude), sin revisión de hablantes |

## Qué tiene cada archivo

- `_meta`: código, nombre (escrito en ese idioma), método de traducción y estado.
- `claves`: textos con nombre que usa el código con `t('clave', idioma)`. Incluye menú, portada, franja «Observar · Comparar · Decidir» y aviso de traducción.
- `textos`: frase exacta en español → traducción. El traductor de pantalla (`src/lib/traductor.js`) las reemplaza en toda la app, también en botones y etiquetas `aria-label`.
- `patrones`: frases con números o nombres. Un hueco que empieza con `n` (`{n}`, `{n2}`) es un número. Otro hueco (`{t}`, `{a}`) se traduce a su vez si está en `textos`. Ejemplo: `"{n} días": "{n} p'unchaw"`.

Un valor vacío (`""`) se muestra en español.

## Agregar un idioma (por ejemplo, guaraní)

1. Crear la plantilla con todas las frases vacías:

   ```bash
   npm run idioma -- nuevo gn "Avañe'ẽ (guaraní)"
   ```

2. Traducir los valores de `src/i18n/gn.json`. Lo ideal es que lo haga una persona hablante. Si se usa IA, hay que decirlo en `_meta.metodo` y dejar `estado: "revision_de_hablante_pendiente"`.
3. Revisar qué falta:

   ```bash
   npm run idioma -- revisar
   ```

4. Ejecutar `npm run dev`: el idioma ya aparece en el selector.

Para traducir con IA, se puede pegar el JSON completo en Claude con una instrucción como esta:

> Traduce los valores vacíos al guaraní usando como referencia las claves en español. No cambies las claves, los `{huecos}`, las cifras ni los nombres propios (NASA, POWER, NOAA, ONI, Raíz, Obrajes, Oruro).

## Qué no se traduce, a propósito

- Cifras, fuentes y citas técnicas (NASA POWER, FAO-56, identificadores de casos y versiones).
- Mensajes y boletines aprobados por P5/P6, y la grabación en quechua del productor: se muestran tal como fueron aprobados.
- Bloques marcados con `lang="es"` o `translate="no"`.
- Las alarmas: su título, texto y acción vienen traducidos en `public/alertas/alertas.json`, generado por `python -m raiz_data alarmas`. Para un idioma nuevo, hay que agregar sus frases en `raiz-hackaton/raiz_data/alarms.py` (plantillas `T`). Si faltan, se muestran en español.

## «Otro idioma…»

Para cualquier otro idioma sin archivo, el selector ofrece «Otro idioma…». Esa opción explica cómo usar el «Traducir» del navegador (en Chrome: clic derecho → Traducir). Es traducción automática del navegador, y el español sigue siendo la referencia.
