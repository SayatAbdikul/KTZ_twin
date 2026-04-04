from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.auth import (
    create_user_account,
    get_request_auth,
    list_users,
    require_admin,
    reset_user_password,
    update_user_account,
)
from app.models import now_ms

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


class CreateUserRequest(BaseModel):
    role: Literal["admin", "dispatcher", "train"]
    username: str | None = None
    display_name: str = Field(alias="displayName")
    locomotive_id: str | None = Field(default=None, alias="locomotiveId")


class UpdateUserRequest(BaseModel):
    display_name: str | None = Field(default=None, alias="displayName")
    status: Literal["active", "disabled"] | None = None
    locomotive_id: str | None = Field(default=None, alias="locomotiveId")


@router.get("")
def admin_list_users(request: Request) -> dict:
    require_admin(get_request_auth(request))
    return {
        "data": list_users(),
        "timestamp": now_ms(),
    }


@router.post("")
def admin_create_user(payload: CreateUserRequest, request: Request) -> dict:
    result = create_user_account(
        get_request_auth(request),
        role=payload.role,
        username=payload.username,
        display_name=payload.display_name,
        locomotive_id=payload.locomotive_id,
    )
    return {
        "data": result,
        "timestamp": now_ms(),
    }


@router.patch("/{user_id}")
def admin_update_user(user_id: int, payload: UpdateUserRequest, request: Request) -> dict:
    updated = update_user_account(
        get_request_auth(request),
        user_id,
        display_name=payload.display_name,
        status=payload.status,
        locomotive_id=payload.locomotive_id,
    )
    return {
        "data": updated,
        "timestamp": now_ms(),
    }


@router.post("/{user_id}/reset-password")
def admin_reset_password(user_id: int, request: Request) -> dict:
    result = reset_user_password(get_request_auth(request), user_id)
    return {
        "data": result,
        "timestamp": now_ms(),
    }
