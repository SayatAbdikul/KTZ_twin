from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CLIENT_ID,
    KAFKA_ENABLED,
    KAFKA_GROUP_ID,
    KAFKA_TOPIC_TELEMETRY,
    LOCOMOTIVE_STALE_AFTER_S,
)
from app.models import now_ms
from app.state import LocomotiveRuntime, state
from app.telemetry_mapper import frontend_frame_from_raw, normalize_raw_telemetry
from app.ws_server import broadcast_message

logger = logging.getLogger(__name__)

try:
    from aiokafka import AIOKafkaConsumer
except ImportError:  # pragma: no cover - handled at runtime
    AIOKafkaConsumer = None  # type: ignore[assignment]


async def consume_telemetry_forever() -> None:
    if not KAFKA_ENABLED:
        logger.info("Kafka consumer disabled by configuration.")
        while True:
            await asyncio.sleep(60)

    if AIOKafkaConsumer is None:
        logger.warning("Kafka enabled but aiokafka is not installed; dispatcher consumer idle.")
        while True:
            await asyncio.sleep(60)

    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC_TELEMETRY,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_ID,
        client_id=KAFKA_CLIENT_ID,
        enable_auto_commit=True,
        auto_offset_reset="latest",
        value_deserializer=lambda payload: json.loads(payload.decode("utf-8")),
    )

    await consumer.start()
    state.consumer_connected = True
    logger.info("Dispatcher Kafka consumer connected to %s", ",".join(KAFKA_BOOTSTRAP_SERVERS))

    try:
        async for message in consumer:
            payload = message.value
            if not isinstance(payload, dict) or payload.get("event_type") != "telemetry.raw":
                continue

            telemetry = payload.get("telemetry")
            if not isinstance(telemetry, dict):
                continue

            raw = normalize_raw_telemetry(telemetry)
            locomotive_id = str(raw.get("locomotive_id", "unknown"))
            runtime = state.locomotives.get(locomotive_id)
            if runtime is None:
                runtime = LocomotiveRuntime(locomotive_id=locomotive_id)
                state.locomotives[locomotive_id] = runtime

            runtime.connected = True
            runtime.last_seen_at = now_ms()
            runtime.locomotive_type = str(raw.get("locomotive_type") or "") or None
            runtime.latest_telemetry = raw
            runtime.latest_frame = frontend_frame_from_raw(raw, frame_id=f"frame-{runtime.last_seen_at}")

            await broadcast_message("telemetry.frame", runtime.latest_frame)
    finally:
        state.consumer_connected = False
        await consumer.stop()


async def track_locomotive_freshness() -> None:
    while True:
        await asyncio.sleep(1)
        stale_before = now_ms() - int(LOCOMOTIVE_STALE_AFTER_S * 1000)
        for runtime in state.locomotives.values():
            runtime.connected = runtime.last_seen_at is not None and runtime.last_seen_at >= stale_before
