from __future__ import annotations

from fastapi import APIRouter

from app.db import db_ping
from app.state import state

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def service_health() -> dict:
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
