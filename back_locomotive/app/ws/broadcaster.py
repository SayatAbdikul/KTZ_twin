"""
WebSocket broadcaster — 5 async background tasks.

Each task runs an infinite loop and is started in app lifespan.
broadcast_message() is the shared helper used by both tasks and REST routes.
"""

from __future__ import annotations

import asyncio
import json
import random
import time

from app.config import (
    RAW_TELEMETRY_INTERVAL_S,
    TELEMETRY_INTERVAL_S,
    HEALTH_INTERVAL_S,
    HEARTBEAT_INTERVAL_S,
    ALERT_CHECK_BASE_S,
    MESSAGE_CHECK_BASE_S,
    LOCOMOTIVE_ID,
    KAFKA_ENABLED,
    PATTERN_FLEET_ENABLED,
    PATTERN_FLEET_INTERVAL_S,
)
from app.models import make_event_envelope, now_ms
from app.state import state
from app.broker import publish_event


# ---------------------------------------------------------------------------
# Core broadcast helper
# ---------------------------------------------------------------------------

async def broadcast_message(msg_type: str, payload: object) -> None:
    """Send a WS message to all connected clients. Remove dead clients silently."""
    locomotive_id = LOCOMOTIVE_ID
    if isinstance(payload, dict):
        locomotive_id = str(payload.get("locomotive_id") or payload.get("locomotiveId") or LOCOMOTIVE_ID)

    event = make_event_envelope(
        event_type=msg_type,
        source="back_locomotive",
        locomotive_id=locomotive_id,
    )

    envelope = {
        "type": msg_type,
        "payload": payload,
        "timestamp": now_ms(),
        "sequenceId": state.next_sequence(),
        "event": event.model_dump(),
    }

    if not (KAFKA_ENABLED and PATTERN_FLEET_ENABLED and locomotive_id == LOCOMOTIVE_ID):
        await publish_event(envelope=envelope, key=locomotive_id)

    if not state.ws_clients:
        return

    data = json.dumps(envelope)

    dead = []
    for ws in list(state.ws_clients):
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)

    for ws in dead:
        state.ws_clients.discard(ws)


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def task_broadcast_telemetry() -> None:
    """Generate raw telemetry at 10 Hz and publish one aggregated frame per second."""
    from app.simulator.telemetry import generate_frame, generate_raw_sample, prime_raw_samples
    prime_raw_samples()
    next_emit_at = time.monotonic() + TELEMETRY_INTERVAL_S
    while True:
        generate_raw_sample()
        now = time.monotonic()
        if now >= next_emit_at:
            frame = generate_frame()
            await broadcast_message("telemetry.frame", frame.model_dump(by_alias=True))
            next_emit_at = now + TELEMETRY_INTERVAL_S
        await asyncio.sleep(RAW_TELEMETRY_INTERVAL_S)


async def task_broadcast_health() -> None:
    """Push a health update to all clients every 5 seconds."""
    from app.simulator.health import generate_health_index
    while True:
        await asyncio.sleep(HEALTH_INTERVAL_S)
        health = generate_health_index()
        await broadcast_message("health.update", health.model_dump(by_alias=True))


async def task_broadcast_heartbeat() -> None:
    """Push a heartbeat every 10 seconds."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_S)
        await broadcast_message("connection.heartbeat", {"serverTime": now_ms()})


async def task_alert_generator() -> None:
    """Randomly generate a new alert every 20-40 seconds (50% chance)."""
    from app.simulator.alerts import generate_random_alert
    while True:
        interval = ALERT_CHECK_BASE_S + random.random() * ALERT_CHECK_BASE_S
        await asyncio.sleep(interval)
        if random.random() > 0.5:
            alert = generate_random_alert()
            state.alerts.append(alert)
            await broadcast_message(
                "alert.new", alert.model_dump(by_alias=True, exclude_none=True)
            )


async def task_message_generator() -> None:
    """Randomly generate a new dispatcher message every 60-120 seconds (30% chance)."""
    from app.simulator.messages import generate_dispatcher_message
    while True:
        interval = MESSAGE_CHECK_BASE_S + random.random() * MESSAGE_CHECK_BASE_S
        await asyncio.sleep(interval)
        if random.random() > 0.7:
            msg = generate_dispatcher_message()
            state.messages.insert(0, msg)
            await broadcast_message(
                "message.new", msg.model_dump(by_alias=True, exclude_none=True)
            )


async def task_publish_fault_pattern_fleet() -> None:
    """Publish 10 deterministic faulty locomotive streams to Kafka every second."""
    if not KAFKA_ENABLED or not PATTERN_FLEET_ENABLED:
        return

    from app.simulator.telemetry import FAULT_PATTERN_PROFILES, generate_fault_pattern_frames

    startup_timestamp = now_ms()
    startup_messages = []
    for profile in FAULT_PATTERN_PROFILES:
        event = make_event_envelope(
            event_type="message.new",
            source="back_locomotive.pattern_fleet",
            locomotive_id=profile.locomotive_id,
            occurred_at=startup_timestamp,
        )
        startup_messages.append(
            publish_event(
                envelope={
                    "type": "message.new",
                    "payload": {
                        "message_id": f"{profile.locomotive_id}-pattern",
                        "locomotive_id": profile.locomotive_id,
                        "priority": "high",
                        "type": "assessment",
                        "subject": profile.name,
                        "body": profile.description,
                        "sender_name": "Pattern Fleet Simulator",
                        "sender": "Pattern Fleet Simulator",
                        "sent_at": startup_timestamp,
                    },
                    "timestamp": startup_timestamp,
                    "sequenceId": state.next_sequence(),
                    "event": event.model_dump(),
                },
                key=profile.locomotive_id,
            )
        )
    await asyncio.gather(*startup_messages)

    tick = 0
    while True:
        timestamp = now_ms()
        frames = generate_fault_pattern_frames(tick=tick, timestamp_ms=timestamp)
        publishes = []
        for frame in frames:
            event = make_event_envelope(
                event_type="telemetry.frame",
                source="back_locomotive.pattern_fleet",
                locomotive_id=frame.locomotive_id,
                occurred_at=timestamp,
            )
            publishes.append(
                publish_event(
                    envelope={
                        "type": "telemetry.frame",
                        "payload": frame.model_dump(by_alias=True),
                        "timestamp": timestamp,
                        "sequenceId": state.next_sequence(),
                        "event": event.model_dump(),
                    },
                    key=frame.locomotive_id,
                )
            )
        await asyncio.gather(*publishes)
        tick += 1
        await asyncio.sleep(PATTERN_FLEET_INTERVAL_S)
