"""Acceso por rangos de bytes a archivos remotos, con caché en disco.

Los COG se leen por partes: solo se piden la cabecera y los mosaicos que cubren el área
solicitada. Cada rango descargado se guarda en disco, de modo que la región demostrativa
funciona sin red una vez preparada (``make worlddata``) y no se repiten peticiones a los
servidores públicos.
"""

import asyncio
import hashlib
import os
import tempfile
from pathlib import Path
from typing import Protocol

import httpx2

DEFAULT_USER_AGENT = "farm-sim-geodata/0.1"
MAX_RANGE_BYTES = 32 * 1024 * 1024


class RangeSourceError(Exception):
    """Error al leer un rango de un archivo remoto."""


class RangeNotFoundError(RangeSourceError):
    """El archivo no existe en el servidor (p. ej. tesela de océano sin datos)."""


class RangeTimeoutError(RangeSourceError):
    """El servidor no respondió a tiempo."""


class RangeSource(Protocol):
    @property
    def url(self) -> str: ...

    async def read(self, offset: int, length: int) -> bytes: ...


class RangeCache:
    """Caché en disco de rangos de bytes, indexada por URL, desplazamiento y longitud."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, url: str, offset: int, length: int) -> Path:
        digest = hashlib.sha256(f"{url}|{offset}|{length}".encode()).hexdigest()
        return self.directory / digest[:2] / digest

    def get(self, url: str, offset: int, length: int) -> bytes | None:
        path = self._path(url, offset, length)
        try:
            data = path.read_bytes()
        except FileNotFoundError:
            return None
        # Puede ser más corto que ``length`` si el rango llegaba al final del archivo.
        return data if 0 < len(data) <= length else None

    def put(self, url: str, offset: int, length: int, data: bytes) -> None:
        path = self._path(url, offset, length)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Escritura atómica: nunca queda un archivo a medias en la caché.
        handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
        try:
            with os.fdopen(handle, "wb") as file:
                file.write(data)
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise

    def missing_marker(self, url: str) -> Path:
        digest = hashlib.sha256(f"missing|{url}".encode()).hexdigest()
        return self.directory / "missing" / digest


class HttpRangeSource:
    """Lee rangos con peticiones HTTP ``Range``; exige respuestas 206 (sin descargas completas)."""

    def __init__(
        self,
        client: httpx2.AsyncClient,
        url: str,
        *,
        cache: RangeCache | None = None,
        user_agent: str = DEFAULT_USER_AGENT,
        limiter: asyncio.Semaphore | None = None,
        offline: bool = False,
    ) -> None:
        if not url.startswith("https://"):
            raise ValueError("Solo se admiten URL HTTPS")
        if offline and cache is None:
            raise ValueError("El modo sin conexión necesita una caché")
        self._client = client
        self._url = url
        self._cache = cache
        self._user_agent = user_agent
        self._limiter = limiter or asyncio.Semaphore(4)
        self._offline = offline

    @property
    def url(self) -> str:
        return self._url

    async def read(self, offset: int, length: int) -> bytes:
        if offset < 0 or length <= 0 or length > MAX_RANGE_BYTES:
            raise RangeSourceError(f"Rango no válido: {offset}+{length}")
        if self._cache is not None:
            if self._cache.missing_marker(self._url).exists():
                raise RangeNotFoundError(self._url)
            cached = self._cache.get(self._url, offset, length)
            if cached is not None:
                return cached
        if self._offline:
            raise RangeSourceError(f"Sin conexión y sin datos en caché: {self._url}")
        headers = {"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": self._user_agent}
        try:
            async with self._limiter:
                response = await self._client.get(self._url, headers=headers)
        except httpx2.TimeoutException as error:
            raise RangeTimeoutError(f"Tiempo de espera agotado: {self._url}") from error
        except httpx2.RequestError as error:
            raise RangeSourceError(f"No se pudo conectar: {self._url}") from error
        if response.status_code == 404:
            if self._cache is not None:
                marker = self._cache.missing_marker(self._url)
                marker.parent.mkdir(parents=True, exist_ok=True)
                marker.write_text(self._url)
            raise RangeNotFoundError(self._url)
        if response.status_code != 206:
            raise RangeSourceError(
                f"Respuesta {response.status_code} a una petición parcial: {self._url}"
            )
        data = response.content[:length]
        if not data:
            raise RangeSourceError(f"Respuesta vacía a una petición parcial: {self._url}")
        # Un rango que sobrepasa el final del archivo devuelve solo los bytes disponibles.
        if self._cache is not None:
            self._cache.put(self._url, offset, length, data)
        return data


class BlockReader:
    """Agrupa lecturas pequeñas de la cabecera en bloques alineados para reducir peticiones."""

    def __init__(self, source: RangeSource, block_size: int = 64 * 1024) -> None:
        self._source = source
        self._block_size = block_size
        self._blocks: dict[int, bytes] = {}

    async def read(self, offset: int, length: int) -> bytes:
        first = offset // self._block_size
        last = (offset + length - 1) // self._block_size
        parts: list[bytes] = []
        for index in range(first, last + 1):
            block = self._blocks.get(index)
            if block is None:
                block = await self._source.read(index * self._block_size, self._block_size)
                self._blocks[index] = block
            parts.append(block)
        joined = b"".join(parts)
        start = offset - first * self._block_size
        result = joined[start : start + length]
        if len(result) < length:
            raise RangeSourceError("Lectura más allá del final del archivo")
        return result
