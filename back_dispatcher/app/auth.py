from __future__ import annotations

import os

from fastapi import WebSocket
from fastapi.responses import JSONResponse

from app.models import now_ms

API_KEY = os.getenv("API_KEY", "ktz-demo-key")
UNAUTHORIZED_ERROR = {
    "error": {
        "code": "UNAUTHORIZED",
        "message": "A valid API key is required for this endpoint.",
    }
}


def _is_valid_api_key(api_key: str | None) -> bool:
    return bool(API_KEY) and api_key == API_KEY


async def enforce_http_api_key(request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
        return await call_next(request)

    api_key = request.headers.get("X-API-Key")
    if _is_valid_api_key(api_key):
        return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={
            **UNAUTHORIZED_ERROR,
            "timestamp": now_ms(),
        },
    )


async def authorize_websocket(websocket: WebSocket) -> bool:
    if _is_valid_api_key(websocket.query_params.get("apiKey")):
        return True

    await websocket.close(code=1008, reason="Unauthorized")
    return False
