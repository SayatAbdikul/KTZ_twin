from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from pydantic import ValidationError

from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_ID, KAFKA_TOPIC_EVENTS
from app.locomotive_client import _forward_locomotive_message
from app.models import WsEnvelope

logger = logging.getLogger(__name__)


async def consume_kafka_forever() -> None:
    while True:
        consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_EVENTS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_ID,
            auto_offset_reset="latest",
            enable_auto_commit=True,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        )

        try:
            await consumer.start()
            logger.info(
                "Kafka consumer started: brokers=%s topic=%s group=%s",
                KAFKA_BOOTSTRAP_SERVERS,
                KAFKA_TOPIC_EVENTS,
                KAFKA_GROUP_ID,
            )

            async for message in consumer:
                raw = message.value
                if not isinstance(raw, dict):
                    continue

                try:
                    envelope = WsEnvelope.model_validate(raw)
                except ValidationError as exc:
                    logger.warning("Rejected invalid Kafka envelope: %s", exc.errors())
                    continue

                if envelope.event is None:
                    logger.warning("Rejected Kafka envelope without event metadata")
                    continue
                if envelope.event.schema_version != "1.0":
                    logger.warning("Rejected Kafka envelope with unsupported schemaVersion=%s", envelope.event.schema_version)
                    continue
                if envelope.event.event_type != envelope.type:
                    logger.warning("Rejected Kafka envelope with event/type mismatch: %s != %s", envelope.event.event_type, envelope.type)
                    continue

                locomotive_id = envelope.event.locomotive_id
                await _forward_locomotive_message(
                    locomotive_id,
                    {
                        "type": envelope.type,
                        "payload": envelope.payload,
                    },
                )
        except Exception as exc:
            logger.warning("Kafka consumer loop error: %s", exc)
            await asyncio.sleep(2)
        finally:
            await consumer.stop()
