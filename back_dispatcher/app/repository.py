from __future__ import annotations

from typing import Any
from collections import defaultdict

from sqlalchemy import delete

from app.db import session_scope
from app.db_models import AlertEvent, DispatcherCommand, IncomingMessage, TelemetryPoint


def save_dispatcher_command(event: dict[str, Any]) -> None:
    command_id = str(event.get("message_id") or "")
    if not command_id:
        return

    with session_scope() as session:
        existing = session.query(DispatcherCommand).filter(DispatcherCommand.command_id == command_id).first()
        if existing is not None:
            existing.delivered = bool(event.get("delivered", False))
            existing.payload = event
            return

        session.add(
            DispatcherCommand(
                command_id=command_id,
                locomotive_id=str(event.get("locomotive_id") or "unknown"),
                body=str(event.get("body") or ""),
                sender=str(event.get("sender") or "dispatcher"),
                sent_at=int(event.get("sent_at") or 0),
                delivered=bool(event.get("delivered", False)),
                payload=event,
            )
        )


def save_incoming_message(payload: dict[str, Any]) -> None:
    message_id = str(payload.get("message_id") or "")
    if not message_id:
        return

    with session_scope() as session:
        existing = session.query(IncomingMessage).filter(IncomingMessage.message_id == message_id).first()
        if existing is not None:
            existing.payload = payload
            return

        session.add(
            IncomingMessage(
                message_id=message_id,
                locomotive_id=str(payload.get("locomotive_id") or payload.get("locomotiveId") or "unknown"),
                body=str(payload.get("body") or ""),
                sender=str(payload.get("sender") or "locomotive"),
                sent_at=int(payload.get("sent_at") or payload.get("sentAt") or 0),
                payload=payload,
            )
        )


def save_alert_event(event_type: str, payload: dict[str, Any], seen_at: int) -> None:
    alert_id = str(payload.get("alert_id") or payload.get("alertId") or "")
    if not alert_id:
        return

    session_payload = dict(payload)

    with session_scope() as session:
        session.add(
            AlertEvent(
                event_type=event_type,
                alert_id=alert_id,
                locomotive_id=str(payload.get("locomotive_id") or payload.get("locomotiveId") or "unknown"),
                severity=(str(payload.get("severity")) if payload.get("severity") is not None else None),
                status=(str(payload.get("status")) if payload.get("status") is not None else None),
                source=(str(payload.get("source")) if payload.get("source") is not None else None),
                title=(str(payload.get("title")) if payload.get("title") is not None else None),
                description=(str(payload.get("description")) if payload.get("description") is not None else None),
                recommended_action=(
                    str(payload.get("recommended_action") or payload.get("recommendedAction"))
                    if (payload.get("recommended_action") is not None or payload.get("recommendedAction") is not None)
                    else None
                ),
                triggered_at=(
                    int(payload.get("triggered_at") or payload.get("triggeredAt"))
                    if (payload.get("triggered_at") is not None or payload.get("triggeredAt") is not None)
                    else None
                ),
                resolved_at=(
                    int(payload.get("resolved_at") or payload.get("resolvedAt"))
                    if (payload.get("resolved_at") is not None or payload.get("resolvedAt") is not None)
                    else None
                ),
                seen_at=seen_at,
                payload=session_payload,
            )
        )


def save_telemetry_frame(payload: dict[str, Any]) -> None:
    locomotive_id = str(payload.get("locomotive_id") or payload.get("locomotiveId") or "")
    if not locomotive_id:
        return

    frame_id = payload.get("frame_id") or payload.get("frameId")
    ts_default = int(payload.get("timestamp") or 0)

    points: list[TelemetryPoint] = []
    for reading in payload.get("readings", []):
        if not isinstance(reading, dict):
            continue
        metric_id = str(reading.get("metric_id") or reading.get("metricId") or "")
        if not metric_id:
            continue
        try:
            value = float(reading.get("value"))
        except (TypeError, ValueError):
            continue

        reading_ts = int(reading.get("timestamp") or ts_default)
        points.append(
            TelemetryPoint(
                locomotive_id=locomotive_id,
                metric_id=metric_id,
                ts=reading_ts,
                value=value,
                unit=(str(reading.get("unit")) if reading.get("unit") is not None else None),
                quality=(str(reading.get("quality")) if reading.get("quality") is not None else None),
                frame_id=(str(frame_id) if frame_id is not None else None),
            )
        )

    if not points:
        return

    with session_scope() as session:
        session.bulk_save_objects(points)


def prune_telemetry(cutoff_ts_ms: int) -> int:
    with session_scope() as session:
        result = session.execute(delete(TelemetryPoint).where(TelemetryPoint.ts < cutoff_ts_ms))
        return int(result.rowcount or 0)


def get_recent_telemetry(
    locomotive_id: str,
    since_ts_ms: int,
    metric_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    with session_scope() as session:
        query = session.query(TelemetryPoint).filter(
            TelemetryPoint.locomotive_id == locomotive_id,
            TelemetryPoint.ts >= since_ts_ms,
        )
        if metric_id:
            query = query.filter(TelemetryPoint.metric_id == metric_id)

        rows = query.order_by(TelemetryPoint.ts.asc()).all()

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row.metric_id].append(
            {
                "timestamp": row.ts,
                "value": row.value,
                "unit": row.unit,
                "quality": row.quality,
            }
        )
    return dict(grouped)
