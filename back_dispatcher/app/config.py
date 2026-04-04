from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class LocomotiveTarget:
    locomotive_id: str
    ws_url: str


def _parse_locomotive_targets() -> list[LocomotiveTarget]:
    raw = os.getenv("LOCOMOTIVE_TARGETS", "KTZ-2001=ws://localhost:3001/ws")
    targets: list[LocomotiveTarget] = []
    for part in raw.split(","):
        token = part.strip()
        if not token or "=" not in token:
            continue
        locomotive_id, ws_url = token.split("=", 1)
        targets.append(LocomotiveTarget(locomotive_id=locomotive_id.strip(), ws_url=ws_url.strip()))
    return targets


APP_HOST = os.getenv("DISPATCHER_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("DISPATCHER_PORT", "3010"))
CORS_ORIGINS = [s.strip() for s in os.getenv("CORS_ORIGINS", "*").split(",") if s.strip()]
LOCOMOTIVE_TARGETS = _parse_locomotive_targets()

RECONNECT_BASE_S = float(os.getenv("RECONNECT_BASE_S", "1"))
RECONNECT_MAX_S = float(os.getenv("RECONNECT_MAX_S", "30"))
PING_INTERVAL_S = float(os.getenv("PING_INTERVAL_S", "20"))
