from __future__ import annotations

from fastapi import APIRouter

from app.models import make_response
from app.simulator.health import generate_health_index
from app.state import state


router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def get_health() -> dict:
    health = state.health_index or generate_health_index()
    return make_response(health)
