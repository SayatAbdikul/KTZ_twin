from __future__ import annotations

import os


def _split_csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


APP_HOST = os.getenv("DISPATCHER_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("DISPATCHER_PORT", "3010"))
CORS_ORIGINS = _split_csv_env("CORS_ORIGINS", "*")

KAFKA_BOOTSTRAP_SERVERS = _split_csv_env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_TELEMETRY = os.getenv("KAFKA_TOPIC_TELEMETRY", "locomotive.telemetry.raw")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "back-dispatcher")
KAFKA_CLIENT_ID = os.getenv("KAFKA_CLIENT_ID", "back-dispatcher")
KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}

LOCOMOTIVE_STALE_AFTER_S = float(os.getenv("LOCOMOTIVE_STALE_AFTER_S", "15"))
