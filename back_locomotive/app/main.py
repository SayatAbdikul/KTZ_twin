"""
FastAPI application entrypoint.

Startup sequence:
  1. Initialize state (pre-seeded alerts + messages happen in state.py import)
  2. Generate first telemetry frame + health index (REST endpoints have data immediately)
  3. Start 5 background broadcast tasks
  4. On shutdown: cancel all background tasks
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.broker import start_broker, stop_broker
from app.simulator.health import generate_health_index
from app.simulator.telemetry import generate_frame
from app.ws.broadcaster import (
    task_alert_generator,
    task_broadcast_health,
    task_broadcast_heartbeat,
    task_broadcast_telemetry,
    task_message_generator,
)
from app.ws.handler import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: startup and shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialising KTZ Locomotive Telemetry Server…")

    await start_broker()

    # Generate first snapshot so REST endpoints are ready immediately
    generate_frame()
    generate_health_index()
    logger.info("Initial telemetry frame and health index generated.")

    # Launch background tasks
    tasks = [
        asyncio.create_task(task_broadcast_telemetry(), name="telemetry"),
        asyncio.create_task(task_broadcast_health(),    name="health"),
        asyncio.create_task(task_broadcast_heartbeat(), name="heartbeat"),
        asyncio.create_task(task_alert_generator(),     name="alerts"),
        asyncio.create_task(task_message_generator(),   name="messages"),
    ]
    logger.info("5 background tasks started.")

    yield  # ← server is running

    logger.info("Shutting down background tasks…")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await stop_broker()
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KTZ Locomotive Telemetry Server",
    description="Real-time telemetry backend for the locomotive operator interface.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Vite dev and preview servers
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


# ---------------------------------------------------------------------------
# Health check (not part of the frontend contract, useful for ops)
# ---------------------------------------------------------------------------

@app.get("/ping")
def ping():
    return {"status": "ok"}
