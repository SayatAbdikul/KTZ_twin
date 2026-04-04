"""
WebSocket endpoint at /ws.

Accepts all clients, adds them to state.ws_clients, sends an immediate
connection.status message, then listens for subscribe/heartbeat-ack messages.
"""

from __future__ import annotations

import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.config import LOCOMOTIVE_ID
from app.models import make_event_envelope, now_ms
from app.state import state
from app.ws.broadcaster import broadcast_message

logger = logging.getLogger(__name__)


async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    state.ws_clients.add(websocket)
    logger.info("WS client connected. Total: %d", len(state.ws_clients))

    # Immediately inform new client that dispatcher is connected
    import json as _json
    await websocket.send_text(
        _json.dumps(
            {
                "type": "connection.status",
                "payload": {"dispatcherStatus": "connected"},
                "timestamp": now_ms(),
                "sequenceId": state.next_sequence(),
                "event": make_event_envelope(
                    event_type="connection.status",
                    source="back_locomotive",
                    locomotive_id=LOCOMOTIVE_ID,
                ).model_dump(),
            }
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "subscribe":
                    # Channels accepted, all clients receive everything (no filtering)
                    pass
                elif msg_type == "heartbeat.ack":
                    pass
                # Ignore unknown message types silently

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS client error: %s", exc)
    finally:
        state.ws_clients.discard(websocket)
        logger.info("WS client disconnected. Total: %d", len(state.ws_clients))
