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

    model_config = ConfigDict(populate_by_name=True)


class LocomotiveStatus(CamelModel):
    locomotive_id: str
    locomotive_type: str | None = None
    connected: bool
    last_seen_at: int | None = None


def now_ms() -> int:
    return int(time.time() * 1000)
