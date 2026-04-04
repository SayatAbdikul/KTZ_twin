from __future__ import annotations

<<<<<<< Updated upstream
from fastapi import APIRouter, HTTPException, Query

from app.config import METRIC_DEFINITIONS
from app.models import MetricDefinition, MetricHistory, MetricHistoryPoint, make_response
from app.simulator.telemetry import generate_frame
from app.state import state


=======
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.config import METRIC_DEFINITIONS
from app.models import MetricDefinition, MetricHistory, MetricHistoryPoint, make_response, now_ms
from app.simulator.telemetry import generate_frame
from app.state import state

>>>>>>> Stashed changes
router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/current")
<<<<<<< Updated upstream
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
=======
def get_current() -> dict:
    frame = state.current_frame or generate_frame()
    return make_response(frame.model_dump(by_alias=True))


@router.get("/metrics")
def get_metrics() -> dict:
    definitions = [MetricDefinition.model_validate(metric) for metric in METRIC_DEFINITIONS]
    return make_response([definition.model_dump(by_alias=True) for definition in definitions])


@router.get("/history/{metric_id}")
def get_history(
    metric_id: str,
    from_: Annotated[int | None, Query(alias="from")] = None,
    to: Annotated[int | None, Query()] = None,
    resolution: Annotated[str, Query()] = "raw",
) -> dict:
    if metric_id not in state.history_buffer:
        raise HTTPException(status_code=404, detail=f"Unknown metric: {metric_id}")

    buffer = list(state.history_buffer[metric_id])
    if not buffer:
        frame = state.current_frame or generate_frame()
        reading = next((item for item in frame.readings if item.metric_id == metric_id), None)
        if reading is None:
            raise HTTPException(status_code=404, detail=f"No data for metric: {metric_id}")
        buffer = [(reading.timestamp, reading.value)]

    default_from = buffer[0][0]
    default_to = buffer[-1][0]
    lower_bound = from_ if from_ is not None else default_from
    upper_bound = to if to is not None else default_to

    if lower_bound > upper_bound:
        raise HTTPException(status_code=400, detail="'from' must be less than or equal to 'to'")

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
>>>>>>> Stashed changes
