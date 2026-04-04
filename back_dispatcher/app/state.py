from __future__ import annotations

import asyncio
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from fastapi import WebSocket

from app.config import LocomotiveTarget, WS_MAX_SEND_FAILURES, WS_ORDERED_QUEUE_LIMIT


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
class DispatcherClientRuntime:
    websocket: WebSocket
    client_id: str = field(default_factory=lambda: uuid4().hex[:8])
    subscription: str | None = None
    sender_task: asyncio.Task[None] | None = None
    ordered_events: deque[str] = field(default_factory=deque)
    latest_telemetry: str | None = None
    latest_health: str | None = None
    wake_event: asyncio.Event = field(default_factory=asyncio.Event)
    telemetry_drop_count: int = 0
    health_drop_count: int = 0
    send_failure_count: int = 0
    disconnect_reason: str | None = None
    last_error: str | None = None

    @property
    def queue_depth(self) -> int:
        return len(self.ordered_events)


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
        self.ws_clients: dict[WebSocket, DispatcherClientRuntime] = {}
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

    def register_client(self, websocket: WebSocket) -> DispatcherClientRuntime:
        client = DispatcherClientRuntime(websocket=websocket)
        client.sender_task = asyncio.create_task(
            self._sender_loop(client),
            name=f"dispatcher-ws-{client.client_id}",
        )
        self.ws_clients[websocket] = client
        self.note_ws_connected()
        return client

    def unregister_client(self, websocket: WebSocket, reason: str | None = None) -> DispatcherClientRuntime | None:
        client = self.ws_clients.pop(websocket, None)
        if client is None:
            return None

        if reason and client.disconnect_reason is None:
            client.disconnect_reason = reason

        if client.sender_task is not None:
            client.sender_task.cancel()
        client.wake_event.set()
        self.note_ws_disconnected()
        return client

    def get_client(self, websocket: WebSocket) -> DispatcherClientRuntime | None:
        return self.ws_clients.get(websocket)

    def set_subscription(self, websocket: WebSocket, subscription: str | None) -> None:
        client = self.get_client(websocket)
        if client is not None:
            client.subscription = subscription

    def matching_clients(self, locomotive_id: str | None = None) -> list[DispatcherClientRuntime]:
        if locomotive_id is None:
            return list(self.ws_clients.values())
        return [
            client
            for client in self.ws_clients.values()
            if client.subscription in (None, "*", locomotive_id)
        ]

    def enqueue_message(self, client: DispatcherClientRuntime, msg_type: str, wire: str) -> bool:
        if client.disconnect_reason is not None:
            return False

        if msg_type == "telemetry.frame":
            if client.latest_telemetry is not None:
                client.telemetry_drop_count += 1
            client.latest_telemetry = wire
            client.wake_event.set()
            return True

        if msg_type == "health.update":
            if client.latest_health is not None:
                client.health_drop_count += 1
            client.latest_health = wire
            client.wake_event.set()
            return True

        if len(client.ordered_events) >= WS_ORDERED_QUEUE_LIMIT:
            client.disconnect_reason = "ordered_queue_overflow"
            asyncio.create_task(client.websocket.close(code=1013, reason="Backpressure overflow"))
            return False

        client.ordered_events.append(wire)
        client.wake_event.set()
        return True

    def _next_wire(self, client: DispatcherClientRuntime) -> str | None:
        if client.ordered_events:
            return client.ordered_events.popleft()
        if client.latest_telemetry is not None:
            wire = client.latest_telemetry
            client.latest_telemetry = None
            return wire
        if client.latest_health is not None:
            wire = client.latest_health
            client.latest_health = None
            return wire
        return None

    async def _sender_loop(self, client: DispatcherClientRuntime) -> None:
        try:
            while True:
                await client.wake_event.wait()
                client.wake_event.clear()

                while True:
                    wire = self._next_wire(client)
                    if wire is None:
                        break

                    try:
                        await client.websocket.send_text(wire)
                        client.send_failure_count = 0
                        client.last_error = None
                    except Exception as exc:
                        client.send_failure_count += 1
                        client.last_error = str(exc)
                        if client.send_failure_count >= WS_MAX_SEND_FAILURES:
                            client.disconnect_reason = "send_failures_exceeded"
                            try:
                                await client.websocket.close(code=1011, reason="Send failures exceeded")
                            except Exception:
                                pass
                            return
                        client.wake_event.set()
                        break
        except asyncio.CancelledError:
            raise

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
        client_backpressure = [
            {
                "clientId": client.client_id,
                "subscription": client.subscription,
                "queueDepth": client.queue_depth,
                "telemetryPending": client.latest_telemetry is not None,
                "healthPending": client.latest_health is not None,
                "telemetryDrops": client.telemetry_drop_count,
                "healthDrops": client.health_drop_count,
                "sendFailures": client.send_failure_count,
                "disconnectReason": client.disconnect_reason,
                "lastError": client.last_error,
            }
            for client in self.ws_clients.values()
        ]
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
            "clientBackpressure": client_backpressure,
            "telemetryDropTotal": sum(client.telemetry_drop_count for client in self.ws_clients.values()),
            "healthDropTotal": sum(client.health_drop_count for client in self.ws_clients.values()),
        }


state = DispatcherState()
