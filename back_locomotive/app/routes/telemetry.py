from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config import METRIC_DEFINITIONS
from app.models import MetricDefinition, MetricHistory, MetricHistoryPoint, make_response
from app.simulator.telemetry import generate_frame
from app.state import state


router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/current")
def get_current_telemetry() -> dict:
    frame = state.current_frame or generate_frame()
    return make_response(frame)


@router.get("/metrics")
def get_metric_definitions() -> dict:
    metrics = [MetricDefinition(**metric) for metric in METRIC_DEFINITIONS]
    return make_response(metrics)


@router.get("/history/{metric_id}")
def get_metric_history(
    metric_id: str,
    from_: int = Query(..., alias="from"),
    to: int = Query(...),
    resolution: str = Query("1s"),
) -> dict:
    if metric_id not in state.history_buffer:
        raise HTTPException(
            status_code=404,
            detail={"code": "METRIC_NOT_FOUND", "message": f"Unknown metric: {metric_id}"},
        )

    points = [
        MetricHistoryPoint(timestamp=timestamp, value=value)
        for timestamp, value in state.history_buffer[metric_id]
        if from_ <= timestamp <= to
    ]
    history = MetricHistory(
        metric_id=metric_id,
        from_=from_,
        to=to,
        resolution=resolution,
        points=points,
    )
    return make_response(history)
