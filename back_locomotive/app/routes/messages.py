"""
GET  /api/messages
POST /api/messages/{message_id}/read
POST /api/messages/{message_id}/acknowledge
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response, now_ms
from app.state import state

router = APIRouter(prefix="/api/messages", tags=["messages"])


def _find_message(message_id: str):
    msg = next((m for m in state.messages if m.message_id == message_id), None)
    if msg is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Message not found"},
        )
    return msg


@router.get("")
def list_messages(
    read: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
):
    filtered = state.messages

    if read is True:
        filtered = [m for m in filtered if m.read_at is not None]
    elif read is False:
        filtered = [m for m in filtered if m.read_at is None]

    total = len(filtered)
    start = (page - 1) * page_size
    paginated = filtered[start : start + page_size]

    meta = ApiMeta(page=page, page_size=page_size, total=total)
    return make_response(
        [m.model_dump(by_alias=True, exclude_none=True) for m in paginated],
        meta=meta,
    )


@router.post("/{message_id}/read")
def mark_read(message_id: str):
    msg = _find_message(message_id)
    if msg.read_at is None:
        msg.read_at = now_ms()
    return make_response(msg.model_dump(by_alias=True, exclude_none=True))


@router.post("/{message_id}/acknowledge")
def acknowledge_message(message_id: str):
    msg = _find_message(message_id)
    ts = now_ms()
    if msg.read_at is None:
        msg.read_at = ts
    msg.acknowledged_at = ts
    return make_response(msg.model_dump(by_alias=True, exclude_none=True))
