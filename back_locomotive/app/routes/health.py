"""
GET /api/health
"""

from fastapi import APIRouter

from app.models import make_response
from app.simulator.health import generate_health_index
from app.state import state

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def get_health():
    health = state.health_index or generate_health_index()
    return make_response(health.model_dump(by_alias=True))
