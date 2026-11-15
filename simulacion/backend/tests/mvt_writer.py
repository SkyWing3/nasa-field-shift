"""Codificador MVT mínimo para las pruebas (teselas sintéticas, sin datos reales)."""

import struct
from dataclasses import dataclass, field

Point = tuple[int, int]
TagValue = str | float | int | bool


def _varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def _key(number: int, wire: int) -> bytes:
    return _varint((number << 3) | wire)


def _bytes_field(number: int, data: bytes) -> bytes:
    return _key(number, 2) + _varint(len(data)) + data


def _varint_field(number: int, value: int) -> bytes:
    return _key(number, 0) + _varint(value)


def _zigzag(value: int) -> int:
    return (value << 1) ^ (value >> 63)


def _value(value: TagValue) -> bytes:
    if isinstance(value, bool):
        return _varint_field(7, int(value))
    if isinstance(value, int):
        return _varint_field(6, _zigzag(value))
    if isinstance(value, float):
        return _key(3, 1) + struct.pack("<d", value)
    return _bytes_field(1, value.encode())


@dataclass
class Feature:
    kind: str  # "Point" | "LineString" | "Polygon"
    parts: list[list[Point]]
    tags: dict[str, TagValue] = field(default_factory=dict)
    id: int | None = None


def _geometry(kind: str, parts: list[list[Point]]) -> list[int]:
    commands: list[int] = []
    x = y = 0
    for part in parts:
        ring = part[:-1] if kind == "Polygon" and part[0] == part[-1] else part
        commands.append((1 & 7) | (1 << 3))
        commands += [_zigzag(ring[0][0] - x), _zigzag(ring[0][1] - y)]
        x, y = ring[0]
        if len(ring) > 1:
            commands.append((2 & 7) | ((len(ring) - 1) << 3))
            for px, py in ring[1:]:
                commands += [_zigzag(px - x), _zigzag(py - y)]
                x, y = px, py
        if kind == "Polygon":
            commands.append((7 & 7) | (1 << 3))
    return commands


def encode_tile(layers: dict[str, list[Feature]], extent: int = 4096) -> bytes:
    types = {"Point": 1, "LineString": 2, "Polygon": 3}
    tile = b""
    for name, features in layers.items():
        keys: list[str] = []
        values: list[TagValue] = []
        body = _varint_field(15, 2) + _bytes_field(1, name.encode())
        for feature in features:
            tags: list[int] = []
            for key, value in feature.tags.items():
                if key not in keys:
                    keys.append(key)
                # Se compara también el tipo: en Python ``True == 1``.
                typed = [(type(v), v) for v in values]
                if (type(value), value) not in typed:
                    values.append(value)
                    typed.append((type(value), value))
                tags += [keys.index(key), typed.index((type(value), value))]
            raw = b""
            if feature.id is not None:
                raw += _varint_field(1, feature.id)
            raw += _bytes_field(2, b"".join(_varint(v) for v in tags))
            raw += _varint_field(3, types[feature.kind])
            raw += _bytes_field(
                4, b"".join(_varint(v) for v in _geometry(feature.kind, feature.parts))
            )
            body += _bytes_field(2, raw)
        for key in keys:
            body += _bytes_field(3, key.encode())
        for value in values:
            body += _bytes_field(4, _value(value))
        body += _varint_field(5, extent)
        tile += _bytes_field(3, body)
    return tile
