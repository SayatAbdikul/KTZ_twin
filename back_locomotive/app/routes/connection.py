"""
GET /api/connection/status
"""

from fastapi import APIRouter

from app.models import ConnectionState, make_response
from app.state import state

router = APIRouter(prefix="/api", tags=["connection"])


@router.get("/connection/status")
def get_connection_status():
    has_clients = len(state.ws_clients) > 0
    connection = ConnectionState(
        backend_status="connected",
        dispatcher_status="connected",
        ws_connected=has_clients,
        last_heartbeat=None,
        latency_ms=None,
        reconnect_attempt=0,
    )
    return make_response(connection.model_dump(by_alias=True))
