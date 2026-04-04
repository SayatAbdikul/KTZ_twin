"""
GET /api/telemetry/current
GET /api/telemetry/metrics
GET /api/telemetry/history/{metric_id}
"""

from __future__ import annotations

import math
import random

from fastapi import APIRouter, HTTPException, Query

from app.config import METRIC_DEFINITIONS, METRIC_BY_ID
from app.models import (
    MetricDefinition,
    MetricHistory,
    MetricHistoryPoint,
    make_response,
    now_ms,
)
from app.simulator.telemetry import generate_frame
from app.state import state

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Resolution string → interval in milliseconds
_RESOLUTION_MS: dict[str, int] = {
    "raw": 1000,
    "1s":  1000,
    "10s": 10_000,
    "1m":  60_000,
    "5m":  300_000,
}


@router.get("/current")
def get_current():
    frame = state.current_frame or generate_frame()
    return make_response(frame.model_dump(by_alias=True))


@router.get("/metrics")
def get_metrics():
    defs = [MetricDefinition(**m).model_dump(by_alias=True, exclude_none=True)
            for m in METRIC_DEFINITIONS]
    return make_response(defs)


@router.get("/history/{metric_id}")
def get_history(
    metric_id: str,
    from_: int = Query(alias="from", default=None),
    to: int = Query(default=None),
    resolution: str = Query(default="10s"),
):
    if metric_id not in METRIC_BY_ID:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Unknown metric: {metric_id}"})

    ts_now = now_ms()
    ts_from = from_ if from_ is not None else ts_now - 3_600_000
    ts_to = to if to is not None else ts_now
    interval = _RESOLUTION_MS.get(resolution, 10_000)

    # Pull what we have from the ring buffer
    buffer = list(state.history_buffer.get(metric_id, []))
    buffer_lookup = {ts: v for ts, v in buffer}

    metric = METRIC_BY_ID[metric_id]
    mid = (metric["min"] + metric["max"]) / 2.0
    amplitude = (metric["max"] - metric["min"]) * 0.1
    span = max(ts_to - ts_from, 1)

    points: list[MetricHistoryPoint] = []
    t = ts_from
    while t <= ts_to:
        if t in buffer_lookup:
            value = buffer_lookup[t]
        else:
            # Synthetic fill: sine wave + noise (matching MSW generateMetricHistory)
            phase = (t - ts_from) / span
            sine = math.sin(phase * math.pi * 6)
            noise = (random.random() - 0.5) * amplitude * 0.2
            value = mid + sine * amplitude * 0.5 + noise
        points.append(MetricHistoryPoint(timestamp=t, value=value))
        t += interval

    history = MetricHistory(
        metric_id=metric_id,
        from_=ts_from,
        to=ts_to,
        resolution=resolution,
        points=points,
    )
    return make_response(history.model_dump(by_alias=True))
