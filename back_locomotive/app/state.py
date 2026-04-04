"""
In-memory application state singleton.
All mutable runtime state lives here — no database required.
"""

from __future__ import annotations

import copy
from collections import deque
from typing import TYPE_CHECKING

from app.config import (
    START_VALUES,
    START_SCORES,
    HISTORY_BUFFER_SIZE,
    RAW_TELEMETRY_INTERVAL_S,
    TELEMETRY_INTERVAL_S,
)
from app.models import Alert, DispatcherMessage, TelemetryFrame, HealthIndex, now_ms

if TYPE_CHECKING:
    from starlette.websockets import WebSocket


class AppState:
    def __init__(self) -> None:
        # Current metric values (updated by telemetry simulator every 1s)
        self.current_values: dict[str, float] = copy.copy(START_VALUES)

        # Latest generated objects (available immediately on startup)
        self.current_frame: TelemetryFrame | None = None
        self.health_index: HealthIndex | None = None

        # Subsystem health scores (drifting floats)
        self.subsystem_scores: dict[str, float] = copy.copy(START_SCORES)

        # Per-metric ring buffer: deque of (timestamp_ms, value) tuples
        self.history_buffer: dict[str, deque[tuple[int, float]]] = {
            metric_id: deque(maxlen=HISTORY_BUFFER_SIZE)
            for metric_id in START_VALUES
        }
        raw_buffer_size = max(10, int((TELEMETRY_INTERVAL_S * 3) / RAW_TELEMETRY_INTERVAL_S))
        self.raw_samples: deque[tuple[int, dict[str, float]]] = deque(maxlen=raw_buffer_size)

        # Alerts list — pre-seeded with 2 initial alerts
        self.alerts: list[Alert] = self._seed_alerts()

        # Messages list — pre-seeded with 3 initial messages
        self.messages: list[DispatcherMessage] = self._seed_messages()

        # Counters
        self.frame_counter: int = 0
        self.alert_counter: int = 100
        self.message_counter: int = 10
        self.sequence_id: int = 0

        # Connected WebSocket clients
        self.ws_clients: set = set()

    def next_sequence(self) -> int:
        self.sequence_id += 1
        return self.sequence_id

    def next_alert_id(self) -> str:
        self.alert_counter += 1
        return f"alert-{self.alert_counter}"

    def next_message_id(self) -> str:
        self.message_counter += 1
        return f"msg-{self.message_counter}"

    def next_frame_id(self) -> str:
        self.frame_counter += 1
        return f"frame-{self.frame_counter}"

    # ------------------------------------------------------------------
    # Pre-seeded data — matches front_locomotive MSW fixtures exactly
    # ------------------------------------------------------------------

    def _seed_alerts(self) -> list[Alert]:
        now = now_ms()
        return [
            Alert(
                alert_id="alert-001",
                severity="warning",
                status="active",
                source="fuel",
                title="Fuel Level Below 20%",
                description="Remaining fuel is at 18.3%. Plan for refueling stop.",
                recommended_action="Contact dispatch to schedule refueling.",
                triggered_at=now - 12 * 60 * 1000,
                related_metric_ids=["fuel.level"],
            ),
            Alert(
                alert_id="alert-002",
                severity="info",
                status="acknowledged",
                source="electrical",
                title="Traction Voltage Fluctuation",
                description="Minor voltage fluctuation detected in traction system.",
                triggered_at=now - 35 * 60 * 1000,
                acknowledged_at=now - 30 * 60 * 1000,
                acknowledged_by="Operator",
                related_metric_ids=["electrical.traction_voltage"],
            ),
        ]

    def _seed_messages(self) -> list[DispatcherMessage]:
        now = now_ms()
        return [
            DispatcherMessage(
                message_id="msg-003",
                priority="urgent",
                type="directive",
                subject="URGENT: Track Obstruction at KM 342",
                body=(
                    "Track obstruction reported at KM 342. Do not proceed past KM 340 "
                    "until clearance is given. Emergency services are en route."
                ),
                sender_name="Emergency Control",
                sent_at=now - 5 * 60 * 1000,
            ),
            DispatcherMessage(
                message_id="msg-001",
                priority="high",
                type="recommendation",
                subject="Speed Restriction — Section KZ-7 to KZ-12",
                body=(
                    "Due to ongoing maintenance works, maximum speed on section KZ-7 to KZ-12 "
                    "is restricted to 60 km/h until 18:00 local time. Please acknowledge receipt."
                ),
                sender_name="Dispatcher Aliyev",
                sent_at=now - 25 * 60 * 1000,
            ),
            DispatcherMessage(
                message_id="msg-002",
                priority="normal",
                type="informational",
                subject="Scheduled Maintenance Reminder",
                body=(
                    "Locomotive KTZ-2001 is due for Level B maintenance inspection at Almaty "
                    "depot on arrival. Estimated duration: 4 hours."
                ),
                sender_name="Maintenance Control",
                sent_at=now - 2 * 60 * 60 * 1000,
                read_at=now - 90 * 60 * 1000,
            ),
        ]


# Module-level singleton — import this everywhere
state = AppState()
