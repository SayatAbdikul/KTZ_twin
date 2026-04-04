from __future__ import annotations

from collections import defaultdict
from typing import Any, Literal

from sqlalchemy import BigInteger, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.db import session_scope
from app.db_models import AlertEvent, DispatcherCommand, HealthSnapshot, IncomingMessage, TelemetryPoint

ReplayResolution = Literal["raw", "1s", "10s", "1m", "5m"]

_RESOLUTION_BUCKET_MS: dict[str, int] = {
    "1s": 1_000,
    "10s": 10_000,
    "1m": 60_000,
    "5m": 300_000,
}
_SEVERITY_RANK = {"critical": 0, "warning": 1, "info": 2}


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


def save_telemetry_frame(payload: dict[str, Any], source_event_id: str | None = None) -> int:
    locomotive_id = str(payload.get("locomotive_id") or payload.get("locomotiveId") or "")
    if not locomotive_id:
        return 0

    frame_id = payload.get("frame_id") or payload.get("frameId")
    ts_default = int(payload.get("timestamp") or 0)

    rows: list[dict[str, Any]] = []
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

        rows.append(
            {
                "locomotive_id": locomotive_id,
                "metric_id": metric_id,
                "ts": int(reading.get("timestamp") or ts_default),
                "value": value,
                "unit": str(reading.get("unit")) if reading.get("unit") is not None else None,
                "quality": str(reading.get("quality")) if reading.get("quality") is not None else None,
                "frame_id": str(frame_id) if frame_id is not None else None,
                "source_event_id": source_event_id,
            }
        )

    if not rows:
        return 0

    with session_scope() as session:
        stmt = insert(TelemetryPoint).values(rows)
        if source_event_id:
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["source_event_id", "metric_id"],
                index_where=TelemetryPoint.source_event_id.is_not(None),
            )
        result = session.execute(stmt)
        return int(result.rowcount or 0)


def save_health_snapshot(
    locomotive_id: str,
    timestamp_ms: int,
    source_event_id: str | None,
    payload: dict[str, Any],
) -> None:
    if not locomotive_id or not source_event_id:
        return

    with session_scope() as session:
        stmt = (
            insert(HealthSnapshot)
            .values(
                locomotive_id=locomotive_id,
                ts=timestamp_ms,
                source_event_id=source_event_id,
                payload=payload,
            )
            .on_conflict_do_nothing(index_elements=["source_event_id"])
        )
        session.execute(stmt)


def prune_telemetry(cutoff_ts_ms: int) -> int:
    with session_scope() as session:
        result = session.execute(delete(TelemetryPoint).where(TelemetryPoint.ts < cutoff_ts_ms))
        return int(result.rowcount or 0)


def prune_health_snapshots(cutoff_ts_ms: int) -> int:
    with session_scope() as session:
        result = session.execute(delete(HealthSnapshot).where(HealthSnapshot.ts < cutoff_ts_ms))
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


def get_replay_time_range(locomotive_id: str) -> tuple[int | None, int | None]:
    with session_scope() as session:
        earliest, latest = session.query(
            func.min(TelemetryPoint.ts),
            func.max(TelemetryPoint.ts),
        ).filter(TelemetryPoint.locomotive_id == locomotive_id).one()

    return (
        int(earliest) if earliest is not None else None,
        int(latest) if latest is not None else None,
    )


def get_replay_range(
    locomotive_id: str,
    from_ts_ms: int,
    to_ts_ms: int,
    metric_ids: list[str] | None,
    resolution: ReplayResolution,
) -> dict[str, list[dict[str, float | int]]]:
    with session_scope() as session:
        if resolution == "raw":
            query = session.query(TelemetryPoint).filter(
                TelemetryPoint.locomotive_id == locomotive_id,
                TelemetryPoint.ts >= from_ts_ms,
                TelemetryPoint.ts <= to_ts_ms,
            )
            if metric_ids:
                query = query.filter(TelemetryPoint.metric_id.in_(metric_ids))

            rows = query.order_by(TelemetryPoint.metric_id.asc(), TelemetryPoint.ts.asc()).all()

            grouped: dict[str, list[dict[str, float | int]]] = defaultdict(list)
            for row in rows:
                grouped[row.metric_id].append({"timestamp": row.ts, "value": row.value})
            return dict(grouped)

        bucket_ms = _RESOLUTION_BUCKET_MS[resolution]
        bucket_expr = cast(
            func.floor(TelemetryPoint.ts / bucket_ms) * bucket_ms,
            BigInteger,
        ).label("bucket_ts")

        query = (
            session.query(
                TelemetryPoint.metric_id.label("metric_id"),
                bucket_expr,
                func.avg(TelemetryPoint.value).label("avg_value"),
            )
            .filter(
                TelemetryPoint.locomotive_id == locomotive_id,
                TelemetryPoint.ts >= from_ts_ms,
                TelemetryPoint.ts <= to_ts_ms,
            )
        )
        if metric_ids:
            query = query.filter(TelemetryPoint.metric_id.in_(metric_ids))

        rows = (
            query.group_by(TelemetryPoint.metric_id, bucket_expr)
            .order_by(TelemetryPoint.metric_id.asc(), bucket_expr.asc())
            .all()
        )

    grouped: dict[str, list[dict[str, float | int]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.metric_id)].append(
            {
                "timestamp": int(row.bucket_ts),
                "value": float(row.avg_value),
            }
        )
    return dict(grouped)


def get_replay_snapshot(
    locomotive_id: str,
    timestamp_ms: int,
) -> dict[str, Any]:
    latest_reading_subquery = (
        select(
            TelemetryPoint.metric_id.label("metric_id"),
            TelemetryPoint.ts.label("ts"),
            TelemetryPoint.value.label("value"),
            TelemetryPoint.unit.label("unit"),
            TelemetryPoint.quality.label("quality"),
            func.row_number()
            .over(partition_by=TelemetryPoint.metric_id, order_by=TelemetryPoint.ts.desc())
            .label("rn"),
        )
        .where(
            TelemetryPoint.locomotive_id == locomotive_id,
            TelemetryPoint.ts <= timestamp_ms,
        )
        .subquery()
    )

    with session_scope() as session:
        telemetry_rows = session.execute(
            select(
                latest_reading_subquery.c.metric_id,
                latest_reading_subquery.c.ts,
                latest_reading_subquery.c.value,
                latest_reading_subquery.c.unit,
                latest_reading_subquery.c.quality,
            )
            .where(latest_reading_subquery.c.rn == 1)
            .order_by(latest_reading_subquery.c.metric_id.asc())
        ).all()

        health_row = (
            session.query(HealthSnapshot)
            .filter(
                HealthSnapshot.locomotive_id == locomotive_id,
                HealthSnapshot.ts <= timestamp_ms,
            )
            .order_by(HealthSnapshot.ts.desc())
            .first()
        )

        alert_rows = (
            session.query(AlertEvent)
            .filter(
                AlertEvent.locomotive_id == locomotive_id,
                AlertEvent.seen_at <= timestamp_ms,
            )
            .order_by(AlertEvent.seen_at.asc(), AlertEvent.id.asc())
            .all()
        )

        health_payload = dict(health_row.payload) if health_row is not None else None
        alert_events = [
            {
                "event_type": row.event_type,
                "alert_id": row.alert_id,
                "payload": dict(row.payload or {}),
            }
            for row in alert_rows
        ]

    telemetry_payload = None
    if telemetry_rows:
        latest_frame_ts = max(int(row.ts) for row in telemetry_rows)
        telemetry_payload = {
            "locomotiveId": locomotive_id,
            "frameId": f"replay-{locomotive_id}-{latest_frame_ts}",
            "timestamp": latest_frame_ts,
            "readings": [
                {
                    "metricId": str(row.metric_id),
                    "value": float(row.value),
                    "unit": row.unit or "",
                    "timestamp": int(row.ts),
                    "quality": row.quality or "good",
                }
                for row in telemetry_rows
            ],
        }

    active_alerts: dict[str, dict[str, Any]] = {}
    for row in alert_events:
        payload = row["payload"]
        if row["event_type"] in {"alert.new", "alert.update"}:
            alert_id = str(payload.get("alert_id") or payload.get("alertId") or row["alert_id"])
            if alert_id:
                active_alerts[alert_id] = payload
        elif row["event_type"] == "alert.resolved":
            alert_id = str(payload.get("alert_id") or payload.get("alertId") or row["alert_id"])
            active_alerts.pop(alert_id, None)

    alerts = sorted(
        active_alerts.values(),
        key=lambda alert: (
            _SEVERITY_RANK.get(str(alert.get("severity")), 99),
            -int(alert.get("triggered_at") or alert.get("triggeredAt") or 0),
        ),
    )

    return {
        "locomotiveId": locomotive_id,
        "timestamp": timestamp_ms,
        "telemetry": telemetry_payload,
        "health": health_payload,
        "alerts": alerts,
    }
