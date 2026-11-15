"""Lectura parcial de rásteres remotos (Cloud Optimized GeoTIFF) con caché en disco."""

from app.data_sources.raster.cog import (
    BBox,
    CogReader,
    GeoRaster,
    MosaicResult,
    MosaicTile,
    read_mosaic,
)
from app.data_sources.raster.sources import (
    HttpRangeSource,
    RangeCache,
    RangeNotFoundError,
    RangeSource,
    RangeSourceError,
    RangeTimeoutError,
)
from app.data_sources.raster.tiff import TiffFormatError

__all__ = [
    "BBox",
    "CogReader",
    "GeoRaster",
    "HttpRangeSource",
    "MosaicResult",
    "MosaicTile",
    "RangeCache",
    "RangeNotFoundError",
    "RangeSource",
    "RangeSourceError",
    "RangeTimeoutError",
    "TiffFormatError",
    "read_mosaic",
]
