"""Punto de entrada de la API. Ejecutar con ``uvicorn app.main:app``."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app import __version__
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.data_sources.geocoding import GeocodingProvider, NominatimGeocoder, create_geocoder
from app.data_sources.world import WorldDataService, create_world_service


def create_app(
    settings: Settings | None = None,
    geocoder: GeocodingProvider | None = None,
    world: WorldDataService | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    is_dev = settings.environment == "development"
    selected_geocoder = geocoder or create_geocoder(settings)
    selected_world = world or create_world_service(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        if isinstance(selected_geocoder, NominatimGeocoder):
            await selected_geocoder.close()
        await selected_world.close()

    app = FastAPI(
        lifespan=lifespan,
        title="TerraLab 3D API",
        version=__version__,
        # La documentación interactiva solo se publica fuera de producción.
        docs_url="/api/docs" if settings.environment != "production" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.environment != "production" else None,
    )

    origins = settings.resolved_cors_origins()
    if is_dev and origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Accept", "Content-Type"],
            max_age=600,
        )

    # Las rejillas de elevación y cobertura (base64) se comprimen bien.
    app.add_middleware(GZipMiddleware, minimum_size=2048)

    app.state.geocoder = selected_geocoder
    app.state.world = selected_world
    app.dependency_overrides[get_settings] = lambda: settings
    app.include_router(api_router)
    return app


app = create_app()
