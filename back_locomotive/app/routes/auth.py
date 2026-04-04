from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auth import (
    authenticate_admin,
    authenticate_train,
    create_access_token,
    seeded_account_summary,
    serialize_auth_context,
)
from app.models import now_ms

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    role: str
    username: str | None = None
    train_id: str | None = Field(default=None, alias="trainId")
    password: str


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    role = payload.role.strip().lower()

    if role == "admin":
        username = (payload.username or "").strip()
        auth = authenticate_admin(username, payload.password)
    elif role == "train":
        train_id = (payload.train_id or "").strip().upper()
        auth = authenticate_train(train_id, payload.password)
    else:
        auth = None

    if auth is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "data": {
            "token": create_access_token(auth),
            "user": serialize_auth_context(auth),
            "seededAccounts": seeded_account_summary(),
        },
        "timestamp": now_ms(),
    }
