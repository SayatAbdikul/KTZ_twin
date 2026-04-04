from __future__ import annotations

import asyncio
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from typing import Any
from fastapi import WebSocket

from app.config import LocomotiveTarget


@dataclass
class LocomotiveRuntime:
    target: LocomotiveTarget
    connected: bool = False
    reconnect_attempt: int = 0
    last_seen_at: int | None = None
    latest_telemetry: dict | None = None
    latest_metrics: dict[str, float] = field(default_factory=dict)
    telemetry_history: deque[dict[str, float]] = field(default_factory=lambda: deque(maxlen=720))
    health_index: dict | None = None
    active_alerts: dict[str, dict] = field(default_factory=dict)
    ws: Any | None = None


@dataclass
class DispatcherStats:
    started_at: int = field(default_factory=lambda: int(time.time() * 1000))
    ws_accept_total: int = 0
    ws_disconnect_total: int = 0
    ws_peak_clients: int = 0
    ingest_total: int = 0
    ingest_by_type: Counter[str] = field(default_factory=Counter)
    ingest_last_at: int | None = None
    broadcast_total: int = 0
    broadcast_by_type: Counter[str] = field(default_factory=Counter)
    broadcast_delivery_attempt_total: int = 0
    broadcast_delivery_fail_total: int = 0
    broadcast_last_at: int | None = None


class DispatcherState:
    def __init__(self) -> None:
        self.ws_clients: set[WebSocket] = set()
        self.ws_subscriptions: dict[WebSocket, str | None] = {}
        self.sequence_id = 0
        self.locomotives: dict[str, LocomotiveRuntime] = {}
        self.chat_history: dict[str, list[dict]] = defaultdict(list)
        self.stats = DispatcherStats()
        self._lock = asyncio.Lock()
        self._event_dedupe_lock = asyncio.Lock()
        self._seen_event_ids: deque[str] = deque(maxlen=20_000)
        self._seen_event_lookup: set[str] = set()

    async def next_sequence(self) -> int:
        async with self._lock:
            self.sequence_id += 1
            return self.sequence_id

    async def accept_event(self, event_id: str | None) -> bool:
        if not event_id:
            return True

        async with self._event_dedupe_lock:
            if event_id in self._seen_event_lookup:
                return False

            if len(self._seen_event_ids) == self._seen_event_ids.maxlen:
                evicted = self._seen_event_ids.popleft()
                self._seen_event_lookup.discard(evicted)

            self._seen_event_ids.append(event_id)
            self._seen_event_lookup.add(event_id)
            return True

    def note_ws_connected(self) -> None:
        self.stats.ws_accept_total += 1
        self.stats.ws_peak_clients = max(self.stats.ws_peak_clients, len(self.ws_clients))

    def note_ws_disconnected(self) -> None:
        self.stats.ws_disconnect_total += 1

    def note_ingest(self, msg_type: str) -> None:
        now = int(time.time() * 1000)
        self.stats.ingest_total += 1
        self.stats.ingest_by_type[msg_type] += 1
        self.stats.ingest_last_at = now

    def note_broadcast(self, msg_type: str, attempted_deliveries: int, failed_deliveries: int) -> None:
        now = int(time.time() * 1000)
        self.stats.broadcast_total += 1
        self.stats.broadcast_by_type[msg_type] += 1
        self.stats.broadcast_delivery_attempt_total += attempted_deliveries
        self.stats.broadcast_delivery_fail_total += failed_deliveries
        self.stats.broadcast_last_at = now

    def stats_snapshot(self) -> dict[str, Any]:
        now = int(time.time() * 1000)
        return {
            "startedAt": self.stats.started_at,
            "uptimeMs": now - self.stats.started_at,
            "wsAcceptTotal": self.stats.ws_accept_total,
            "wsDisconnectTotal": self.stats.ws_disconnect_total,
            "wsPeakClients": self.stats.ws_peak_clients,
            "ingestTotal": self.stats.ingest_total,
            "ingestByType": dict(self.stats.ingest_by_type),
            "ingestLastAt": self.stats.ingest_last_at,
            "broadcastTotal": self.stats.broadcast_total,
            "broadcastByType": dict(self.stats.broadcast_by_type),
            "broadcastDeliveryAttemptTotal": self.stats.broadcast_delivery_attempt_total,
            "broadcastDeliveryFailTotal": self.stats.broadcast_delivery_fail_total,
            "broadcastLastAt": self.stats.broadcast_last_at,
        }


state = DispatcherState()
