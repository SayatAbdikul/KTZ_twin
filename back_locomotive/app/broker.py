from __future__ import annotations

import json
import logging
import asyncio
from typing import Any

from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic
from aiokafka.errors import TopicAlreadyExistsError

from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_ENABLED, KAFKA_TOPIC_EVENTS

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def start_broker() -> None:
    global _producer
    if not KAFKA_ENABLED:
        return
    if _producer is not None:
        return

    for attempt in range(1, 16):
        try:
            admin = AIOKafkaAdminClient(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
            await admin.start()
            try:
                await admin.create_topics([NewTopic(name=KAFKA_TOPIC_EVENTS, num_partitions=1, replication_factor=1)])
            except TopicAlreadyExistsError:
                pass
            finally:
                await admin.close()
            break
        except Exception as exc:
            if attempt == 15:
                logger.error("Kafka admin bootstrap failed after retries: %s", exc)
                raise
            await asyncio.sleep(2)

    _producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v, separators=(",", ":")).encode("utf-8"),
    )
    for attempt in range(1, 16):
        try:
            await _producer.start()
            break
        except Exception as exc:
            if attempt == 15:
                logger.error("Kafka producer bootstrap failed after retries: %s", exc)
                raise
            await asyncio.sleep(2)
    logger.info("Kafka producer started: %s, topic=%s", KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_EVENTS)


async def stop_broker() -> None:
    global _producer
    if _producer is None:
        return
    await _producer.stop()
    _producer = None


async def publish_event(event: dict[str, Any], key: str | None = None) -> None:
    if not KAFKA_ENABLED or _producer is None:
        return
    try:
        await _producer.send_and_wait(
            KAFKA_TOPIC_EVENTS,
            value=event,
            key=(key.encode("utf-8") if key else None),
        )
    except Exception as exc:
        logger.warning("Kafka publish failed: %s", exc)
