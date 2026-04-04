from __future__ import annotations

import json
import logging
import asyncio

from aiokafka import AIOKafkaConsumer

from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_ID, KAFKA_TOPIC_EVENTS
from app.locomotive_client import _forward_locomotive_message

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
                event = message.value
                if not isinstance(event, dict):
                    continue

                locomotive_id = str(event.get("locomotive_id") or event.get("locomotiveId") or "").strip()
                msg = event.get("message")
                if not locomotive_id or not isinstance(msg, dict):
                    continue
                await _forward_locomotive_message(locomotive_id, msg)
        except Exception as exc:
            logger.warning("Kafka consumer loop error: %s", exc)
            await asyncio.sleep(2)
        finally:
            await consumer.stop()
