from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse

from app.config import LOCOMOTIVE_ID
from app.models import now_ms

API_KEY = os.getenv("API_KEY", "ktz-demo-key")
AUTH_TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "ktz-demo-auth-secret")
UNAUTHORIZED_CODE = "UNAUTHORIZED"
PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED"


@dataclass(frozen=True)
class AuthContext:
    role: Literal["admin", "dispatcher", "regular_train", "service"]
    subject: str
    user_id: int | None = None
    session_id: str | None = None
    username: str | None = None
    locomotive_id: str | None = None
    display_name: str | None = None
    status: str | None = None
    must_change_password: bool = False

    @property
    def is_service(self) -> bool:
        return self.role == "service"

    @property
    def is_admin(self) -> bool:
        return self.role in {"admin", "service"}

    def can_access_service_locomotive(self) -> bool:
        return self.is_admin or self.role == "regular_train" and self.locomotive_id == LOCOMOTIVE_ID


def _encode_segment(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_segment(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}")


def _sign(signing_input: str) -> str:
    digest = hmac.new(AUTH_TOKEN_SECRET.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return _encode_segment(digest)


def _decode_access_token(token: str) -> dict[str, object] | None:
    try:
        header, body, signature = token.split(".", 2)
    except ValueError:
        return None

    signing_input = f"{header}.{body}"
    if not hmac.compare_digest(signature, _sign(signing_input)):
        return None

    try:
        payload = json.loads(_decode_segment(body))
    except (ValueError, json.JSONDecodeError):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(time.time()):
        return None

    return payload


def _payload_to_context(payload: dict[str, object]) -> AuthContext | None:
    role = payload.get("role")
    if role == "train":
        role = "regular_train"
    if role not in {"admin", "dispatcher", "regular_train"}:
        return None

    subject = str(payload.get("sub") or "").strip()
    if not subject:
        return None

    user_id = payload.get("uid")
    session_id = payload.get("sid")
    return AuthContext(
        role=role,
        subject=subject,
        user_id=user_id if isinstance(user_id, int) else None,
        session_id=session_id if isinstance(session_id, str) else None,
        username=str(payload.get("username")) if payload.get("username") is not None else None,
        locomotive_id=str(payload.get("locomotiveId")) if payload.get("locomotiveId") is not None else None,
        display_name=str(payload.get("displayName")) if payload.get("displayName") is not None else None,
        status=str(payload.get("status")) if payload.get("status") is not None else None,
        must_change_password=bool(payload.get("mustChangePassword")),
    )


def _service_context() -> AuthContext:
    return AuthContext(role="service", subject="service:api-key", display_name="Internal Service")


def _resolve_auth_context(authorization: str | None, api_key: str | None) -> AuthContext | None:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            payload = _decode_access_token(token.strip())
            if payload is not None:
                decoded = _payload_to_context(payload)
                if decoded is not None:
                    return decoded

    if API_KEY and api_key == API_KEY:
        return _service_context()

    return None


def _ensure_locomotive_access(auth: AuthContext | None) -> AuthContext | None:
    if auth is None:
        return None
    if auth.can_access_service_locomotive():
        return auth
    return None


def _json_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
            },
            "timestamp": now_ms(),
        },
    )


async def enforce_http_auth(request: Request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
        return await call_next(request)

    auth = _ensure_locomotive_access(
        _resolve_auth_context(
            request.headers.get("Authorization"),
            request.headers.get("X-API-Key"),
        )
    )
    if auth is None:
        return _json_error(401, UNAUTHORIZED_CODE, "A valid bearer token is required for this endpoint.")

    if auth.must_change_password:
        return _json_error(
            403,
            PASSWORD_CHANGE_REQUIRED_CODE,
            "Password change is required before accessing locomotive resources.",
        )

    request.state.auth = auth
    return await call_next(request)


def get_request_auth(request: Request | WebSocket) -> AuthContext:
    auth = getattr(request.state, "auth", None)
    if isinstance(auth, AuthContext):
        return auth
    raise HTTPException(status_code=401, detail="Authentication context missing")


def require_admin(auth: AuthContext) -> None:
    if auth.is_admin:
        return
    raise HTTPException(status_code=403, detail="Admin role is required for this action.")


async def authorize_websocket(websocket: WebSocket) -> AuthContext | None:
    auth = _ensure_locomotive_access(
        _resolve_auth_context(
            websocket.headers.get("Authorization"),
            websocket.query_params.get("apiKey"),
        )
    )
    if auth is None:
        token = websocket.query_params.get("token")
        if token:
            payload = _decode_access_token(token)
            if payload is not None:
                auth = _ensure_locomotive_access(_payload_to_context(payload))

    if auth is None:
        await websocket.close(code=1008, reason="Unauthorized")
        return None

    if auth.must_change_password:
        await websocket.close(code=1008, reason="Password change required")
        return None

    websocket.state.auth = auth
    return auth
