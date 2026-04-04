from __future__ import annotations

import json
import logging
from fastapi import WebSocket

from app.models import now_ms
from app.state import state

logger = logging.getLogger(__name__)


async def _send_envelope(ws: WebSocket, msg_type: str, payload: object) -> None:
    await ws.send_text(
        json.dumps(
            {
                "type": msg_type,
                "payload": payload,
                "timestamp": now_ms(),
                "sequenceId": await state.next_sequence(),
            }
        )
    )


async def broadcast_message(msg_type: str, payload: object, locomotive_id: str | None = None) -> None:
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
        subscription = state.ws_subscriptions.get(ws)
        if locomotive_id and subscription not in (None, "*", locomotive_id):
            continue
        try:
            await ws.send_text(wire)
        except Exception:
            dead.append(ws)

    for ws in dead:
        state.ws_clients.discard(ws)
        state.ws_subscriptions.pop(ws, None)


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
    await _send_envelope(ws, "dispatcher.snapshot", payload)


async def send_locomotive_snapshot(ws: WebSocket, locomotive_id: str) -> None:
    runtime = state.locomotives.get(locomotive_id)
    if runtime is None:
        return

    if runtime.latest_telemetry is not None:
        await _send_envelope(ws, "telemetry.frame", runtime.latest_telemetry)

    if runtime.health_index is not None:
        await _send_envelope(ws, "health.update", runtime.health_index)

    alerts = sorted(
        runtime.active_alerts.values(),
        key=lambda alert: ({"critical": 0, "warning": 1, "info": 2}.get(str(alert.get("severity")), 3), -int(alert.get("triggered_at", 0))),
    )
    for alert in alerts:
        await _send_envelope(ws, "alert.new", alert)
