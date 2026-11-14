"""Lectura de la cabecera de GeoTIFF en mosaico (Cloud Optimized GeoTIFF).

Implementa solo lo necesario para leer ventanas de los COG de NASADEM y ESA WorldCover:
TIFF clásico y BigTIFF, mosaicos (*tiles*), compresión ninguna/DEFLATE, predictor 1 y 2,
enteros y coma flotante de una sola banda, georreferenciación con ``ModelTiepoint`` y
``ModelPixelScale`` (sin rotación) en EPSG:4326. Cualquier otra variante se rechaza con un
error explícito en lugar de leerse mal.
"""

import struct
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import numpy as np

# Etiquetas TIFF y GeoTIFF utilizadas.
NEW_SUBFILE_TYPE = 254
IMAGE_WIDTH = 256
IMAGE_LENGTH = 257
BITS_PER_SAMPLE = 258
COMPRESSION = 259
SAMPLES_PER_PIXEL = 277
PLANAR_CONFIG = 284
PREDICTOR = 317
TILE_WIDTH = 322
TILE_LENGTH = 323
TILE_OFFSETS = 324
TILE_BYTE_COUNTS = 325
SAMPLE_FORMAT = 339
MODEL_PIXEL_SCALE = 33550
MODEL_TIEPOINT = 33922
GEO_KEY_DIRECTORY = 34735
GDAL_NODATA = 42113

GT_RASTER_TYPE_KEY = 1025
GEOGRAPHIC_TYPE_KEY = 2048
RASTER_PIXEL_IS_POINT = 2

COMPRESSION_NONE = 1
COMPRESSION_DEFLATE = (8, 32946)

# tipo TIFF → (bytes por valor, formato de struct)
_FIELD_TYPES: dict[int, tuple[int, str]] = {
    1: (1, "B"),
    2: (1, "s"),
    3: (2, "H"),
    4: (4, "I"),
    6: (1, "b"),
    7: (1, "B"),
    8: (2, "h"),
    9: (4, "i"),
    11: (4, "f"),
    12: (8, "d"),
    16: (8, "Q"),
    17: (8, "q"),
}

ReadRange = Callable[[int, int], Awaitable[bytes]]


class TiffFormatError(ValueError):
    """El archivo no es un TIFF válido o usa una variante no admitida."""


@dataclass(frozen=True, slots=True)
class GeoReference:
    """Georreferencia en grados con convención de área (esquina superior izquierda del píxel)."""

    west: float
    north: float
    pixel_width: float
    pixel_height: float
    pixel_is_point: bool


@dataclass(frozen=True, slots=True)
class TiffLevel:
    """Una resolución del COG: la imagen completa o una de sus vistas reducidas."""

    width: int
    height: int
    tile_width: int
    tile_height: int
    dtype: np.dtype[np.generic]
    compression: int
    predictor: int
    tile_offsets: tuple[int, ...]
    tile_byte_counts: tuple[int, ...]

    @property
    def tiles_across(self) -> int:
        return -(-self.width // self.tile_width)

    @property
    def tiles_down(self) -> int:
        return -(-self.height // self.tile_height)


@dataclass(frozen=True, slots=True)
class CogLayout:
    levels: tuple[TiffLevel, ...]
    georef: GeoReference
    nodata: float | None


@dataclass(frozen=True, slots=True)
class _Entry:
    tag: int
    field_type: int
    count: int
    inline: bytes
    offset: int | None


def _dtype(bits: int, sample_format: int, byte_order: str) -> np.dtype[np.generic]:
    kinds = {1: "u", 2: "i", 3: "f"}
    if sample_format not in kinds or bits not in (8, 16, 32, 64):
        raise TiffFormatError(f"Tipo de muestra no admitido: {bits} bits, formato {sample_format}")
    if sample_format == 3 and bits < 32:
        raise TiffFormatError("Coma flotante de menos de 32 bits no admitida")
    return np.dtype(f"{byte_order}{kinds[sample_format]}{bits // 8}")


async def read_layout(read: ReadRange) -> CogLayout:
    """Lee las IFD del archivo (imagen principal y vistas reducidas) a través de ``read``."""
    header = await read(0, 16)
    if header[:2] == b"II":
        order = "<"
    elif header[:2] == b"MM":
        order = ">"
    else:
        raise TiffFormatError("Cabecera TIFF no reconocida")
    version = struct.unpack(order + "H", header[2:4])[0]
    if version == 42:
        big = False
        next_ifd = struct.unpack(order + "I", header[4:8])[0]
    elif version == 43:
        big = True
        next_ifd = struct.unpack(order + "Q", header[8:16])[0]
    else:
        raise TiffFormatError(f"Versión TIFF no admitida: {version}")

    async def values(entry: _Entry) -> tuple[float | int, ...]:
        size, fmt = _FIELD_TYPES.get(entry.field_type, (0, ""))
        if not size:
            raise TiffFormatError(f"Tipo de campo TIFF no admitido: {entry.field_type}")
        raw = (
            entry.inline[: size * entry.count]
            if entry.offset is None
            else await read(entry.offset, size * entry.count)
        )
        if fmt == "s":
            return tuple(raw)
        return struct.unpack(f"{order}{entry.count}{fmt}", raw)

    async def text(entry: _Entry) -> str:
        raw = entry.inline if entry.offset is None else await read(entry.offset, entry.count)
        return raw[: entry.count].rstrip(b"\0").decode("latin-1")

    levels: list[TiffLevel] = []
    georef: GeoReference | None = None
    nodata: float | None = None
    visited: set[int] = set()
    while next_ifd and len(levels) < 32:
        if next_ifd in visited:
            raise TiffFormatError("Cadena de IFD circular")
        visited.add(next_ifd)
        count_size, entry_size, pointer_size = (8, 20, 8) if big else (2, 12, 4)
        raw_count = await read(next_ifd, count_size)
        count = struct.unpack(order + ("Q" if big else "H"), raw_count)[0]
        body = await read(next_ifd + count_size, count * entry_size + pointer_size)
        entries: dict[int, _Entry] = {}
        for index in range(count):
            chunk = body[index * entry_size : (index + 1) * entry_size]
            if big:
                tag, field_type, n = struct.unpack(order + "HHQ", chunk[:12])
                inline = chunk[12:20]
            else:
                tag, field_type, n = struct.unpack(order + "HHI", chunk[:8])
                inline = chunk[8:12]
            size = _FIELD_TYPES.get(field_type, (1, ""))[0]
            offset = (
                None
                if size * n <= len(inline)
                else struct.unpack(order + ("Q" if big else "I"), inline)[0]
            )
            entries[tag] = _Entry(tag, field_type, n, inline, offset)
        next_ifd = struct.unpack(
            order + ("Q" if big else "I"),
            body[count * entry_size : count * entry_size + pointer_size],
        )[0]

        async def scalar(tag: int, default: int | None = None) -> int:
            entry = entries.get(tag)  # noqa: B023 — se usa dentro de la misma iteración
            if entry is None:
                if default is None:
                    raise TiffFormatError(f"Falta la etiqueta TIFF {tag}")
                return default
            return int((await values(entry))[0])

        subfile = await scalar(NEW_SUBFILE_TYPE, 0)
        if subfile & 4:  # máscara de transparencia: no es una vista de los datos
            continue
        if TILE_WIDTH not in entries:
            raise TiffFormatError("Solo se admiten TIFF en mosaico (Cloud Optimized GeoTIFF)")
        if await scalar(SAMPLES_PER_PIXEL, 1) != 1:
            raise TiffFormatError("Solo se admiten imágenes de una banda")
        if await scalar(PLANAR_CONFIG, 1) != 1:
            raise TiffFormatError("Configuración planar no admitida")
        compression = await scalar(COMPRESSION, 1)
        if compression != COMPRESSION_NONE and compression not in COMPRESSION_DEFLATE:
            raise TiffFormatError(f"Compresión TIFF no admitida: {compression}")
        predictor = await scalar(PREDICTOR, 1)
        if predictor not in (1, 2):
            raise TiffFormatError(f"Predictor TIFF no admitido: {predictor}")
        dtype = _dtype(await scalar(BITS_PER_SAMPLE, 1), await scalar(SAMPLE_FORMAT, 1), order)
        if predictor == 2 and dtype.kind == "f":
            raise TiffFormatError("Predictor horizontal sobre coma flotante no admitido")
        level = TiffLevel(
            width=await scalar(IMAGE_WIDTH),
            height=await scalar(IMAGE_LENGTH),
            tile_width=await scalar(TILE_WIDTH),
            tile_height=await scalar(TILE_LENGTH),
            dtype=dtype,
            compression=compression,
            predictor=predictor,
            tile_offsets=tuple(int(v) for v in await values(entries[TILE_OFFSETS])),
            tile_byte_counts=tuple(int(v) for v in await values(entries[TILE_BYTE_COUNTS])),
        )
        if len(level.tile_offsets) != level.tiles_across * level.tiles_down:
            raise TiffFormatError("El número de mosaicos no coincide con el tamaño de la imagen")
        if not levels:
            georef = await _georeference(entries, values)
            if GDAL_NODATA in entries:
                raw_nodata = (await text(entries[GDAL_NODATA])).strip()
                nodata = float(raw_nodata) if raw_nodata else None
        levels.append(level)

    if not levels or georef is None:
        raise TiffFormatError("El archivo no contiene ninguna imagen")
    full = levels[0]
    for level in levels[1:]:
        if level.dtype != full.dtype:
            raise TiffFormatError("Las vistas reducidas tienen otro tipo de dato")
    return CogLayout(levels=tuple(levels), georef=georef, nodata=nodata)


async def _georeference(
    entries: dict[int, _Entry],
    values: Callable[[_Entry], Awaitable[tuple[float | int, ...]]],
) -> GeoReference:
    if MODEL_PIXEL_SCALE not in entries or MODEL_TIEPOINT not in entries:
        raise TiffFormatError("Falta la georreferencia (ModelPixelScale/ModelTiepoint)")
    scale = await values(entries[MODEL_PIXEL_SCALE])
    tie = await values(entries[MODEL_TIEPOINT])
    if len(tie) != 6 or tie[0] != 0 or tie[1] != 0:
        raise TiffFormatError("Solo se admite un punto de enlace en el píxel (0, 0)")
    pixel_is_point = False
    if GEO_KEY_DIRECTORY in entries:
        keys = await values(entries[GEO_KEY_DIRECTORY])
        for index in range(4, 4 + 4 * int(keys[3]), 4):
            key_id, location, _count, value = (int(v) for v in keys[index : index + 4])
            if location != 0:
                continue
            if key_id == GT_RASTER_TYPE_KEY:
                pixel_is_point = value == RASTER_PIXEL_IS_POINT
            elif key_id == GEOGRAPHIC_TYPE_KEY and value != 4326:
                raise TiffFormatError(f"Sistema de referencia no admitido: EPSG:{value}")
    width, height = float(scale[0]), float(scale[1])
    west, north = float(tie[3]), float(tie[4])
    if pixel_is_point:
        # Se pasa a la convención de área: el punto de enlace es el centro del píxel (0, 0).
        west -= width / 2
        north += height / 2
    return GeoReference(west, north, width, height, pixel_is_point)


def decode_tile(level: TiffLevel, raw: bytes) -> np.ndarray:
    """Descomprime un mosaico completo (tamaño ``tile_height x tile_width``)."""
    import zlib

    data = zlib.decompress(raw) if level.compression in COMPRESSION_DEFLATE else raw
    expected = level.tile_width * level.tile_height * level.dtype.itemsize
    if len(data) < expected:
        raise TiffFormatError("Mosaico truncado")
    tile = np.frombuffer(data[:expected], dtype=level.dtype).reshape(
        level.tile_height, level.tile_width
    )
    if level.predictor == 2:
        tile = np.cumsum(tile, axis=1, dtype=level.dtype)
    return tile.astype(level.dtype.newbyteorder("="), copy=False)
