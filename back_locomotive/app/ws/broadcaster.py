from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import HEARTBEAT_INTERVAL_S
from app.models import now_ms
from app.state import state


async def broadcast_message(msg_type: str, payload: object, locomotive_id: str | None = None) -> None:
    if not state.ws_clients:
        return

    wire = json.dumps(
        {
            "type": msg_type,
            "payload": payload,
            "timestamp": now_ms(),
            "sequenceId": await state.next_sequence(),
        }
    )

    dead = []
    for ws, subscribed_locomotive_id in list(state.ws_clients.items()):
        if locomotive_id and subscribed_locomotive_id not in {None, locomotive_id, "*"}:
            continue
        try:
            await ws.send_text(wire)
        except Exception:
            dead.append(ws)

    for ws in dead:
        state.ws_clients.pop(ws, None)


async def task_broadcast_heartbeat() -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_S)
        state.last_heartbeat_at = now_ms()
        await broadcast_message("connection.heartbeat", {"serverTime": state.last_heartbeat_at})
