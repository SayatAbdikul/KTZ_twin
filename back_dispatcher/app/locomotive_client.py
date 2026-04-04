from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets

from app.config import PING_INTERVAL_S, RECONNECT_BASE_S, RECONNECT_MAX_S, LocomotiveTarget
from app.health_engine import evaluate_runtime
from app.models import now_ms
from app.state import state
from app.ws_server import broadcast_message

logger = logging.getLogger(__name__)


async def _forward_locomotive_message(locomotive_id: str, msg: dict[str, Any]) -> None:
    msg_type = str(msg.get("type", ""))
    payload = msg.get("payload", {})

    runtime = state.locomotives[locomotive_id]
    runtime.last_seen_at = now_ms()

    if msg_type == "telemetry.frame" and isinstance(payload, dict):
        # Normalize to expected multi-locomotive frame shape.
        payload.setdefault("locomotive_id", locomotive_id)
        runtime.latest_telemetry = payload
        evaluation = evaluate_runtime(
            locomotive_id=locomotive_id,
            frame=payload,
            history=runtime.telemetry_history,
            active_alerts=runtime.active_alerts,
        )
        runtime.latest_metrics = evaluation["metrics"]
        runtime.health_index = evaluation["health_index"]
        runtime.active_alerts = evaluation["alerts"]

        await broadcast_message("telemetry.frame", payload, locomotive_id=locomotive_id)
        await broadcast_message("health.update", runtime.health_index, locomotive_id=locomotive_id)
        for event in evaluation["events"]:
            await broadcast_message(event["type"], event["payload"], locomotive_id=locomotive_id)
        return

    if msg_type == "message.new" and isinstance(payload, dict):
        payload.setdefault("locomotive_id", locomotive_id)
        state.chat_history[locomotive_id].append(payload)
        await broadcast_message("message.new", payload, locomotive_id=locomotive_id)
        return

    # Pass through unknown events with source metadata.
    await broadcast_message(
        "locomotive.event",
        {
            "locomotiveId": locomotive_id,
            "originalType": msg_type,
            "payload": payload,
        },
    )


async def send_chat_to_locomotive(locomotive_id: str, body: str) -> bool:
    runtime = state.locomotives.get(locomotive_id)
    if runtime is None or runtime.ws is None or not runtime.connected:
        return False

    wire = {
        "type": "dispatcher.chat",
        "payload": {
            "locomotiveId": locomotive_id,
            "body": body,
            "timestamp": now_ms(),
        },
    }
    try:
        await runtime.ws.send(json.dumps(wire))
        return True
    except Exception:
        return False


async def connect_locomotive_forever(target: LocomotiveTarget) -> None:
    runtime = state.locomotives[target.locomotive_id]

    while True:
        try:
            async with websockets.connect(target.ws_url, ping_interval=PING_INTERVAL_S) as ws:
                runtime.connected = True
                runtime.ws = ws
                runtime.reconnect_attempt = 0
                runtime.last_seen_at = now_ms()

                await broadcast_message(
                    "dispatcher.locomotive_status",
                    {
                        "locomotiveId": target.locomotive_id,
                        "connected": True,
                        "wsUrl": target.ws_url,
                        "lastSeenAt": runtime.last_seen_at,
                    },
                )

                await ws.send(json.dumps({"type": "subscribe", "payload": {"channels": ["telemetry", "messages"]}}))

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if isinstance(msg, dict):
                            await _forward_locomotive_message(target.locomotive_id, msg)
                    except json.JSONDecodeError:
                        logger.warning("Malformed WS frame from %s", target.locomotive_id)

        except Exception as exc:
            runtime.connected = False
            runtime.ws = None
            runtime.reconnect_attempt += 1
            await broadcast_message(
                "dispatcher.locomotive_status",
                {
                    "locomotiveId": target.locomotive_id,
                    "connected": False,
                    "wsUrl": target.ws_url,
                    "reconnectAttempt": runtime.reconnect_attempt,
                    "error": str(exc),
                },
            )
            delay = min(RECONNECT_BASE_S * (2 ** runtime.reconnect_attempt), RECONNECT_MAX_S)
            await asyncio.sleep(delay)
