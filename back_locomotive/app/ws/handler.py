from __future__ import annotations

import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.models import now_ms
from app.state import state

logger = logging.getLogger(__name__)


def _default_subscription() -> str | None:
    return state.default_frontend_locomotive_id


async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    state.ws_clients[websocket] = _default_subscription()
    logger.info("WS client connected. Total: %d", len(state.ws_clients))

    await websocket.send_text(
        json.dumps(
            {
                "type": "connection.status",
                "payload": {
                    "dispatcherStatus": "connected",
                    "locomotiveId": state.ws_clients.get(websocket),
                    "availableLocomotiveIds": state.subscribed_locomotive_ids(),
                },
                "timestamp": now_ms(),
                "sequenceId": await state.next_sequence(),
            }
        )
    )

    subscribed_locomotive_id = state.ws_clients.get(websocket)
    if subscribed_locomotive_id:
        frame = state.current_frames.get(subscribed_locomotive_id)
        if frame is not None:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "telemetry.frame",
                        "payload": frame.model_dump(by_alias=True),
                        "timestamp": now_ms(),
                        "sequenceId": await state.next_sequence(),
                    }
                )
            )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if message.get("type") != "subscribe":
                continue

            payload = message.get("payload", {})
            locomotive_id = payload.get("locomotiveId") or payload.get("locomotive_id") or _default_subscription()
            if locomotive_id == "all":
                locomotive_id = "*"
            state.ws_clients[websocket] = locomotive_id

            if locomotive_id and locomotive_id != "*":
                frame = state.current_frames.get(locomotive_id)
                if frame is not None:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "telemetry.frame",
                                "payload": frame.model_dump(by_alias=True),
                                "timestamp": now_ms(),
                                "sequenceId": await state.next_sequence(),
                            }
                        )
                    )

    except WebSocketDisconnect:
        pass
    finally:
        state.ws_clients.pop(websocket, None)
        logger.info("WS client disconnected. Total: %d", len(state.ws_clients))
