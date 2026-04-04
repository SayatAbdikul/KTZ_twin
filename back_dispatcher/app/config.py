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


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


APP_HOST = os.getenv("DISPATCHER_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("DISPATCHER_PORT", "3010"))
CORS_ORIGINS = [s.strip() for s in os.getenv("CORS_ORIGINS", "*").split(",") if s.strip()]
LOCOMOTIVE_TARGETS = _parse_locomotive_targets()
API_KEY = os.getenv("API_KEY", "ktz-demo-key")
THRESHOLDS_FILE = os.getenv("THRESHOLDS_FILE", "")
AUTH_TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "ktz-demo-auth-secret")
AUTH_ACCESS_TOKEN_TTL_S = int(os.getenv("AUTH_ACCESS_TOKEN_TTL_S", "900"))
AUTH_REFRESH_TOKEN_TTL_S = int(os.getenv("AUTH_REFRESH_TOKEN_TTL_S", "604800"))
AUTH_REFRESH_COOKIE_NAME = os.getenv("AUTH_REFRESH_COOKIE_NAME", "ktz_refresh_token")
AUTH_REFRESH_COOKIE_SECURE = _bool_env("AUTH_REFRESH_COOKIE_SECURE", False)
BOOTSTRAP_ADMIN_USERNAME = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
BOOTSTRAP_ADMIN_PASSWORD = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "RailCore!4821")
BOOTSTRAP_ADMIN_DISPLAY_NAME = os.getenv("BOOTSTRAP_ADMIN_DISPLAY_NAME", "KTZ Administrator")
AUTH_SEED_DEMO_USERS = _bool_env("AUTH_SEED_DEMO_USERS", True)
DEMO_DISPATCHER_USERNAME = os.getenv("DEMO_DISPATCHER_USERNAME", "dispatcher")
DEMO_DISPATCHER_PASSWORD = os.getenv("DEMO_DISPATCHER_PASSWORD", "Dispatch!2714")
DEMO_DISPATCHER_DISPLAY_NAME = os.getenv("DEMO_DISPATCHER_DISPLAY_NAME", "KTZ Dispatcher")
DEMO_TRAIN_LOCOMOTIVE_ID = os.getenv(
    "DEMO_TRAIN_LOCOMOTIVE_ID",
    LOCOMOTIVE_TARGETS[0].locomotive_id if LOCOMOTIVE_TARGETS else "KTZ-2001",
)
DEMO_TRAIN_PASSWORD = os.getenv("DEMO_TRAIN_PASSWORD", "AxleNorth!2714")
DEMO_TRAIN_DISPLAY_NAME = os.getenv(
    "DEMO_TRAIN_DISPLAY_NAME",
    f"Train {DEMO_TRAIN_LOCOMOTIVE_ID}",
)

RECONNECT_BASE_S = float(os.getenv("RECONNECT_BASE_S", "1"))
RECONNECT_MAX_S = float(os.getenv("RECONNECT_MAX_S", "30"))
PING_INTERVAL_S = float(os.getenv("PING_INTERVAL_S", "20"))
WS_ORDERED_QUEUE_LIMIT = int(os.getenv("WS_ORDERED_QUEUE_LIMIT", "256"))
WS_MAX_SEND_FAILURES = int(os.getenv("WS_MAX_SEND_FAILURES", "3"))

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
