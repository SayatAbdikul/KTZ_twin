from __future__ import annotations

import json
import logging
from fastapi import WebSocket

from app.models import now_ms
from app.state import state

logger = logging.getLogger(__name__)


async def broadcast_message(msg_type: str, payload: object) -> None:
    if not state.ws_clients:
        return

    envelope = {
        "type": msg_type,
        "payload": payload,
        "timestamp": now_ms(),
        "sequenceId": await state.next_sequence(),
    }
    wire = json.dumps(envelope)

    dead: list[WebSocket] = []
    for ws in list(state.ws_clients):
        try:
            await ws.send_text(wire)
        except Exception:
            dead.append(ws)

    for ws in dead:
        state.ws_clients.discard(ws)


async def send_connection_snapshot(ws: WebSocket) -> None:
    payload = {
        "locomotives": [
            {
                "locomotiveId": rt.target.locomotive_id,
                "wsUrl": rt.target.ws_url,
                "connected": rt.connected,
                "lastSeenAt": rt.last_seen_at,
                "reconnectAttempt": rt.reconnect_attempt,
            }
            for rt in state.locomotives.values()
        ]
    }
    await ws.send_text(
        json.dumps(
            {
                "type": "dispatcher.snapshot",
                "payload": payload,
                "timestamp": now_ms(),
                "sequenceId": await state.next_sequence(),
            }
        )
    )
