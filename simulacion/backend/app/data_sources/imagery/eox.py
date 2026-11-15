"""Imagen Sentinel-2 cloudless 2016 de EOX (CC BY 4.0) para el color del terreno.

EOX permite usar sus mapas en aplicaciones con atribución y enlace a EOX::Maps
(https://maps.eox.at). Solo la edición 2016 es CC BY 4.0 (las de 2018 en adelante son
CC BY-NC-SA y no se usan). La resolución nativa es de 10 m; por encima del zoom 14 los mosaicos
solo se interpolan, así que se limita a ese zoom. Cada mosaico se guarda en caché en disco.
"""

import asyncio

import httpx2

from app.data_sources.datasets import DatasetInfo
from app.data_sources.raster.sources import BlobCache, fetch_blob

EOX_S2_2016_TILES = (
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"
)
MAX_ZOOM = 14

EOX_INFO = DatasetInfo(
    id="eox-s2cloudless-2016",
    name="Sentinel-2 cloudless 2016",
    provider="EOX IT Services GmbH · EOX::Maps",
    attribution=(
        "Color del terreno: Sentinel-2 cloudless 2016 por EOX IT Services GmbH (contiene datos "
        "modificados de Copernicus Sentinel 2016, CC BY 4.0)"
    ),
    citation="Sentinel-2 cloudless 2016 by EOX IT Services GmbH. https://s2maps.eu",
    license="CC BY 4.0",
    license_url="https://creativecommons.org/licenses/by/4.0/",
    source_url="https://maps.eox.at",
    resolution_m=10.0,
    vertical_datum=None,
    acquired="2016 (mosaico sin nubes)",
    notes=(
        "Imagen de 2016: cultivos, construcciones y cursos de agua pueden haber cambiado. Incluye "
        "el sombreado del relieve del momento de la toma."
    ),
)


class ImageryProvider:
    def __init__(
        self,
        client: httpx2.AsyncClient,
        cache: BlobCache | None,
        *,
        template: str = EOX_S2_2016_TILES,
        offline: bool = False,
    ) -> None:
        self._client = client
        self._cache = cache
        self._template = template
        self._offline = offline
        self._limiter = asyncio.Semaphore(4)

    async def tile(self, z: int, x: int, y: int) -> bytes | None:
        if not 0 <= z <= MAX_ZOOM or not (0 <= x < 2**z and 0 <= y < 2**z):
            raise ValueError("Mosaico fuera de rango")
        url = self._template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
        return await fetch_blob(
            self._client,
            url,
            cache=self._cache,
            offline=self._offline,
            limiter=self._limiter,
            accept_missing=True,
        )
