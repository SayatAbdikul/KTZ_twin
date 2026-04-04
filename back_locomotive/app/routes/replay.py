"""
GET /api/replay/snapshot?timestamp=<epoch_ms>

Returns the current (or nearest-to-timestamp) state snapshot for replay.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.models import make_response
from app.simulator.health import generate_health_index
from app.simulator.telemetry import generate_frame
from app.state import state

router = APIRouter(prefix="/api/replay", tags=["replay"])


@router.get("/snapshot")
def get_snapshot(timestamp: int | None = Query(default=None)):
    # For now, return current state (history replay is a Phase 4 feature)
    frame = state.current_frame or generate_frame()
    health = state.health_index or generate_health_index()
    active_alerts = [a for a in state.alerts if a.status != "resolved"]

    snapshot = {
        "telemetry": frame.model_dump(by_alias=True),
        "health": health.model_dump(by_alias=True),
        "alerts": [a.model_dump(by_alias=True, exclude_none=True) for a in active_alerts],
        "requestedTimestamp": timestamp,
    }
    return make_response(snapshot)
