from __future__ import annotations

import csv
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from io import StringIO

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import LOCOMOTIVE_ID
from app.models import Alert, now_ms
from app.state import state
from app.thresholds import get_effective_metric_by_id

router = APIRouter(prefix="/api/export", tags=["export"])

TELEMETRY_COLUMNS = [
    "locomotiveId",
    "timestampMs",
    "timestampIso",
    "metricId",
    "metricLabel",
    "metricGroup",
    "value",
    "unit",
]
ALERT_COLUMNS = [
    "alertId",
    "severity",
    "status",
    "source",
    "title",
    "description",
    "recommendedAction",
    "triggeredAtMs",
    "triggeredAtIso",
    "acknowledgedAtMs",
    "acknowledgedBy",
    "resolvedAtMs",
    "relatedMetricIds",
]
ALERT_SEVERITY_ORDER: dict[str, int] = {
    "critical": 0,
    "warning": 1,
    "info": 2,
}


def _format_timestamp_iso(timestamp_ms: int | None) -> str:
    if timestamp_ms is None:
        return ""
    return (
        datetime.fromtimestamp(timestamp_ms / 1000, tz=UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _filename(kind: str, generated_at: int) -> str:
    stamp = datetime.fromtimestamp(generated_at / 1000, tz=UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{LOCOMOTIVE_ID}_{kind}_{stamp}.csv"


def _csv_stream(header: list[str], rows: Iterable[Iterable[object]]) -> Iterator[str]:
    buffer = StringIO()
    writer = csv.writer(buffer)

    writer.writerow(header)
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)

    for row in rows:
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def _csv_response(kind: str, generated_at: int, header: list[str], rows: Iterable[Iterable[object]]) -> StreamingResponse:
    filename = _filename(kind, generated_at)
    return StreamingResponse(
        _csv_stream(header, rows),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _telemetry_rows() -> Iterator[list[object]]:
    metric_by_id = get_effective_metric_by_id()
    populated_metric_ids = sorted(
        metric_id
        for metric_id, samples in state.history_buffer.items()
        if samples
    )

    for metric_id in populated_metric_ids:
        definition = metric_by_id.get(metric_id, {})
        samples = sorted(state.history_buffer[metric_id], key=lambda sample: sample[0])
        for timestamp_ms, value in samples:
            yield [
                LOCOMOTIVE_ID,
                timestamp_ms,
                _format_timestamp_iso(timestamp_ms),
                metric_id,
                definition.get("label", metric_id),
                definition.get("group", ""),
                value,
                definition.get("unit", ""),
            ]


def _sorted_alerts() -> list[Alert]:
    return sorted(
        state.alerts,
        key=lambda alert: (
            ALERT_SEVERITY_ORDER.get(alert.severity, 99),
            -alert.triggered_at,
        ),
    )


def _alert_rows() -> Iterator[list[object]]:
    for alert in _sorted_alerts():
        yield [
            alert.alert_id,
            alert.severity,
            alert.status,
            alert.source,
            alert.title,
            alert.description,
            alert.recommended_action or "",
            alert.triggered_at,
            _format_timestamp_iso(alert.triggered_at),
            alert.acknowledged_at or "",
            alert.acknowledged_by or "",
            alert.resolved_at or "",
            ",".join(alert.related_metric_ids),
        ]


@router.get("/telemetry/csv")
def export_telemetry_csv() -> StreamingResponse:
    generated_at = now_ms()
    return _csv_response("telemetry", generated_at, TELEMETRY_COLUMNS, _telemetry_rows())


@router.get("/alerts/csv")
def export_alerts_csv() -> StreamingResponse:
    generated_at = now_ms()
    return _csv_response("alerts", generated_at, ALERT_COLUMNS, _alert_rows())
