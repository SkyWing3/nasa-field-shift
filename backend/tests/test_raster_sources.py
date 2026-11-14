import asyncio
from pathlib import Path

import httpx2
import pytest

from app.data_sources.raster import (
    HttpRangeSource,
    RangeCache,
    RangeNotFoundError,
    RangeSourceError,
    RangeTimeoutError,
)
from app.data_sources.raster.sources import BlockReader

URL = "https://data.example.org/tile.tif"
BODY = bytes(range(256)) * 400


def server(requests: list[httpx2.Request], status: int = 206) -> httpx2.MockTransport:
    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        start, end = (int(v) for v in request.headers["Range"].removeprefix("bytes=").split("-"))
        if status != 206:
            return httpx2.Response(status, content=BODY if status == 200 else b"")
        return httpx2.Response(206, content=BODY[start : end + 1])

    return httpx2.MockTransport(handler)


def read(source: HttpRangeSource, offset: int, length: int) -> bytes:
    async def go() -> bytes:
        return await source.read(offset, length)

    return asyncio.run(go())


def test_sends_range_and_generic_user_agent_and_caches(tmp_path: Path) -> None:
    requests: list[httpx2.Request] = []
    client = httpx2.AsyncClient(transport=server(requests))
    source = HttpRangeSource(client, URL, cache=RangeCache(tmp_path))
    assert read(source, 100, 50) == BODY[100:150]
    assert requests[0].headers["Range"] == "bytes=100-149"
    assert requests[0].headers["User-Agent"] == "farm-sim-geodata/0.1"
    # Segunda lectura: desde la caché en disco, sin petición.
    assert read(source, 100, 50) == BODY[100:150]
    assert len(requests) == 1


def test_offline_mode_only_uses_the_cache(tmp_path: Path) -> None:
    requests: list[httpx2.Request] = []
    online = HttpRangeSource(
        httpx2.AsyncClient(transport=server(requests)), URL, cache=RangeCache(tmp_path)
    )
    read(online, 0, 10)
    offline = HttpRangeSource(
        httpx2.AsyncClient(transport=server(requests)),
        URL,
        cache=RangeCache(tmp_path),
        offline=True,
    )
    assert read(offline, 0, 10) == BODY[:10]
    with pytest.raises(RangeSourceError, match="Sin conexión"):
        read(offline, 10, 10)
    assert len(requests) == 1
    with pytest.raises(ValueError):
        HttpRangeSource(httpx2.AsyncClient(), URL, offline=True)


def test_missing_file_is_remembered(tmp_path: Path) -> None:
    requests: list[httpx2.Request] = []
    source = HttpRangeSource(
        httpx2.AsyncClient(transport=server(requests, 404)), URL, cache=RangeCache(tmp_path)
    )
    with pytest.raises(RangeNotFoundError):
        read(source, 0, 10)
    with pytest.raises(RangeNotFoundError):
        read(source, 0, 10)
    assert len(requests) == 1


def test_rejects_full_downloads_and_non_https(tmp_path: Path) -> None:
    source = HttpRangeSource(httpx2.AsyncClient(transport=server([], 200)), URL)
    with pytest.raises(RangeSourceError, match="200"):
        read(source, 0, 10)
    with pytest.raises(ValueError):
        HttpRangeSource(httpx2.AsyncClient(), "http://data.example.org/tile.tif")
    with pytest.raises(RangeSourceError):
        read(source, 0, 64 * 1024 * 1024)


def test_maps_timeouts_and_connection_errors() -> None:
    def timeout(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("lento", request=request)

    def refused(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("rechazada", request=request)

    with pytest.raises(RangeTimeoutError):
        read(
            HttpRangeSource(httpx2.AsyncClient(transport=httpx2.MockTransport(timeout)), URL), 0, 1
        )
    with pytest.raises(RangeSourceError, match="conectar"):
        read(
            HttpRangeSource(httpx2.AsyncClient(transport=httpx2.MockTransport(refused)), URL), 0, 1
        )


def test_block_reader_groups_small_reads() -> None:
    requests: list[httpx2.Request] = []
    source = HttpRangeSource(httpx2.AsyncClient(transport=server(requests)), URL)
    reader = BlockReader(source, block_size=1024)

    async def go() -> list[bytes]:
        return [
            await reader.read(10, 20),
            await reader.read(500, 600),
            await reader.read(1000, 100),
        ]

    first, second, third = asyncio.run(go())
    assert first == BODY[10:30]
    assert second == BODY[500:1100]
    assert third == BODY[1000:1100]
    assert len(requests) == 2  # bloques 0 y 1
