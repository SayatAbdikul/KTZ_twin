from __future__ import annotations

import json
import logging
from typing import Any

from app.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CLIENT_ID,
    KAFKA_ENABLED,
    KAFKA_TOPIC_TELEMETRY,
)

logger = logging.getLogger(__name__)

try:
    from aiokafka import AIOKafkaProducer
except ImportError:  # pragma: no cover - handled at runtime
    AIOKafkaProducer = None  # type: ignore[assignment]


class KafkaPublisher:
    def __init__(self) -> None:
        self.enabled = KAFKA_ENABLED
        self.topic = KAFKA_TOPIC_TELEMETRY
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        if not self.enabled:
            logger.info("Kafka publisher disabled by configuration.")
            return

        if AIOKafkaProducer is None:
            logger.warning("Kafka enabled but aiokafka is not installed; publishing disabled.")
            self.enabled = False
            return

        self._producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            client_id=KAFKA_CLIENT_ID,
            value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
            key_serializer=lambda key: key.encode("utf-8"),
        )
        await self._producer.start()
        logger.info("Kafka producer connected to %s", ",".join(KAFKA_BOOTSTRAP_SERVERS))

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def publish_telemetry(self, locomotive_id: str, payload: dict[str, Any]) -> None:
        if not self.enabled or self._producer is None:
            return
        await self._producer.send_and_wait(self.topic, payload, key=locomotive_id)
