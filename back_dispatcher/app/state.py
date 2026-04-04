from __future__ import annotations

import asyncio
from collections import defaultdict, deque
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


class DispatcherState:
    def __init__(self) -> None:
        self.ws_clients: set[WebSocket] = set()
        self.ws_subscriptions: dict[WebSocket, str | None] = {}
        self.sequence_id = 0
        self.locomotives: dict[str, LocomotiveRuntime] = {}
        self.chat_history: dict[str, list[dict]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def next_sequence(self) -> int:
        async with self._lock:
            self.sequence_id += 1
            return self.sequence_id


state = DispatcherState()
