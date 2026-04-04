"""
Pydantic v2 models matching front_locomotive/src/types/*.ts exactly.
All models serialize to camelCase JSON (alias_generator=to_camel).
"""

from __future__ import annotations

from typing import Any, Generic, Literal, Optional, TypeVar
import time

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# ---------------------------------------------------------------------------
# Base config — camelCase aliases for all models
# ---------------------------------------------------------------------------

class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------

class MetricReading(CamelModel):
    metric_id: str
    value: float
    unit: str
    timestamp: int
    quality: Literal["good", "suspect", "bad", "stale"] = "good"


class MetricDefinition(CamelModel):
    metric_id: str
    label: str
    unit: str
    group: Literal["motion", "fuel", "thermal", "pressure", "electrical"]
    precision: int
    min: float
    max: float
    warning_low: Optional[float] = None
    warning_high: Optional[float] = None
    critical_low: Optional[float] = None
    critical_high: Optional[float] = None
    sparkline_enabled: bool
    display_order: int


class TelemetryFrame(CamelModel):
    locomotive_id: str
    frame_id: str
    timestamp: int
    readings: list[MetricReading]


class MetricHistoryPoint(CamelModel):
    timestamp: int
    value: float


class MetricHistory(CamelModel):
    metric_id: str
    # "from" is a Python keyword — use alias
    from_: int = Field(alias="from")
    to: int
    resolution: str
    points: list[MetricHistoryPoint]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class SubsystemHealth(CamelModel):
    subsystem_id: str
    label: str
    health_score: float
    status: Literal["normal", "degraded", "warning", "critical", "unknown"]
    active_alert_count: int
    last_updated: int


class HealthIndex(CamelModel):
    overall: float
    timestamp: int
    subsystems: list[SubsystemHealth]


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class Alert(CamelModel):
    alert_id: str
    severity: Literal["critical", "warning", "info"]
    status: Literal["active", "acknowledged", "resolved"]
    source: str
    title: str
    description: str
    recommended_action: Optional[str] = None
    triggered_at: int
    acknowledged_at: Optional[int] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[int] = None
    related_metric_ids: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Dispatcher Messages
# ---------------------------------------------------------------------------

class DispatcherMessage(CamelModel):
    message_id: str
    priority: Literal["urgent", "high", "normal", "low"]
    type: Literal["assessment", "recommendation", "directive", "informational"]
    subject: str
    body: str
    sender_name: str
    sent_at: int
    read_at: Optional[int] = None
    acknowledged_at: Optional[int] = None
    expires_at: Optional[int] = None


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

class ConnectionState(CamelModel):
    backend_status: Literal["connected", "connecting", "disconnected", "error"]
    dispatcher_status: Literal["connected", "connecting", "disconnected", "error"]
    ws_connected: bool
    last_heartbeat: Optional[int] = None
    latency_ms: Optional[int] = None
    reconnect_attempt: int = 0


# ---------------------------------------------------------------------------
# API response envelope
# ---------------------------------------------------------------------------

T = TypeVar("T")


class ApiMeta(CamelModel):
    page: Optional[int] = None
    page_size: Optional[int] = None
    total: Optional[int] = None


class ApiError(CamelModel):
    code: str
    message: str


# ---------------------------------------------------------------------------
# WebSocket message envelope
# ---------------------------------------------------------------------------

class WsMessage(BaseModel):
    """WS messages are NOT camelCase-aliased — they use type/payload directly."""
    type: str
    payload: Any
    timestamp: int
    sequence_id: int = Field(alias="sequenceId")

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_ms() -> int:
    """Current time in milliseconds (epoch ms, matching JS Date.now())."""
    return int(time.time() * 1000)


def make_response(data: Any, meta: Optional[ApiMeta] = None) -> dict:
    """Wrap data in the standard API response envelope."""
    result: dict = {"data": data, "timestamp": now_ms()}
    if meta is not None:
        result["meta"] = meta.model_dump(by_alias=True, exclude_none=True)
    return result
