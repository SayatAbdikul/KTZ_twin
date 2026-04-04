from __future__ import annotations

from fastapi import APIRouter

from app.state import state

router = APIRouter(prefix="/api/locomotives", tags=["locomotives"])


@router.get("")
def list_locomotives() -> dict:
    return {
        "data": [
            {
                "locomotiveId": rt.target.locomotive_id,
                "wsUrl": rt.target.ws_url,
                "connected": rt.connected,
                "lastSeenAt": rt.last_seen_at,
                "reconnectAttempt": rt.reconnect_attempt,
                "hasTelemetry": rt.latest_telemetry is not None,
            }
            for rt in state.locomotives.values()
        ]
    }


@router.get("/{locomotive_id}/latest-telemetry")
def latest_telemetry(locomotive_id: str) -> dict:
    rt = state.locomotives.get(locomotive_id)
    if not rt:
        return {"data": None, "error": {"code": "NOT_FOUND", "message": "Locomotive not configured"}}
    return {"data": rt.latest_telemetry}


@router.get("/{locomotive_id}/chat")
def get_chat(locomotive_id: str) -> dict:
    return {"data": state.chat_history.get(locomotive_id, [])}
