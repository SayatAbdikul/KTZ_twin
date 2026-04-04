from __future__ import annotations

from typing import Any
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
import time


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class WsEnvelope(BaseModel):
    type: str
    payload: Any
    timestamp: int
    sequence_id: int = Field(alias="sequenceId")
    event: "EventEnvelopeV1 | None" = None

    model_config = ConfigDict(populate_by_name=True)


class EventEnvelopeV1(BaseModel):
    event_id: str
    event_type: str
    source: str
    locomotive_id: str
    occurred_at: int
    schema_version: str


class LocomotiveStatus(CamelModel):
    locomotive_id: str
    ws_url: str
    connected: bool
    last_seen_at: int | None = None
    reconnect_attempt: int = 0


def now_ms() -> int:
    return int(time.time() * 1000)
