from fastapi import APIRouter

from app.api import geocoding, health, world

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(geocoding.router)
api_router.include_router(world.router)
