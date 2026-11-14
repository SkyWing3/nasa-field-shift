from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.data_sources.geocoding import (
    GeocodingProvider,
    GeocodingTimeoutError,
    GeocodingUnavailableError,
    GeocodingUpstreamError,
)
from app.schemas.geocoding import GeocodingInfo, GeocodingResults, PlaceResult

router = APIRouter(prefix="/geocoding", tags=["búsqueda geográfica"])


def get_geocoder(request: Request) -> GeocodingProvider:
    return cast(GeocodingProvider, request.app.state.geocoder)


Geocoder = Annotated[GeocodingProvider, Depends(get_geocoder)]


@router.get("/info", summary="Proveedor de búsqueda y su atribución")
def read_info(geocoder: Geocoder) -> GeocodingInfo:
    return GeocodingInfo(
        provider=geocoder.name,
        attribution=geocoder.attribution,
        attribution_url=geocoder.attribution_url,
        available=geocoder.is_available(),
    )


@router.get(
    "/search",
    summary="Busca lugares por nombre",
    responses={
        503: {"description": "Búsqueda no disponible (sin nomenclátor o desactivada)"},
        502: {"description": "El servicio externo respondió con un error"},
        504: {"description": "El servicio externo no respondió a tiempo"},
    },
)
async def search_places(
    geocoder: Geocoder,
    q: Annotated[str, Query(min_length=2, max_length=120, description="Texto a buscar")],
    limit: Annotated[int, Query(ge=1, le=10)] = 6,
) -> GeocodingResults:
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "La búsqueda es demasiado corta")
    try:
        places = await geocoder.search(query, limit)
    except GeocodingUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    except GeocodingTimeoutError as error:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, str(error)) from error
    except GeocodingUpstreamError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error
    return GeocodingResults(
        provider=geocoder.name,
        attribution=geocoder.attribution,
        attribution_url=geocoder.attribution_url,
        query=query,
        results=[
            PlaceResult(
                id=place.id,
                name=place.name,
                region=place.region,
                country_code=place.country_code,
                latitude=place.latitude,
                longitude=place.longitude,
                kind=place.kind,
                population=place.population,
            )
            for place in places
        ],
    )
