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

from app.models import now_ms

API_KEY = os.getenv("API_KEY", "ktz-demo-key")
AUTH_TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "ktz-demo-auth-secret")
AUTH_TOKEN_TTL_S = int(os.getenv("AUTH_TOKEN_TTL_S", "43200"))

SEEDED_ADMIN_USERS = (
    {
        "username": "admin",
        "password": "RailCore!4821",
        "display_name": "KTZ Administrator",
    },
)

SEEDED_TRAIN_USERS = (
    {
        "train_id": "KTZ-2001",
        "password": "AxleNorth!2714",
        "display_name": "Train KTZ-2001",
    },
    {
        "train_id": "KTZ-BRK-001",
        "password": "BrakeHold!4832",
        "display_name": "Broken Stop Pattern Train",
    },
    {
        "train_id": "KTZ-PNE-002",
        "password": "PipeLoss!1946",
        "display_name": "Pneumatic Pressure Loss Pattern Train",
    },
    {
        "train_id": "KTZ-OIL-003",
        "password": "OilStarve!6621",
        "display_name": "Oil Starvation Pattern Train",
    },
    {
        "train_id": "KTZ-THM-004",
        "password": "HeatRun!3508",
        "display_name": "Thermal Runaway Pattern Train",
    },
    {
        "train_id": "KTZ-DRV-005",
        "password": "DriveLag!7215",
        "display_name": "High Current Low Acceleration Pattern Train",
    },
    {
        "train_id": "KTZ-VLT-006",
        "password": "VoltDip!5804",
        "display_name": "Voltage Dip Under Load Pattern Train",
    },
    {
        "train_id": "KTZ-AMP-007",
        "password": "AmpSpike!9137",
        "display_name": "Traction Overcurrent Pattern Train",
    },
    {
        "train_id": "KTZ-FUL-008",
        "password": "FuelDrop!2085",
        "display_name": "Fuel Starvation Pattern Train",
    },
    {
        "train_id": "KTZ-BRN-009",
        "password": "BurnRate!4479",
        "display_name": "Inefficient Burn Pattern Train",
    },
    {
        "train_id": "KTZ-MIX-010",
        "password": "MixedFault!6312",
        "display_name": "Compound Brake and Oil Fault Pattern Train",
    },
)

UNAUTHORIZED_CODE = "UNAUTHORIZED"
FORBIDDEN_CODE = "FORBIDDEN"


@dataclass(frozen=True)
class AuthContext:
    role: Literal["admin", "train", "service"]
    subject: str
    username: str | None = None
    train_id: str | None = None
    display_name: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role in {"admin", "service"}

    def can_access_locomotive(self, locomotive_id: str) -> bool:
        return self.is_admin or self.train_id == locomotive_id


def _encode_segment(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_segment(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}")


def _sign(body: str) -> str:
    digest = hmac.new(AUTH_TOKEN_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return _encode_segment(digest)


def _build_token(payload: dict[str, object]) -> str:
    body = _encode_segment(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def _payload_to_context(payload: dict[str, object]) -> AuthContext | None:
    role = payload.get("role")
    if role not in {"admin", "train"}:
        return None

    subject = str(payload.get("sub") or "").strip()
    if not subject:
        return None

    username = payload.get("username")
    train_id = payload.get("trainId")
    display_name = payload.get("displayName")
    return AuthContext(
        role=role,
        subject=subject,
        username=str(username) if username else None,
        train_id=str(train_id) if train_id else None,
        display_name=str(display_name) if display_name else None,
    )


def create_access_token(auth: AuthContext) -> str:
    now_s = int(time.time())
    return _build_token(
        {
            "sub": auth.subject,
            "role": auth.role,
            "username": auth.username,
            "trainId": auth.train_id,
            "displayName": auth.display_name,
            "iat": now_s,
            "exp": now_s + AUTH_TOKEN_TTL_S,
        }
    )


def decode_access_token(token: str) -> AuthContext | None:
    try:
        body, signature = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = _sign(body)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(_decode_segment(body))
    except (ValueError, json.JSONDecodeError):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(time.time()):
        return None

    return _payload_to_context(payload)


def authenticate_admin(username: str, password: str) -> AuthContext | None:
    for admin in SEEDED_ADMIN_USERS:
        if admin["username"] == username and admin["password"] == password:
            return AuthContext(
                role="admin",
                subject=f"admin:{username}",
                username=username,
                display_name=admin["display_name"],
            )
    return None


def authenticate_train(train_id: str, password: str) -> AuthContext | None:
    for train in SEEDED_TRAIN_USERS:
        if train["train_id"] == train_id and train["password"] == password:
            return AuthContext(
                role="train",
                subject=f"train:{train_id}",
                train_id=train_id,
                display_name=train["display_name"],
            )
    return None


def serialize_auth_context(auth: AuthContext) -> dict[str, object]:
    return {
        "role": auth.role,
        "username": auth.username,
        "trainId": auth.train_id,
        "displayName": auth.display_name,
    }


def seeded_account_summary() -> dict[str, object]:
    return {
        "admins": [
            {
                "username": admin["username"],
                "displayName": admin["display_name"],
            }
            for admin in SEEDED_ADMIN_USERS
        ],
        "trains": [
            {
                "trainId": train["train_id"],
                "displayName": train["display_name"],
            }
            for train in SEEDED_TRAIN_USERS
        ],
    }


def _service_context() -> AuthContext:
    return AuthContext(role="service", subject="service:api-key", display_name="Internal Service")


def _unauthorized_response(message: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": UNAUTHORIZED_CODE,
                "message": message,
            },
            "timestamp": now_ms(),
        },
    )


def _resolve_auth_context(authorization: str | None, api_key: str | None) -> AuthContext | None:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            decoded = decode_access_token(token.strip())
            if decoded is not None:
                return decoded

    if API_KEY and api_key == API_KEY:
        return _service_context()

    return None


async def enforce_http_auth(request: Request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
        return await call_next(request)

    if request.url.path == "/api/auth/login":
        return await call_next(request)

    auth = _resolve_auth_context(
        request.headers.get("Authorization"),
        request.headers.get("X-API-Key"),
    )
    if auth is None:
        return _unauthorized_response("A valid bearer token is required for this endpoint.")

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
    raise HTTPException(status_code=403, detail="Admin role is required for this action")


def require_locomotive_access(auth: AuthContext, locomotive_id: str) -> None:
    if auth.can_access_locomotive(locomotive_id):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this locomotive")


async def authorize_websocket(websocket: WebSocket) -> AuthContext | None:
    auth = _resolve_auth_context(
        websocket.headers.get("Authorization"),
        websocket.query_params.get("apiKey"),
    )

    if auth is None:
        token = websocket.query_params.get("token")
        if token:
            auth = decode_access_token(token)

    if auth is not None:
        websocket.state.auth = auth
        return auth

    await websocket.close(code=1008, reason="Unauthorized")
    return None
