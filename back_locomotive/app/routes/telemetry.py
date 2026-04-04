from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config import METRIC_DEFINITIONS, METRIC_BY_ID
from app.models import MetricDefinition, MetricHistory, MetricHistoryPoint, make_response, now_ms
from app.state import state

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

_RESOLUTION_MS: dict[str, int] = {
    "raw": 1,
    "1ms": 1,
    "10ms": 10,
    "100ms": 100,
    "1s": 1000,
    "10s": 10_000,
}


def _selected_locomotive_id(requested: str | None) -> str:
    locomotive_id = requested or state.default_frontend_locomotive_id
    if not locomotive_id or locomotive_id not in state.loaded_locomotive_ids:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Locomotive not found"})
    return locomotive_id


@router.get("/current")
def get_current(locomotive_id: str | None = Query(default=None, alias="locomotiveId")):
    selected = _selected_locomotive_id(locomotive_id)
    frame = state.current_frames.get(selected)
    if frame is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "No telemetry available"})
    return make_response(frame.model_dump(by_alias=True))


@router.get("/metrics")
def get_metrics():
    definitions = [
        MetricDefinition(**metric).model_dump(by_alias=True, exclude_none=True)
        for metric in METRIC_DEFINITIONS
    ]
    return make_response(definitions)


@router.get("/history/{metric_id}")
def get_history(
    metric_id: str,
    locomotive_id: str | None = Query(default=None, alias="locomotiveId"),
    from_: int | None = Query(default=None, alias="from"),
    to: int | None = Query(default=None),
    resolution: str = Query(default="1s"),
):
    if metric_id not in METRIC_BY_ID:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Unknown metric: {metric_id}"})

    selected = _selected_locomotive_id(locomotive_id)
    buffer = list(state.history_buffer[selected].get(metric_id, []))
    interval = _RESOLUTION_MS.get(resolution, 1000)
    ts_now = now_ms()
    ts_from = from_ if from_ is not None else ts_now - 3_600_000
    ts_to = to if to is not None else ts_now

    points: list[MetricHistoryPoint] = []
    for timestamp, value in buffer:
        if timestamp < ts_from or timestamp > ts_to:
            continue
        if points and timestamp - points[-1].timestamp < interval:
            continue
        points.append(MetricHistoryPoint(timestamp=timestamp, value=value))

    history = MetricHistory(
        metric_id=metric_id,
        from_=ts_from,
        to=ts_to,
        resolution=resolution,
        points=points,
    )
    return make_response(history.model_dump(by_alias=True))
