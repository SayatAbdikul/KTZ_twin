from __future__ import annotations

from fastapi import APIRouter

from app.models import make_response
from app.simulator.health import generate_health_index
from app.state import state

<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def get_health() -> dict:
<<<<<<< Updated upstream
    health = state.health_index or generate_health_index()
    return make_response(health)
=======
    health_index = state.health_index or generate_health_index()
    return make_response(health_index.model_dump(by_alias=True))
>>>>>>> Stashed changes
