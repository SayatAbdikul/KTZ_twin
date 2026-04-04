from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from fastapi import WebSocket


@dataclass
class LocomotiveRuntime:
    locomotive_id: str
    locomotive_type: str | None = None
    connected: bool = False
    last_seen_at: int | None = None
    latest_telemetry: dict | None = None
    latest_frame: dict | None = None


class DispatcherState:
    def __init__(self) -> None:
        self.ws_clients: set[WebSocket] = set()
        self.sequence_id = 0
        self.locomotives: dict[str, LocomotiveRuntime] = {}
        self.chat_history: dict[str, list[dict]] = defaultdict(list)
        self.consumer_connected = False
        self._lock = asyncio.Lock()

    async def next_sequence(self) -> int:
        async with self._lock:
            self.sequence_id += 1
            return self.sequence_id


state = DispatcherState()
