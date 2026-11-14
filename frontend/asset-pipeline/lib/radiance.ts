/** Lectura de la cabecera de imágenes HDR Radiance (RGBE) para validar archivos de entorno. */

export interface RadianceHeader {
  readonly width: number;
  readonly height: number;
}

const MAX_HEADER_BYTES = 4096;

/**
 * La cabecera es texto ASCII: firma `#?RADIANCE` o `#?RGBE`, líneas de variables, una línea
 * vacía y la línea de resolución (normalmente `-Y <alto> +X <ancho>`).
 */
export function parseRadianceHeader(bytes: Uint8Array): RadianceHeader {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, MAX_HEADER_BYTES));
  if (!text.startsWith('#?RADIANCE') && !text.startsWith('#?RGBE')) {
    throw new Error('No es un archivo Radiance HDR (falta la firma #?RADIANCE)');
  }
  const blank = text.indexOf('\n\n');
  if (blank === -1) throw new Error('Cabecera HDR incompleta');
  const variables = text.slice(0, blank);
  if (!/^FORMAT=32-bit_rle_rgbe$/m.test(variables)) {
    throw new Error('Formato HDR no soportado (se esperaba 32-bit_rle_rgbe)');
  }
  const resolutionLine = text.slice(blank + 2).split('\n', 1)[0] ?? '';
  const match = /^-Y (\d+) \+X (\d+)$/.exec(resolutionLine.trim());
  if (match === null) throw new Error(`Línea de resolución no soportada: "${resolutionLine}"`);
  return { height: Number(match[1]), width: Number(match[2]) };
}
