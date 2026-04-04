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

# Ingest mode: ws | kafka | hybrid
INGEST_MODE = os.getenv("INGEST_MODE", "ws").strip().lower()
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_EVENTS = os.getenv("KAFKA_TOPIC_EVENTS", "ktz.locomotive.events")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "ktz-dispatcher")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://ktz:ktz@timescaledb:5432/ktz_dispatcher",
)
DB_ECHO = os.getenv("DB_ECHO", "false").lower() == "true"
TELEMETRY_RETENTION_HOURS = int(os.getenv("TELEMETRY_RETENTION_HOURS", "72"))
RECENT_TELEMETRY_MAX_MINUTES = int(os.getenv("RECENT_TELEMETRY_MAX_MINUTES", "15"))
