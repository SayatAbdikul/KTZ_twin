from __future__ import annotations

import asyncio
import csv
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.config import FRONTEND_LOCOMOTIVE_ID, LOOP_REPLAY, REPLAY_SPEED, TELEMETRY_CSV_PATH
from app.models import now_ms
from app.replay.kafka_publisher import KafkaPublisher
from app.replay.mappers import frontend_frame, frontend_metric_values, normalize_csv_row, raw_event_payload
from app.state import state
from app.ws.broadcaster import broadcast_message

logger = logging.getLogger(__name__)


def load_csv_rows(path: str | Path | None = None) -> dict[str, list[dict[str, Any]]]:
    csv_path = Path(path or TELEMETRY_CSV_PATH)
    if not csv_path.exists():
        raise FileNotFoundError(f"Telemetry CSV not found: {csv_path}")

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            normalized = normalize_csv_row(row)
            grouped[normalized["locomotive_id"]].append(normalized)

    for locomotive_id, rows in grouped.items():
        rows.sort(key=lambda item: item["timestamp_ms"])
        _validate_increasing_timestamps(locomotive_id, rows)

    state.loaded_locomotive_ids = sorted(grouped)
    state.default_frontend_locomotive_id = FRONTEND_LOCOMOTIVE_ID or (
        state.loaded_locomotive_ids[0] if state.loaded_locomotive_ids else None
    )
    logger.info("Loaded %d locomotives from %s", len(grouped), csv_path)
    return grouped


def _validate_increasing_timestamps(locomotive_id: str, rows: list[dict[str, Any]]) -> None:
    prev_ts: int | None = None
    for row in rows:
        ts = row["timestamp_ms"]
        if prev_ts is not None and ts <= prev_ts:
            raise ValueError(f"Non-increasing timestamps for {locomotive_id}")
        prev_ts = ts


async def prime_initial_state(rows_by_locomotive: dict[str, list[dict[str, Any]]]) -> None:
    for locomotive_id, rows in rows_by_locomotive.items():
        if not rows:
            continue
        await _apply_row(rows[0], publish=False, broadcast=False)
        logger.info("Primed replay state for %s with %d rows", locomotive_id, len(rows))


async def run_replay_loops(
    rows_by_locomotive: dict[str, list[dict[str, Any]]],
    publisher: KafkaPublisher,
) -> None:
    for locomotive_id, rows in rows_by_locomotive.items():
        task = asyncio.create_task(_replay_locomotive(locomotive_id, rows, publisher), name=f"replay-{locomotive_id}")
        state.replay_tasks[locomotive_id] = task


async def stop_replay_loops() -> None:
    tasks = list(state.replay_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    state.replay_tasks.clear()


async def _replay_locomotive(
    locomotive_id: str,
    rows: list[dict[str, Any]],
    publisher: KafkaPublisher,
) -> None:
    if not rows:
        return

    while True:
        previous_ts: int | None = None
        for row in rows:
            if previous_ts is not None:
                delta_ms = max(0, row["timestamp_ms"] - previous_ts)
                await asyncio.sleep(delta_ms / 1000.0 / max(REPLAY_SPEED, 0.001))
            await _apply_row(row, publish=True, broadcast=True, publisher=publisher)
            previous_ts = row["timestamp_ms"]

        if not LOOP_REPLAY:
            logger.info("Replay complete for %s", locomotive_id)
            return

        logger.info("Restarting replay loop for %s", locomotive_id)


async def _apply_row(
    row: dict[str, Any],
    publish: bool,
    broadcast: bool,
    publisher: KafkaPublisher | None = None,
) -> None:
    locomotive_id = row["locomotive_id"]
    state.latest_rows[locomotive_id] = row

    frame = frontend_frame(row, await state.next_frame_id())
    state.current_frames[locomotive_id] = frame
    for metric_id, value in frontend_metric_values(row):
        state.current_values[locomotive_id][metric_id] = value
        state.history_buffer[locomotive_id][metric_id].append((row["timestamp_ms"], value))

    if publish and publisher is not None:
        event = raw_event_payload(row, emitted_at_ms=now_ms())
        await publisher.publish_telemetry(locomotive_id, event)

    if broadcast:
        await broadcast_message("telemetry.frame", frame.model_dump(by_alias=True), locomotive_id=locomotive_id)
