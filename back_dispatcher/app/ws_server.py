from __future__ import annotations

import json
import logging
from fastapi import WebSocket
from uuid import uuid4

from app.models import now_ms
from app.state import DispatcherClientRuntime, state

logger = logging.getLogger(__name__)


async def _build_wire(msg_type: str, payload: object, locomotive_id: str | None = None) -> str:
    resolved_locomotive_id = locomotive_id
    if resolved_locomotive_id is None and isinstance(payload, dict):
        resolved_locomotive_id = str(payload.get("locomotive_id") or payload.get("locomotiveId") or "dispatcher")
    if resolved_locomotive_id is None:
        resolved_locomotive_id = "dispatcher"

    timestamp = now_ms()
    return json.dumps(
        {
            "type": msg_type,
            "payload": payload,
            "timestamp": timestamp,
            "sequenceId": await state.next_sequence(),
            "event": {
                "event_id": str(uuid4()),
                "event_type": msg_type,
                "source": "back_dispatcher",
                "locomotive_id": resolved_locomotive_id,
                "occurred_at": timestamp,
                "schema_version": "1.0",
            },
        }
    )


async def _enqueue_client_message(
    client: DispatcherClientRuntime | None,
    msg_type: str,
    payload: object,
    locomotive_id: str | None = None,
) -> bool:
    if client is None:
        return False
    wire = await _build_wire(msg_type, payload, locomotive_id=locomotive_id)
    return state.enqueue_message(client, msg_type, wire)


async def broadcast_message(msg_type: str, payload: object, locomotive_id: str | None = None) -> None:
    wire = await _build_wire(msg_type, payload, locomotive_id=locomotive_id)

    attempted = 0
    failed = 0
    for client in state.matching_clients(locomotive_id):
        attempted += 1
        if not state.enqueue_message(client, msg_type, wire):
            failed += 1

    state.note_broadcast(msg_type, attempted_deliveries=attempted, failed_deliveries=failed)


async def send_message(websocket: WebSocket, msg_type: str, payload: object, locomotive_id: str | None = None) -> None:
    await _enqueue_client_message(state.get_client(websocket), msg_type, payload, locomotive_id=locomotive_id)


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
    await send_message(ws, "dispatcher.snapshot", payload)


async def send_locomotive_snapshot(ws: WebSocket, locomotive_id: str) -> None:
    runtime = state.locomotives.get(locomotive_id)
    if runtime is None:
        return

    if runtime.latest_telemetry is not None:
        await send_message(ws, "telemetry.frame", runtime.latest_telemetry, locomotive_id=locomotive_id)

    if runtime.health_index is not None:
        await send_message(ws, "health.update", runtime.health_index, locomotive_id=locomotive_id)

    alerts = sorted(
        runtime.active_alerts.values(),
        key=lambda alert: ({"critical": 0, "warning": 1, "info": 2}.get(str(alert.get("severity")), 3), -int(alert.get("triggered_at", 0))),
    )
    for alert in alerts:
        await send_message(ws, "alert.new", alert, locomotive_id=locomotive_id)
