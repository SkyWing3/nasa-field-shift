"""Decodificador mínimo de teselas vectoriales Mapbox Vector Tile (MVT 2.1, protobuf).

Solo lo necesario para leer las capas de OpenMapTiles: capas, entidades, etiquetas y geometrías
(puntos, líneas y polígonos con los comandos MoveTo/LineTo/ClosePath). Sin dependencias.
Especificación: https://github.com/mapbox/vector-tile-spec/tree/master/2.1
"""

import itertools
import struct
from dataclasses import dataclass, field
from typing import Literal

GeometryKind = Literal["Point", "LineString", "Polygon"]
TagValue = str | float | int | bool

_GEOMETRY_TYPES: dict[int, GeometryKind] = {1: "Point", 2: "LineString", 3: "Polygon"}


class MvtError(ValueError):
    """La tesela no es un MVT válido."""


@dataclass(slots=True)
class MvtFeature:
    id: int | None
    kind: GeometryKind
    #: Partes de la geometría en coordenadas de tesela (0…extent). Un punto es una parte de un
    #: vértice; una línea, una parte por segmento conexo; un polígono, una parte por anillo.
    parts: list[list[tuple[int, int]]]
    tags: dict[str, TagValue] = field(default_factory=dict)


@dataclass(slots=True)
class MvtLayer:
    name: str
    extent: int
    features: list[MvtFeature]


def _varint(data: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise MvtError("Varint truncado")
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7
        if shift > 63:
            raise MvtError("Varint demasiado largo")


def _fields(data: bytes) -> list[tuple[int, int, bytes | int]]:
    """Campos (número, tipo, valor) de un mensaje protobuf."""
    out: list[tuple[int, int, bytes | int]] = []
    pos = 0
    while pos < len(data):
        key, pos = _varint(data, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = _varint(data, pos)
            out.append((number, wire, value))
        elif wire == 2:
            length, pos = _varint(data, pos)
            if pos + length > len(data):
                raise MvtError("Campo truncado")
            out.append((number, wire, data[pos : pos + length]))
            pos += length
        elif wire == 1:
            out.append((number, wire, data[pos : pos + 8]))
            pos += 8
        elif wire == 5:
            out.append((number, wire, data[pos : pos + 4]))
            pos += 4
        else:
            raise MvtError(f"Tipo de campo protobuf no admitido: {wire}")
    return out


def _packed(data: bytes) -> list[int]:
    values: list[int] = []
    pos = 0
    while pos < len(data):
        value, pos = _varint(data, pos)
        values.append(value)
    return values


def _zigzag(value: int) -> int:
    return (value >> 1) ^ -(value & 1)


def _value(data: bytes) -> TagValue:
    for number, _wire, raw in _fields(data):
        if number == 1 and isinstance(raw, bytes):
            return raw.decode("utf-8", "replace")
        if number == 2 and isinstance(raw, bytes):
            return float(struct.unpack("<f", raw)[0])
        if number == 3 and isinstance(raw, bytes):
            return float(struct.unpack("<d", raw)[0])
        if number in (4, 5) and isinstance(raw, int):
            return raw if number == 5 or raw < 2**63 else raw - 2**64
        if number == 6 and isinstance(raw, int):
            return _zigzag(raw)
        if number == 7 and isinstance(raw, int):
            return bool(raw)
    return ""


def _geometry(commands: list[int]) -> list[list[tuple[int, int]]]:
    parts: list[list[tuple[int, int]]] = []
    current: list[tuple[int, int]] = []
    x = y = 0
    i = 0
    while i < len(commands):
        command = commands[i] & 7
        count = commands[i] >> 3
        i += 1
        if command == 1:  # MoveTo: empieza una parte
            for _ in range(count):
                if i + 1 >= len(commands):
                    raise MvtError("Geometría truncada")
                x += _zigzag(commands[i])
                y += _zigzag(commands[i + 1])
                i += 2
                if current:
                    parts.append(current)
                current = [(x, y)]
        elif command == 2:  # LineTo
            for _ in range(count):
                if i + 1 >= len(commands):
                    raise MvtError("Geometría truncada")
                x += _zigzag(commands[i])
                y += _zigzag(commands[i + 1])
                i += 2
                current.append((x, y))
        elif command == 7:  # ClosePath
            if current:
                current.append(current[0])
        else:
            raise MvtError(f"Comando de geometría desconocido: {command}")
    if current:
        parts.append(current)
    return parts


def decode_tile(data: bytes) -> list[MvtLayer]:
    layers: list[MvtLayer] = []
    for number, _wire, raw in _fields(data):
        if number != 3 or not isinstance(raw, bytes):
            continue
        name = ""
        extent = 4096
        keys: list[str] = []
        values: list[TagValue] = []
        raw_features: list[bytes] = []
        for lnum, _lwire, lraw in _fields(raw):
            if lnum == 1 and isinstance(lraw, bytes):
                name = lraw.decode("utf-8", "replace")
            elif lnum == 2 and isinstance(lraw, bytes):
                raw_features.append(lraw)
            elif lnum == 3 and isinstance(lraw, bytes):
                keys.append(lraw.decode("utf-8", "replace"))
            elif lnum == 4 and isinstance(lraw, bytes):
                values.append(_value(lraw))
            elif lnum == 5 and isinstance(lraw, int):
                extent = lraw
        features: list[MvtFeature] = []
        for feature_raw in raw_features:
            feature_id: int | None = None
            kind: GeometryKind | None = None
            tags: dict[str, TagValue] = {}
            geometry: list[int] = []
            for fnum, _fwire, fraw in _fields(feature_raw):
                if fnum == 1 and isinstance(fraw, int):
                    feature_id = fraw
                elif fnum == 2 and isinstance(fraw, bytes):
                    pairs = _packed(fraw)
                    for k in range(0, len(pairs) - 1, 2):
                        if pairs[k] < len(keys) and pairs[k + 1] < len(values):
                            tags[keys[pairs[k]]] = values[pairs[k + 1]]
                elif fnum == 3 and isinstance(fraw, int):
                    kind = _GEOMETRY_TYPES.get(fraw)
                elif fnum == 4 and isinstance(fraw, bytes):
                    geometry = _packed(fraw)
            if kind is None or not geometry:
                continue
            features.append(MvtFeature(feature_id, kind, _geometry(geometry), tags))
        layers.append(MvtLayer(name, extent, features))
    return layers


def ring_area(ring: list[tuple[int, int]]) -> float:
    """Área con signo (fórmula del lazo) en coordenadas de tesela (y hacia abajo)."""
    area = 0.0
    for (x0, y0), (x1, y1) in itertools.pairwise(ring):
        area += x0 * y1 - x1 * y0
    return area / 2
