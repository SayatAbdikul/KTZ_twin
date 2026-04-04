from __future__ import annotations

<<<<<<< Updated upstream
=======
from typing import Annotated

>>>>>>> Stashed changes
from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response, now_ms
from app.state import state

<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
<<<<<<< Updated upstream
    status: str | None = Query(None),
    severity: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, alias="pageSize", ge=1, le=500),
=======
    status: Annotated[str | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=500)] = 50,
>>>>>>> Stashed changes
) -> dict:
    alerts = state.alerts
    if status:
        alerts = [alert for alert in alerts if alert.status == status]
    if severity:
        alerts = [alert for alert in alerts if alert.severity == severity]

<<<<<<< Updated upstream
    total = len(alerts)
    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=total)
    return make_response(alerts[start:end], meta=meta)
=======
    alerts = sorted(alerts, key=lambda alert: alert.triggered_at, reverse=True)
    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=len(alerts))
    return make_response(
        [alert.model_dump(by_alias=True, exclude_none=True) for alert in alerts[start:end]],
        meta=meta,
    )
>>>>>>> Stashed changes


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict:
<<<<<<< Updated upstream
    for alert in state.alerts:
        if alert.alert_id != alert_id:
            continue
        if alert.status == "active":
            alert.status = "acknowledged"
            alert.acknowledged_at = now_ms()
            alert.acknowledged_by = "Operator"
        return make_response(alert)

    raise HTTPException(status_code=404, detail={"code": "ALERT_NOT_FOUND", "message": f"Unknown alert: {alert_id}"})
=======
    for index, alert in enumerate(state.alerts):
        if alert.alert_id != alert_id:
            continue

        if alert.status == "resolved":
            raise HTTPException(status_code=409, detail="Resolved alerts cannot be acknowledged")

        if alert.status != "acknowledged":
            state.alerts[index] = alert.model_copy(
                update={
                    "status": "acknowledged",
                    "acknowledged_at": now_ms(),
                    "acknowledged_by": "Operator",
                }
            )

        return make_response(state.alerts[index].model_dump(by_alias=True, exclude_none=True))

    raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")
>>>>>>> Stashed changes
