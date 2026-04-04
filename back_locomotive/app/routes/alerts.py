"""
GET  /api/alerts
POST /api/alerts/{alert_id}/acknowledge
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import Alert, ApiMeta, make_response, now_ms
from app.state import state

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
):
    filtered = state.alerts

    if status:
        filtered = [a for a in filtered if a.status == status]
    if severity:
        filtered = [a for a in filtered if a.severity == severity]

    total = len(filtered)
    start = (page - 1) * page_size
    paginated = filtered[start : start + page_size]

    meta = ApiMeta(page=page, page_size=page_size, total=total)
    return make_response(
        [a.model_dump(by_alias=True, exclude_none=True) for a in paginated],
        meta=meta,
    )


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    alert = next((a for a in state.alerts if a.alert_id == alert_id), None)
    if alert is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Alert not found"},
        )

    if alert.status == "resolved":
        raise HTTPException(
            status_code=400,
            detail={"code": "ALREADY_RESOLVED", "message": "Alert is already resolved"},
        )

    alert.status = "acknowledged"
    alert.acknowledged_at = now_ms()
    alert.acknowledged_by = "Operator"

    # Broadcast alert.update to all WS clients
    from app.ws.broadcaster import broadcast_message
    await broadcast_message("alert.update", alert.model_dump(by_alias=True, exclude_none=True))

    return make_response(alert.model_dump(by_alias=True, exclude_none=True))
