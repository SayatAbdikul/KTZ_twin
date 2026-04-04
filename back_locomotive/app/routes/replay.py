from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import make_response
from app.state import state

router = APIRouter(prefix="/api/replay", tags=["replay"])


@router.get("/snapshot")
def get_snapshot(locomotive_id: str | None = Query(default=None, alias="locomotiveId")):
    selected = locomotive_id or state.default_frontend_locomotive_id
    if not selected or selected not in state.loaded_locomotive_ids:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Locomotive not found"})

    frame = state.current_frames.get(selected)
    raw = state.latest_rows.get(selected)
    if frame is None or raw is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "No replay snapshot available"})

    return make_response(
        {
            "locomotiveId": selected,
            "telemetry": frame.model_dump(by_alias=True),
            "rawTelemetry": {key: value for key, value in raw.items() if key != "timestamp_ms"},
        }
    )
