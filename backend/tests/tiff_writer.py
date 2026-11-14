"""Escritor mínimo de GeoTIFF en mosaico para las pruebas (no se usa en producción)."""

import struct
import zlib
from dataclasses import dataclass
from typing import Literal

import numpy as np


@dataclass(frozen=True)
class GeoTags:
    west: float
    north: float
    pixel_width: float
    pixel_height: float
    pixel_is_point: bool = False
    epsg: int = 4326


def _sample_format(dtype: np.dtype[np.generic]) -> int:
    return {"u": 1, "i": 2, "f": 3}[dtype.kind]


def write_cog(
    levels: list[np.ndarray],
    geo: GeoTags,
    *,
    tile: int = 16,
    compression: int = 8,
    predictor: int = 1,
    nodata: str | None = None,
    bigtiff: bool = False,
    order: Literal["<", ">"] = "<",
    extra_tags: dict[int, tuple[int, list[int]]] | None = None,
) -> bytes:
    """Escribe ``levels`` (imagen completa y vistas reducidas) como un COG de una banda."""
    out = bytearray()
    out += (b"II" if order == "<" else b"MM") + struct.pack(order + "H", 43 if bigtiff else 42)
    if bigtiff:
        out += struct.pack(order + "HHQ", 8, 0, 0)
        first_pointer = 8
    else:
        out += struct.pack(order + "I", 0)
        first_pointer = 4

    def encode_tile(block: np.ndarray) -> bytes:
        data = block.astype(block.dtype.newbyteorder(order))
        if predictor == 2:
            diff = data.copy()
            diff[:, 1:] = data[:, 1:] - data[:, :-1]
            data = diff
        raw = data.tobytes()
        return zlib.compress(raw) if compression == 8 else raw

    # Datos de los mosaicos primero; las IFD al final.
    level_tiles: list[tuple[list[int], list[int]]] = []
    for array in levels:
        height, width = array.shape
        offsets: list[int] = []
        counts: list[int] = []
        for ty in range(0, height, tile):
            for tx in range(0, width, tile):
                block = np.zeros((tile, tile), dtype=array.dtype)
                part = array[ty : ty + tile, tx : tx + tile]
                block[: part.shape[0], : part.shape[1]] = part
                encoded = encode_tile(block)
                offsets.append(len(out))
                counts.append(len(encoded))
                out += encoded
        level_tiles.append((offsets, counts))

    pointer_position = first_pointer
    for index, array in enumerate(levels):
        height, width = array.shape
        offsets, counts = level_tiles[index]
        dtype = array.dtype
        entries: list[tuple[int, int, list[float] | list[int] | bytes]] = []
        if index > 0:
            entries.append((254, 4, [1]))
        entries += [
            (256, 3, [width]),
            (257, 3, [height]),
            (258, 3, [dtype.itemsize * 8]),
            (259, 3, [compression]),
            (262, 3, [1]),
            (277, 3, [1]),
            (284, 3, [1]),
            (317, 3, [predictor]),
            (322, 3, [tile]),
            (323, 3, [tile]),
            (324, 16 if bigtiff else 4, offsets),
            (325, 16 if bigtiff else 4, counts),
            (339, 3, [_sample_format(dtype)]),
        ]
        if index == 0:
            raster_type = 2 if geo.pixel_is_point else 1
            entries += [
                (33550, 12, [geo.pixel_width, geo.pixel_height, 0.0]),
                (33922, 12, [0.0, 0.0, 0.0, geo.west, geo.north, 0.0]),
                (34735, 3, [1, 1, 0, 2, 1025, 0, 1, raster_type, 2048, 0, 1, geo.epsg]),
            ]
            if nodata is not None:
                entries.append((42113, 2, nodata.encode() + b"\0"))
        for extra_tag, (extra_type, extra_values) in (extra_tags or {}).items():
            entries = [entry for entry in entries if entry[0] != extra_tag]
            entries.append((extra_tag, extra_type, extra_values))
        entries.sort(key=lambda entry: entry[0])

        formats = {2: "s", 3: "H", 4: "I", 12: "d", 16: "Q"}
        inline_size = 8 if bigtiff else 4
        ifd_position = len(out)
        struct.pack_into(order + ("Q" if bigtiff else "I"), out, pointer_position, ifd_position)
        count_format = "Q" if bigtiff else "H"
        entry_size = 20 if bigtiff else 12
        ifd = bytearray(struct.pack(order + count_format, len(entries)))
        overflow = bytearray()
        overflow_base = ifd_position + len(ifd) + len(entries) * entry_size + inline_size
        for tag, field_type, values in entries:
            payload: bytes
            if isinstance(values, bytes):
                payload = values
                count = len(values)
            else:
                count = len(values)
                payload = struct.pack(f"{order}{count}{formats[field_type]}", *values)
            if bigtiff:
                head = struct.pack(order + "HHQ", tag, field_type, count)
            else:
                head = struct.pack(order + "HHI", tag, field_type, count)
            if len(payload) <= inline_size:
                value = payload.ljust(inline_size, b"\0")
            else:
                value = struct.pack(
                    order + ("Q" if bigtiff else "I"), overflow_base + len(overflow)
                )
                overflow += payload
                if len(overflow) % 2:
                    overflow += b"\0"
            ifd += head + value
        pointer_position = ifd_position + len(ifd)
        ifd += b"\0" * inline_size
        out += ifd + overflow
    return bytes(out)
