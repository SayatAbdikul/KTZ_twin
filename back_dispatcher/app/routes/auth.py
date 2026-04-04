from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from app.auth import (
    auth_response_payload,
    authenticate_credentials,
    change_password,
    clear_refresh_cookie,
    get_current_user,
    get_refresh_cookie,
    get_request_auth,
    logout_refresh_session,
    refresh_session,
    set_refresh_cookie,
)
from app.models import now_ms

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    identifier: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(alias="newPassword")


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response) -> dict:
    bundle = authenticate_credentials(
        payload.identifier,
        payload.password,
        user_agent=request.headers.get("User-Agent"),
        ip_address=_client_ip(request),
    )
    set_refresh_cookie(response, bundle.refresh_token)
    return {
        "data": auth_response_payload(bundle),
        "timestamp": now_ms(),
    }


@router.post("/refresh")
def refresh(request: Request, response: Response) -> dict:
    bundle = refresh_session(
        get_refresh_cookie(request),
        user_agent=request.headers.get("User-Agent"),
        ip_address=_client_ip(request),
    )
    set_refresh_cookie(response, bundle.refresh_token)
    return {
        "data": auth_response_payload(bundle),
        "timestamp": now_ms(),
    }


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    logout_refresh_session(get_refresh_cookie(request))
    clear_refresh_cookie(response)
    return {
        "data": {"ok": True},
        "timestamp": now_ms(),
    }


@router.get("/me")
def me(request: Request) -> dict:
    auth = get_request_auth(request)
    user = get_current_user(auth)
    return {
        "data": {
            "user": user,
            "mustChangePassword": bool(user.get("mustChangePassword")),
        },
        "timestamp": now_ms(),
    }


@router.post("/change-password")
def update_password(payload: ChangePasswordRequest, request: Request, response: Response) -> dict:
    bundle = change_password(
        get_request_auth(request),
        current_password=payload.current_password,
        new_password=payload.new_password,
        user_agent=request.headers.get("User-Agent"),
        ip_address=_client_ip(request),
    )
    set_refresh_cookie(response, bundle.refresh_token)
    return {
        "data": auth_response_payload(bundle),
        "timestamp": now_ms(),
    }
