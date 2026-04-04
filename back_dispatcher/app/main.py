from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.locomotive_client import consume_telemetry_forever, track_locomotive_freshness
from app.models import now_ms
from app.routes import health, locomotives
from app.state import state
from app.ws_server import broadcast_message, send_connection_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s - %(message)s")
logger = logging.getLogger(__name__)


async def _handle_dispatcher_command(payload: dict[str, Any]) -> None:
    locomotive_id = str(payload.get("locomotiveId", "")).strip()
    body = str(payload.get("body", "")).strip()
    if not locomotive_id or not body:
        return

    event = {
        "message_id": f"dispatcher-{now_ms()}",
        "locomotive_id": locomotive_id,
        "body": body,
        "sender": "dispatcher",
        "sent_at": now_ms(),
    }
    state.chat_history[locomotive_id].append(event)
    await broadcast_message("message.new", event)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(consume_telemetry_forever(), name="kafka-consumer"),
        asyncio.create_task(track_locomotive_freshness(), name="locomotive-freshness"),
    ]
    logger.info("Dispatcher started with Kafka telemetry consumer")
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(
    title="KTZ Dispatcher Backend",
    description="Realtime dispatcher backend that consumes locomotive telemetry from Kafka and serves dispatcher clients over WebSocket.",
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

app.include_router(health.router)
app.include_router(locomotives.router)


@app.get("/ping")
def ping() -> dict:
    return {"status": "ok"}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.ws_clients.add(websocket)
    await send_connection_snapshot(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type", "")
                payload = msg.get("payload", {})
                if msg_type == "dispatcher.chat" and isinstance(payload, dict):
                    await _handle_dispatcher_command(payload)
            except json.JSONDecodeError:
                continue
    except WebSocketDisconnect:
        pass
    finally:
        state.ws_clients.discard(websocket)
