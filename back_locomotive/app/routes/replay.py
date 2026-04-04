from __future__ import annotations

from fastapi import APIRouter

from app.models import make_response


router = APIRouter(prefix="/api/replay", tags=["replay"])


@router.get("/status")
def get_replay_status() -> dict:
    return make_response({"enabled": False, "message": "Replay endpoints are not implemented in this stack."})
