from __future__ import annotations

from fastapi import APIRouter

from app.models import ConnectionState, make_response
from app.state import state

router = APIRouter(prefix="/api/connection", tags=["connection"])


@router.get("/status")
def get_connection_status() -> dict:
    latest_timestamp = state.current_frame.timestamp if state.current_frame else None
    payload = ConnectionState(
        backend_status="connected",
        dispatcher_status="connected",
        ws_connected=bool(state.ws_clients),
        last_heartbeat=latest_timestamp,
        latency_ms=0 if latest_timestamp is not None else None,
        reconnect_attempt=0,
    )
    return make_response(payload.model_dump(by_alias=True, exclude_none=True))
