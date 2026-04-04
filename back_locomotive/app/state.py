from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from typing import Any

from fastapi import WebSocket

from app.config import HISTORY_BUFFER_SIZE
from app.models import TelemetryFrame


class AppState:
    def __init__(self) -> None:
        self.sequence_id = 0
        self.frame_counter = 0
        self._counter_lock = asyncio.Lock()

        self.ws_clients: dict[WebSocket, str | None] = {}
        self.loaded_locomotive_ids: list[str] = []
        self.default_frontend_locomotive_id: str | None = None

        self.latest_rows: dict[str, dict[str, Any]] = {}
        self.current_frames: dict[str, TelemetryFrame] = {}
        self.current_values: dict[str, dict[str, float]] = defaultdict(dict)
        self.history_buffer: dict[str, dict[str, deque[tuple[int, float]]]] = defaultdict(
            lambda: defaultdict(lambda: deque(maxlen=HISTORY_BUFFER_SIZE))
        )
        self.replay_tasks: dict[str, asyncio.Task[Any]] = {}
        self.last_heartbeat_at: int | None = None

    async def next_sequence(self) -> int:
        async with self._counter_lock:
            self.sequence_id += 1
            return self.sequence_id

    async def next_frame_id(self) -> str:
        async with self._counter_lock:
            self.frame_counter += 1
            return f"frame-{self.frame_counter}"

    def subscribed_locomotive_ids(self) -> list[str]:
        return list(self.loaded_locomotive_ids)


state = AppState()
