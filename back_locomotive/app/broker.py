from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewPartitions, NewTopic
from aiokafka.errors import TopicAlreadyExistsError

from app.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_ENABLED,
    KAFKA_TOPIC_EVENTS,
    KAFKA_TOPIC_PARTITIONS,
    KAFKA_TOPIC_REPLICATION_FACTOR,
)
from app.models import EventEnvelopeV1

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None
_published_count = 0
_PUBLISH_LOG_EVERY = 100


def _partition_key_bytes(key: str) -> bytes:
    return key.strip().encode("utf-8")


def _topic_spec() -> NewTopic:
    return NewTopic(
        name=KAFKA_TOPIC_EVENTS,
        num_partitions=max(1, KAFKA_TOPIC_PARTITIONS),
        replication_factor=max(1, KAFKA_TOPIC_REPLICATION_FACTOR),
    )


def _extract_partition_count(topic_metadata: Any) -> int | None:
    if isinstance(topic_metadata, dict):
        partitions = topic_metadata.get("partitions")
        if isinstance(partitions, list):
            return len(partitions)

    if isinstance(topic_metadata, list) and topic_metadata and all(isinstance(item, dict) for item in topic_metadata):
        partition_entries = [item for item in topic_metadata if "partition" in item]
        if partition_entries:
            return len(partition_entries)

    partitions_attr = getattr(topic_metadata, "partitions", None)
    if partitions_attr is not None:
        try:
            return len(partitions_attr)
        except TypeError:
            return None

    return None


async def _describe_partition_count(admin: AIOKafkaAdminClient) -> int | None:
    describe_topics = getattr(admin, "describe_topics", None)
    if describe_topics is None:
        return None

    metadata = await describe_topics([KAFKA_TOPIC_EVENTS])
    if isinstance(metadata, list) and len(metadata) == 1:
        return _extract_partition_count(metadata[0])
    return _extract_partition_count(metadata)


async def _ensure_topic(admin: AIOKafkaAdminClient) -> None:
    topic_spec = _topic_spec()
    desired_partitions = topic_spec.num_partitions

    try:
        await admin.create_topics([topic_spec])
        logger.info(
            "Kafka topic ensured: topic=%s partitions=%d replication_factor=%d",
            KAFKA_TOPIC_EVENTS,
            topic_spec.num_partitions,
            topic_spec.replication_factor,
        )
    except TopicAlreadyExistsError:
        pass

    current_partitions = await _describe_partition_count(admin)
    if current_partitions is None:
        logger.info(
            "Kafka topic partition count could not be inspected; expected topic=%s partitions=%d",
            KAFKA_TOPIC_EVENTS,
            desired_partitions,
        )
        return

    if current_partitions > desired_partitions:
        logger.warning(
            "Kafka topic has more partitions than configured and cannot be reduced automatically: "
            "topic=%s current_partitions=%d target_partitions=%d",
            KAFKA_TOPIC_EVENTS,
            current_partitions,
            desired_partitions,
        )
        return

    if current_partitions == desired_partitions:
        logger.info(
            "Kafka topic partitioning ready: topic=%s current_partitions=%d target_partitions=%d",
            KAFKA_TOPIC_EVENTS,
            current_partitions,
            desired_partitions,
        )
        return

    await admin.create_partitions({KAFKA_TOPIC_EVENTS: NewPartitions(total_count=desired_partitions)})
    logger.info(
        "Kafka topic partitions increased: topic=%s old_partitions=%d new_partitions=%d",
        KAFKA_TOPIC_EVENTS,
        current_partitions,
        desired_partitions,
    )


async def start_broker() -> None:
    global _producer
    if not KAFKA_ENABLED or _producer is not None:
        return

    for attempt in range(1, 16):
        try:
            admin = AIOKafkaAdminClient(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
            await admin.start()
            try:
                await _ensure_topic(admin)
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
            key=_partition_key_bytes(key),
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
