from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response, now_ms
from app.state import state

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    status: Annotated[str | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=500)] = 50,
) -> dict:
    alerts = state.alerts
    if status:
        alerts = [alert for alert in alerts if alert.status == status]
    if severity:
        alerts = [alert for alert in alerts if alert.severity == severity]

    alerts = sorted(alerts, key=lambda alert: alert.triggered_at, reverse=True)
    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=len(alerts))
    return make_response(
        [alert.model_dump(by_alias=True, exclude_none=True) for alert in alerts[start:end]],
        meta=meta,
    )


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict:
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
