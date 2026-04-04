from __future__ import annotations

from fastapi import APIRouter, Query

from app.config import RECENT_TELEMETRY_MAX_MINUTES
from app.models import now_ms
from app.repository import get_recent_telemetry
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


@router.get("/{locomotive_id}/telemetry/recent")
def recent_telemetry(
    locomotive_id: str,
    minutes: int = Query(default=5, ge=1, le=RECENT_TELEMETRY_MAX_MINUTES),
    metric_id: str | None = Query(default=None, alias="metricId"),
) -> dict:
    if locomotive_id not in state.locomotives:
        return {"data": None, "error": {"code": "NOT_FOUND", "message": "Locomotive not configured"}}

    to_ts = now_ms()
    from_ts = to_ts - minutes * 60 * 1000
    by_metric = get_recent_telemetry(locomotive_id=locomotive_id, since_ts_ms=from_ts, metric_id=metric_id)

    return {
        "data": {
            "locomotiveId": locomotive_id,
            "minutes": minutes,
            "from": from_ts,
            "to": to_ts,
            "byMetric": by_metric,
        }
    }
