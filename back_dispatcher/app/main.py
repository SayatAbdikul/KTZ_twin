from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.auth import authorize_websocket, enforce_http_auth, require_locomotive_access, seed_auth_identities
from app.config import CORS_ORIGINS, INGEST_MODE, LOCOMOTIVE_TARGETS
from app.kafka_consumer import consume_kafka_forever
from app.db import init_db_schema, wait_for_db
from app.locomotive_client import connect_locomotive_forever, send_chat_to_locomotive
from app.models import now_ms
from app.repository import save_dispatcher_command
from app.routes import admin_users, auth, health, locomotives
from app.state import LocomotiveRuntime, state
from app.ws_server import broadcast_message, send_connection_snapshot, send_locomotive_snapshot

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
    delivered = await send_chat_to_locomotive(locomotive_id, body)
    event["delivered"] = delivered
    state.chat_history[locomotive_id].append(event)
    try:
        save_dispatcher_command(event)
    except Exception as exc:
        logger.warning("Failed to persist dispatcher command: %s", exc)
    await broadcast_message("message.new", event)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not wait_for_db():
        raise RuntimeError("Database not reachable after startup retries")
    init_db_schema()
    seed_auth_identities()

    for target in LOCOMOTIVE_TARGETS:
        state.locomotives[target.locomotive_id] = LocomotiveRuntime(target=target)

    tasks = []
    if INGEST_MODE in ("ws", "hybrid"):
        tasks.extend(
            asyncio.create_task(connect_locomotive_forever(target), name=f"loco-{target.locomotive_id}")
            for target in LOCOMOTIVE_TARGETS
        )
    if INGEST_MODE in ("kafka", "hybrid"):
        tasks.append(asyncio.create_task(consume_kafka_forever(), name="kafka-consumer"))

    logger.info(
        "Dispatcher started with ingest mode=%s and %d locomotive targets",
        INGEST_MODE,
        len(LOCOMOTIVE_TARGETS),
    )

    yield

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(
    title="KTZ Dispatcher Backend",
    description="Realtime dispatcher backend that bridges multiple locomotive telemetry streams.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(enforce_http_auth)

app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(health.router)
app.include_router(locomotives.router)


@app.get("/ping")
def ping() -> dict:
    return {"status": "ok"}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    auth_context = await authorize_websocket(websocket)
    if auth_context is None:
        return

    await websocket.accept()
    state.register_client(websocket)
    if auth_context.role == "train" and auth_context.locomotive_id:
        state.set_subscription(websocket, auth_context.locomotive_id)
    await send_connection_snapshot(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type", "")
                payload = msg.get("payload", {})
                if msg_type == "dispatcher.chat" and isinstance(payload, dict):
                    if auth_context.can_use_dispatcher_console:
                        requested_locomotive = str(payload.get("locomotiveId") or payload.get("locomotive_id") or "").strip()
                        if not requested_locomotive:
                            continue
                        require_locomotive_access(auth_context, requested_locomotive)
                        await _handle_dispatcher_command(payload)
                elif msg_type == "subscribe":
                    requested = None
                    if isinstance(payload, dict):
                        requested = payload.get("locomotiveId") or payload.get("locomotive_id")

                    if auth_context.role == "train":
                        locomotive_id = auth_context.locomotive_id
                        state.set_subscription(websocket, locomotive_id)
                        if locomotive_id:
                            await send_locomotive_snapshot(websocket, locomotive_id)
                        continue

                    if requested in ("all", "*", "", None):
                        requested_subscription = "*" if requested else None
                        state.set_subscription(websocket, requested_subscription)
                        if requested in ("all", "*"):
                            for locomotive_id in state.locomotives.keys():
                                await send_locomotive_snapshot(websocket, locomotive_id)
                    else:
                        locomotive_id = str(requested).strip()
                        require_locomotive_access(auth_context, locomotive_id)
                        state.set_subscription(websocket, locomotive_id)
                        await send_locomotive_snapshot(websocket, locomotive_id)
            except json.JSONDecodeError:
                continue
    except WebSocketDisconnect:
        pass
    finally:
        state.unregister_client(websocket, reason="client_disconnected")
