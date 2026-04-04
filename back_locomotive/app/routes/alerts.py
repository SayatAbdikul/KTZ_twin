from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response, now_ms
from app.state import state


router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    status: str | None = Query(None),
    severity: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, alias="pageSize", ge=1, le=500),
) -> dict:
    alerts = state.alerts
    if status:
        alerts = [alert for alert in alerts if alert.status == status]
    if severity:
        alerts = [alert for alert in alerts if alert.severity == severity]

    total = len(alerts)
    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=total)
    return make_response(alerts[start:end], meta=meta)


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict:
    for alert in state.alerts:
        if alert.alert_id != alert_id:
            continue
        if alert.status == "active":
            alert.status = "acknowledged"
            alert.acknowledged_at = now_ms()
            alert.acknowledged_by = "Operator"
        return make_response(alert)

    raise HTTPException(status_code=404, detail={"code": "ALERT_NOT_FOUND", "message": f"Unknown alert: {alert_id}"})
