from __future__ import annotations

from fastapi import APIRouter

from app.models import ConnectionState, make_response, now_ms


router = APIRouter(prefix="/api/connection", tags=["connection"])


@router.get("")
def get_connection_state() -> dict:
    state = ConnectionState(
        backend_status="connected",
        dispatcher_status="connected",
        ws_connected=True,
        last_heartbeat=now_ms(),
        latency_ms=0,
        reconnect_attempt=0,
    )
    return make_response(state)
