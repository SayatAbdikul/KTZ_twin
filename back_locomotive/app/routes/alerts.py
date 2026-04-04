from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
):
    meta = ApiMeta(page=page, page_size=page_size, total=0)
    return make_response([], meta=meta)


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Alert not found: {alert_id}"})
