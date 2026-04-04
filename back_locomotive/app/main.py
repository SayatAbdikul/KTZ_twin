from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.replay.kafka_publisher import KafkaPublisher
from app.replay.service import load_csv_rows, prime_initial_state, run_replay_loops, stop_replay_loops
from app.ws.broadcaster import task_broadcast_heartbeat
from app.ws.handler import websocket_endpoint

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting locomotive replay service")

    rows_by_locomotive = load_csv_rows()
    await prime_initial_state(rows_by_locomotive)

    publisher = KafkaPublisher()
    await publisher.start()

    await run_replay_loops(rows_by_locomotive, publisher)
    heartbeat_task = asyncio.create_task(task_broadcast_heartbeat(), name="heartbeat")

    try:
        yield
    finally:
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)
        await stop_replay_loops()
        await publisher.stop()
        logger.info("Locomotive replay service stopped")


app = FastAPI(
    title="KTZ Locomotive Replay Service",
    description="Replays telemetry CSV rows, publishes raw telemetry to Kafka, and streams frontend frames over WebSocket.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routes import alerts, connection, health, messages, replay, telemetry  # noqa: E402

app.include_router(telemetry.router)
app.include_router(health.router)
app.include_router(alerts.router)
app.include_router(messages.router)
app.include_router(connection.router)
app.include_router(replay.router)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)


@app.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "ok"}
