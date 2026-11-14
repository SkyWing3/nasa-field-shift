"""TerraLab 3D — API de simulación agrícola."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("terralab-api")
except PackageNotFoundError:  # pragma: no cover - solo si se ejecuta sin instalar el paquete
    __version__ = "0.0.0+local"
