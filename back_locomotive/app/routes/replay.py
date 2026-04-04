from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.models import make_response
from app.simulator.health import generate_health_index
from app.simulator.telemetry import generate_frame
from app.state import state

router = APIRouter(prefix="/api/replay", tags=["replay"])


@router.get("/snapshot")
def get_snapshot(timestamp: Annotated[int | None, Query()] = None) -> dict:
    del timestamp

    frame = state.current_frame or generate_frame()
    health_index = state.health_index or generate_health_index()
    snapshot = {
        "telemetry": frame.model_dump(by_alias=True),
        "health": health_index.model_dump(by_alias=True),
        "alerts": [alert.model_dump(by_alias=True, exclude_none=True) for alert in state.alerts],
        "messages": [message.model_dump(by_alias=True, exclude_none=True) for message in state.messages],
    }
    return make_response(snapshot)
