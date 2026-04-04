from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import ApiMeta, make_response, now_ms
from app.state import state


router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
def list_messages(
    read: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, alias="pageSize", ge=1, le=500),
) -> dict:
    messages = state.messages
    if read is not None:
        messages = [message for message in messages if (message.read_at is not None) is read]

    total = len(messages)
    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=total)
    return make_response(messages[start:end], meta=meta)


@router.post("/{message_id}/read")
def mark_message_read(message_id: str) -> dict:
    for message in state.messages:
        if message.message_id != message_id:
            continue
        if message.read_at is None:
            message.read_at = now_ms()
        return make_response(message)

    raise HTTPException(status_code=404, detail={"code": "MESSAGE_NOT_FOUND", "message": f"Unknown message: {message_id}"})


@router.post("/{message_id}/acknowledge")
def acknowledge_message(message_id: str) -> dict:
    for message in state.messages:
        if message.message_id != message_id:
            continue
        if message.acknowledged_at is None:
            message.acknowledged_at = now_ms()
        return make_response(message)

    raise HTTPException(status_code=404, detail={"code": "MESSAGE_NOT_FOUND", "message": f"Unknown message: {message_id}"})
