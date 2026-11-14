"""Configuración de la API a partir de variables de entorno (prefijo ``TERRALAB_``)."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["development", "test", "production"]
Geocoder = Literal["geonames", "nominatim", "disabled"]

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GAZETTEER_PATH = BACKEND_ROOT / "data" / "geonames" / "gazetteer.sqlite3"
DEFAULT_WORLD_DATA_DIR = BACKEND_ROOT / "data" / "world"
DEFAULT_ELEVATION_URL = "https://opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be"
DEFAULT_LANDCOVER_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"

# Servidor de desarrollo de Vite (5173) y previsualización del build (`vite preview`, 4173).
DEFAULT_DEV_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TERRALAB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    environment: Environment = "development"
    cors_origins: Annotated[tuple[str, ...], NoDecode] = ()

    # Búsqueda geográfica (ADR-028). Por defecto, nomenclátor local GeoNames: sin peticiones a
    # servicios públicos. Nominatim exige una decisión deliberada y un User-Agent propio.
    geocoder: Geocoder = "geonames"
    gazetteer_path: Path = DEFAULT_GAZETTEER_PATH
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = ""

    # Datos para generar el mundo 3D (ADR-034 a ADR-036). Se leen solo las partes necesarias de
    # los COG públicos y se guardan en ``world_data_dir``; ``world_offline`` usa solo la caché.
    world_data_dir: Path = DEFAULT_WORLD_DATA_DIR
    elevation_url: str = DEFAULT_ELEVATION_URL
    landcover_url: str = DEFAULT_LANDCOVER_URL
    world_offline: bool = False
    # Overpass en vivo para regiones sin instantánea: desactivado salvo configuración explícita
    # (las instancias públicas no deben usarse como backend de una aplicación).
    overpass_url: str = ""
    overpass_user_agent: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(origin.strip() for origin in value.split(",") if origin.strip())
        return value

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcards(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        for origin in value:
            if "*" in origin:
                raise ValueError("No se permiten comodines en TERRALAB_CORS_ORIGINS")
            if not origin.startswith(("http://", "https://")):
                raise ValueError(f"Origen CORS inválido (debe empezar por http/https): {origin}")
            if origin.endswith("/"):
                raise ValueError(f"Origen CORS inválido (sin barra final): {origin}")
        return value

    @field_validator("nominatim_url")
    @classmethod
    def _https_nominatim(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("TERRALAB_NOMINATIM_URL debe usar HTTPS")
        return value.rstrip("/")

    @field_validator("elevation_url", "landcover_url")
    @classmethod
    def _https_raster(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("Las URL de datos ráster deben usar HTTPS")
        return value.rstrip("/")

    @field_validator("overpass_url")
    @classmethod
    def _https_overpass(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith("https://"):
            raise ValueError("TERRALAB_OVERPASS_URL debe usar HTTPS")
        return value

    @model_validator(mode="after")
    def _nominatim_requires_identity(self) -> Self:
        if self.geocoder == "nominatim" and not self.nominatim_user_agent.strip():
            raise ValueError(
                "TERRALAB_GEOCODER=nominatim requiere TERRALAB_NOMINATIM_USER_AGENT con el nombre "
                "de la aplicación (política de uso de Nominatim)"
            )
        if self.overpass_url and not self.overpass_user_agent.strip():
            raise ValueError(
                "TERRALAB_OVERPASS_URL requiere TERRALAB_OVERPASS_USER_AGENT con el nombre de la "
                "aplicación y un contacto"
            )
        return self

    def resolved_cors_origins(self) -> tuple[str, ...]:
        """Orígenes CORS efectivos.

        CORS solo se habilita en ``development``: en producción el frontend y la API se
        servirán desde el mismo origen (decisión registrada en docs/DECISIONS.md).
        """
        if self.environment != "development":
            return ()
        return self.cors_origins or DEFAULT_DEV_CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    return Settings()
