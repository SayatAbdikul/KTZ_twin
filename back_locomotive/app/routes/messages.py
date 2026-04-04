from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
def list_messages(
    read: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
):
    meta = ApiMeta(page=page, page_size=page_size, total=0)
    return make_response([], meta=meta)


@router.post("/{message_id}/read")
def mark_read(message_id: str):
    raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Message not found: {message_id}"})


@router.post("/{message_id}/acknowledge")
def acknowledge_message(message_id: str):
    raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Message not found: {message_id}"})
