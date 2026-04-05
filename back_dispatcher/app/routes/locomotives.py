from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

from app.auth import get_request_auth, require_locomotive_access
from app.config import RECENT_TELEMETRY_MAX_MINUTES
from app.locomotive_registry import build_locomotive_summaries
from app.models import now_ms
from app.repository import (
    get_recent_telemetry,
    get_replay_range,
    get_replay_snapshot,
    get_replay_time_range,
)
from app.state import state

router = APIRouter(prefix="/api/locomotives", tags=["locomotives"])


def _parse_metric_ids(raw: str | None) -> list[str] | None:
    if raw is None:
        return None

    metric_ids = [token.strip() for token in raw.split(",") if token.strip()]
    return metric_ids or None


@router.get("")
def list_locomotives(request: Request) -> dict:
    auth = get_request_auth(request)
    return {"data": build_locomotive_summaries(auth)}


@router.get("/{locomotive_id}/latest-telemetry")
def latest_telemetry(locomotive_id: str, request: Request) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    rt = state.locomotives.get(locomotive_id)
    if not rt:
        return {"data": None, "error": {"code": "NOT_FOUND", "message": "Локомотив не настроен"}}
    return {"data": rt.latest_telemetry}


@router.get("/{locomotive_id}/chat")
def get_chat(locomotive_id: str, request: Request) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    return {"data": state.chat_history.get(locomotive_id, [])}


@router.get("/{locomotive_id}/telemetry/recent")
def recent_telemetry(
    locomotive_id: str,
    request: Request,
    minutes: int = Query(default=5, ge=1, le=RECENT_TELEMETRY_MAX_MINUTES),
    metric_id: str | None = Query(default=None, alias="metricId"),
) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    if locomotive_id not in state.locomotives:
        return {"data": None, "error": {"code": "NOT_FOUND", "message": "Локомотив не настроен"}}

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


@router.get("/{locomotive_id}/replay/time-range")
def replay_time_range(locomotive_id: str, request: Request) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    earliest, latest = get_replay_time_range(locomotive_id)
    return {
        "data": {
            "locomotiveId": locomotive_id,
            "earliest": earliest,
            "latest": latest,
        },
        "timestamp": now_ms(),
    }


@router.get("/{locomotive_id}/replay/range")
def replay_range(
    locomotive_id: str,
    request: Request,
    from_ts: int = Query(..., alias="from"),
    to_ts: int = Query(..., alias="to"),
    metric_ids: str | None = Query(default=None, alias="metricIds"),
    resolution: Literal["raw", "1s", "10s", "1m", "5m"] = Query(default="raw"),
) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    normalized_from = min(from_ts, to_ts)
    normalized_to = max(from_ts, to_ts)
    selected_metrics = _parse_metric_ids(metric_ids)
    by_metric = get_replay_range(
        locomotive_id=locomotive_id,
        from_ts_ms=normalized_from,
        to_ts_ms=normalized_to,
        metric_ids=selected_metrics,
        resolution=resolution,
    )

    return {
        "data": {
            "locomotiveId": locomotive_id,
            "from": normalized_from,
            "to": normalized_to,
            "resolution": resolution,
            "byMetric": by_metric,
        },
        "timestamp": now_ms(),
    }


@router.get("/{locomotive_id}/replay/snapshot")
def replay_snapshot(
    locomotive_id: str,
    request: Request,
    timestamp: int = Query(..., ge=0),
) -> dict:
    require_locomotive_access(get_request_auth(request), locomotive_id)
    return {
        "data": get_replay_snapshot(
            locomotive_id=locomotive_id,
            timestamp_ms=timestamp,
        ),
        "timestamp": now_ms(),
    }
