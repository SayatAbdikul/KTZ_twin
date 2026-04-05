from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.models import MetricDefinition, MetricHistory, MetricHistoryPoint, make_response
from app.simulator.telemetry import generate_frame
from app.state import state
from app.thresholds import get_effective_metric_definitions

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/current")
def get_current() -> dict:
    frame = state.current_frame or generate_frame()
    return make_response(frame.model_dump(by_alias=True))


@router.get("/metrics")
def get_metrics() -> dict:
    definitions = [MetricDefinition.model_validate(metric) for metric in get_effective_metric_definitions()]
    return make_response([definition.model_dump(by_alias=True, exclude_none=True) for definition in definitions])


@router.get("/history/{metric_id}")
def get_history(
    metric_id: str,
    from_: Annotated[int | None, Query(alias="from")] = None,
    to: Annotated[int | None, Query()] = None,
    resolution: Annotated[str, Query()] = "raw",
) -> dict:
    if metric_id not in state.history_buffer:
        raise HTTPException(status_code=404, detail=f"Неизвестная метрика: {metric_id}")

    buffer = list(state.history_buffer[metric_id])
    if not buffer:
        frame = state.current_frame or generate_frame()
        reading = next((item for item in frame.readings if item.metric_id == metric_id), None)
        if reading is None:
            raise HTTPException(status_code=404, detail=f"Нет данных по метрике: {metric_id}")
        buffer = [(reading.timestamp, reading.value)]

    lower_bound = from_ if from_ is not None else buffer[0][0]
    upper_bound = to if to is not None else buffer[-1][0]

    if lower_bound > upper_bound:
        raise HTTPException(status_code=400, detail="'from' должен быть меньше или равен 'to'")

    points = [
        MetricHistoryPoint(timestamp=timestamp, value=value)
        for timestamp, value in buffer
        if lower_bound <= timestamp <= upper_bound
    ]

    history = MetricHistory(
        metric_id=metric_id,
        from_=lower_bound,
        to=upper_bound,
        resolution=resolution,
        points=points,
    )
    return make_response(history.model_dump(by_alias=True))
