from __future__ import annotations

from fastapi import APIRouter

from app.state import state

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def service_health() -> dict:
    connected = sum(1 for r in state.locomotives.values() if r.connected)
    total = len(state.locomotives)
    return {
        "status": "ok",
        "locomotivesConnected": connected,
        "locomotivesTotal": total,
        "dispatcherClients": len(state.ws_clients),
    }
