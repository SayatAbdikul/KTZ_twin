from __future__ import annotations

from fastapi import APIRouter, Request

from app.auth import get_request_auth, require_dispatcher_access
from app.db import db_ping
from app.state import state

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def service_health(request: Request) -> dict:
    require_dispatcher_access(get_request_auth(request))
    connected = sum(1 for r in state.locomotives.values() if r.connected)
    total = len(state.locomotives)
    database_ok = db_ping()
    return {
        "status": "ok" if database_ok else "degraded",
        "locomotivesConnected": connected,
        "locomotivesTotal": total,
        "dispatcherClients": len(state.ws_clients),
        "database": "connected" if database_ok else "disconnected",
        "runtimeStats": state.stats_snapshot(),
    }
