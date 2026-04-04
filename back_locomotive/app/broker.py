from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic
from aiokafka.errors import TopicAlreadyExistsError

from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_ENABLED, KAFKA_TOPIC_EVENTS
from app.models import EventEnvelopeV1

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None
_published_count = 0
_PUBLISH_LOG_EVERY = 100


async def start_broker() -> None:
    global _producer
    if not KAFKA_ENABLED or _producer is not None:
        return

    for attempt in range(1, 16):
        try:
            admin = AIOKafkaAdminClient(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
            await admin.start()
            try:
                await admin.create_topics([
                    NewTopic(name=KAFKA_TOPIC_EVENTS, num_partitions=1, replication_factor=1)
                ])
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
        acks="all",
        enable_idempotence=True,
    )

    for attempt in range(1, 16):
        try:
            await _producer.start()
            logger.info("Kafka producer started: %s, topic=%s", KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_EVENTS)
            return
        except Exception as exc:
            if attempt == 15:
                logger.error("Kafka producer bootstrap failed after retries: %s", exc)
                raise
            await asyncio.sleep(2)


async def stop_broker() -> None:
    global _producer
    if _producer is None:
        return
    await _producer.stop()
    _producer = None


async def publish_event(*, envelope: dict[str, Any], key: str) -> None:
    global _published_count

    if not KAFKA_ENABLED or _producer is None:
        return

    event_obj = envelope.get("event")
    if not isinstance(event_obj, dict):
        logger.warning("Kafka publish skipped: missing event envelope")
        return

    try:
        parsed_event = EventEnvelopeV1.model_validate(event_obj)
    except Exception as exc:
        logger.warning("Kafka publish skipped: invalid event envelope: %s", exc)
        return

    if parsed_event.event_type != str(envelope.get("type", "")):
        logger.warning("Kafka publish skipped: event_type mismatch")
        return

    try:
        await _producer.send_and_wait(
            KAFKA_TOPIC_EVENTS,
            value=envelope,
            key=key.encode("utf-8"),
        )
        _published_count += 1
        if _published_count % _PUBLISH_LOG_EVERY == 0:
            logger.info(
                "Kafka producer published %d messages to topic=%s",
                _published_count,
                KAFKA_TOPIC_EVENTS,
            )
    except Exception as exc:
        logger.warning("Kafka publish failed: %s", exc)
