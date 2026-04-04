"""
Telemetry simulator — random-walk value generator.

Algorithm matches front_locomotive/src/mocks/data/telemetryFixtures.ts exactly:
  delta = (random() - DRIFT_BIAS) * range * DRIFT_SCALE
  next  = clamp(prev + delta, min, max)

This produces a smooth, realistic-looking drift with a slight upward tendency.
"""

from __future__ import annotations

import random

from app.config import METRIC_DEFINITIONS, DRIFT_BIAS, DRIFT_SCALE, LOCOMOTIVE_ID
from app.models import MetricReading, TelemetryFrame, now_ms
from app.state import state


def _next_value(metric_id: str, min_val: float, max_val: float) -> float:
    """Advance one metric value by one random-walk step."""
    prev = state.current_values.get(metric_id, (min_val + max_val) / 2.0)
    delta = (random.random() - DRIFT_BIAS) * (max_val - min_val) * DRIFT_SCALE
    next_val = max(min_val, min(max_val, prev + delta))
    state.current_values[metric_id] = next_val
    return next_val


def _quality(value: float, metric: dict) -> str:
    """Return data quality based on threshold position."""
    crit_low = metric.get("criticalLow")
    crit_high = metric.get("criticalHigh")
    if (crit_low is not None and value <= crit_low) or (
        crit_high is not None and value >= crit_high
    ):
        return "suspect"
    return "good"


def generate_frame() -> TelemetryFrame:
    """
    Generate one TelemetryFrame with all 14 metric readings.
    Updates state.current_values and appends to state.history_buffer.
    """
    ts = now_ms()
    readings: list[MetricReading] = []

    for metric in METRIC_DEFINITIONS:
        mid = metric["metricId"]
        value = _next_value(mid, metric["min"], metric["max"])

        readings.append(
            MetricReading(
                metric_id=mid,
                value=value,
                unit=metric["unit"],
                timestamp=ts,
                quality=_quality(value, metric),  # type: ignore[arg-type]
            )
        )

        # Append to ring buffer for history queries
        state.history_buffer[mid].append((ts, value))

    frame = TelemetryFrame(
        locomotive_id=LOCOMOTIVE_ID,
        frame_id=state.next_frame_id(),
        timestamp=ts,
        readings=readings,
    )
    state.current_frame = frame
    return frame
