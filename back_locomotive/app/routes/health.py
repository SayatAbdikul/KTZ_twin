from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import HealthIndex, SubsystemHealth, make_response
from app.state import state

router = APIRouter(prefix="/api", tags=["health"])


def _selected_locomotive_id(requested: str | None) -> str:
    locomotive_id = requested or state.default_frontend_locomotive_id
    if not locomotive_id or locomotive_id not in state.loaded_locomotive_ids:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Locomotive not found"})
    return locomotive_id


def _score_to_status(score: float) -> str:
    if score >= 85:
        return "normal"
    if score >= 70:
        return "degraded"
    if score >= 50:
        return "warning"
    return "critical"


@router.get("/health")
def get_health(locomotive_id: str | None = Query(default=None, alias="locomotiveId")):
    selected = _selected_locomotive_id(locomotive_id)
    row = state.latest_rows.get(selected)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "No telemetry available"})

    electrical = 100.0
    thermal = 100.0
    braking = 100.0
    fuel = 100.0

    if row.get("fault_code"):
        electrical -= 15.0
        thermal -= 10.0

    traction_current = float(row.get("traction_current_a") or 0.0)
    if traction_current > 900:
        electrical -= 15.0
    if traction_current > 1050:
        electrical -= 20.0

    if (row.get("traction_motor_temp_c") or 0.0) > 105:
        thermal -= 20.0
    if (row.get("bearing_temp_c") or 0.0) > 85:
        thermal -= 20.0
    if (row.get("transformer_temp_c") or 0.0) > 120:
        thermal -= 20.0
    if (row.get("coolant_temp_c") or 0.0) > 95:
        thermal -= 20.0

    if (row.get("brake_pipe_pressure_bar") or 0.0) < 4.3:
        braking -= 20.0
    if (row.get("brake_pipe_pressure_bar") or 0.0) < 3.8:
        braking -= 20.0

    fuel_level_l = row.get("fuel_level_l")
    if fuel_level_l is not None:
        if fuel_level_l < 1200:
            fuel -= 20.0
        if fuel_level_l < 600:
            fuel -= 20.0

    timestamp = row["timestamp_ms"]
    subsystems = [
        SubsystemHealth(
            subsystem_id="electrical",
            label="Electrical",
            health_score=max(0.0, electrical),
            status=_score_to_status(max(0.0, electrical)),
            active_alert_count=1 if row.get("fault_code") else 0,
            last_updated=timestamp,
        ),
        SubsystemHealth(
            subsystem_id="thermal",
            label="Thermal",
            health_score=max(0.0, thermal),
            status=_score_to_status(max(0.0, thermal)),
            active_alert_count=1 if row.get("fault_code") else 0,
            last_updated=timestamp,
        ),
        SubsystemHealth(
            subsystem_id="braking",
            label="Braking",
            health_score=max(0.0, braking),
            status=_score_to_status(max(0.0, braking)),
            active_alert_count=0,
            last_updated=timestamp,
        ),
        SubsystemHealth(
            subsystem_id="fuel",
            label="Fuel",
            health_score=max(0.0, fuel),
            status=_score_to_status(max(0.0, fuel)),
            active_alert_count=0,
            last_updated=timestamp,
        ),
    ]
    overall = round(sum(item.health_score for item in subsystems) / len(subsystems), 1)
    health = HealthIndex(overall=overall, timestamp=timestamp, subsystems=subsystems)
    return make_response(health.model_dump(by_alias=True))
