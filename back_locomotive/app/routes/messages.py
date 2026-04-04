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
router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
def list_messages(
<<<<<<< Updated upstream
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
=======
    read: Annotated[bool | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=500)] = 50,
) -> dict:
    messages = sorted(state.messages, key=lambda message: message.sent_at, reverse=True)
    if read is not None:
        messages = [message for message in messages if (message.read_at is not None) == read]

    start = (page - 1) * page_size
    end = start + page_size
    meta = ApiMeta(page=page, page_size=page_size, total=len(messages))
    return make_response(
        [message.model_dump(by_alias=True, exclude_none=True) for message in messages[start:end]],
        meta=meta,
    )


@router.post("/{message_id}/read")
def mark_read(message_id: str) -> dict:
    for index, message in enumerate(state.messages):
        if message.message_id != message_id:
            continue

        if message.read_at is None:
            state.messages[index] = message.model_copy(update={"read_at": now_ms()})

        return make_response(state.messages[index].model_dump(by_alias=True, exclude_none=True))

    raise HTTPException(status_code=404, detail=f"Message not found: {message_id}")
>>>>>>> Stashed changes


@router.post("/{message_id}/acknowledge")
def acknowledge_message(message_id: str) -> dict:
<<<<<<< Updated upstream
    for message in state.messages:
        if message.message_id != message_id:
            continue
        if message.acknowledged_at is None:
            message.acknowledged_at = now_ms()
        return make_response(message)

    raise HTTPException(status_code=404, detail={"code": "MESSAGE_NOT_FOUND", "message": f"Unknown message: {message_id}"})
=======
    for index, message in enumerate(state.messages):
        if message.message_id != message_id:
            continue

        timestamp = now_ms()
        state.messages[index] = message.model_copy(
            update={
                "read_at": message.read_at or timestamp,
                "acknowledged_at": message.acknowledged_at or timestamp,
            }
        )
        return make_response(state.messages[index].model_dump(by_alias=True, exclude_none=True))

    raise HTTPException(status_code=404, detail=f"Message not found: {message_id}")
>>>>>>> Stashed changes
