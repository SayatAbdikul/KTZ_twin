from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.auth import get_request_auth, require_admin
from app.models import make_response
from app.thresholds import (
    ThresholdValidationError,
    get_threshold_config,
    update_threshold_config,
)

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/thresholds")
def get_thresholds(request: Request) -> dict:
    require_admin(get_request_auth(request))
    return make_response(get_threshold_config())


@router.put("/thresholds")
def put_thresholds(payload: dict, request: Request) -> dict:
    require_admin(get_request_auth(request))
    try:
        updated = update_threshold_config(payload)
    except ThresholdValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return make_response(updated)
