"""
Telemetry simulator for locomotive dashboarding.

Raw samples are generated at `RAW_TELEMETRY_INTERVAL_S` and buffered in memory.
Dashboard-facing telemetry is aggregated into one frame per second.
"""

from __future__ import annotations

import math
import random

from app.config import LOCOMOTIVE_ID, METRIC_DEFINITIONS, RAW_TELEMETRY_INTERVAL_S, TELEMETRY_INTERVAL_S
from app.models import MetricReading, TelemetryFrame, now_ms
from app.state import state

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AMBIENT_TEMP_C = 20.0
TANK_CAPACITY_L = 5_000.0
MAX_CRUISE_KMH = 95.0

_IDLE_DUR = (4.0, 11.0)
_ACCEL_DUR = (14.0, 34.0)
_CRUISE_DUR = (28.0, 70.0)
_BRAKE_DUR = (10.0, 24.0)

_ALPHA_FAST = 2.0 / (18 + 1)
_ALPHA_SLOW = 2.0 / (52 + 1)
_ALPHA_COOL = 2.0 / (20 + 1)

_METRIC_MAP: dict[str, dict] = {metric["metricId"]: metric for metric in METRIC_DEFINITIONS}
_LAST_VALUE_METRICS = {"motion.distance", "fuel.level"}


def _clamp(value: float, lower: float, upper: float) -> float:
    return lower if value < lower else (upper if value > upper else value)


def _ewm(previous: float, current: float, alpha: float) -> float:
    return alpha * current + (1.0 - alpha) * previous


class _Physics:
    __slots__ = (
        "phase",
        "phase_remaining_s",
        "phase_total_s",
        "phase_start_speed",
        "phase_end_speed",
        "cruise_wave_freq",
        "cruise_wave_amp",
        "cruise_wave_phase",
        "phase_elapsed_s",
        "speed_kmh",
        "prev_speed_kmh",
        "accel_mps2",
        "distance_km",
        "grade_period_km",
        "grade_offset",
        "fast_thermal_ewm",
        "slow_thermal_ewm",
        "coolant_load_ewm",
        "fuel_level_l",
    )

    def __init__(self) -> None:
        self.phase = "cruise"
        self.phase_remaining_s = random.uniform(*_CRUISE_DUR) / 2.0
        self.phase_total_s = self.phase_remaining_s
        self.phase_start_speed = 80.0
        self.phase_end_speed = 80.0
        self.cruise_wave_freq = 0.07
        self.cruise_wave_amp = 2.0
        self.cruise_wave_phase = 0.0
        self.phase_elapsed_s = 0.0

        self.speed_kmh = 80.0
        self.prev_speed_kmh = 80.0
        self.accel_mps2 = 0.0
        self.distance_km = 1250.5

        self.grade_period_km = random.uniform(2.8, 5.5)
        self.grade_offset = random.uniform(0.0, 2.0 * math.pi)

        self.fast_thermal_ewm = 0.50
        self.slow_thermal_ewm = 0.45
        self.coolant_load_ewm = 0.50

        self.fuel_level_l = 0.724 * TANK_CAPACITY_L


_phys = _Physics()


def _start_phase(phase: str) -> None:
    physics = _phys
    physics.phase = phase
    physics.phase_elapsed_s = 0.0

    if phase == "acceleration":
        physics.phase_total_s = random.uniform(*_ACCEL_DUR)
        physics.phase_remaining_s = physics.phase_total_s
        physics.phase_start_speed = 0.0
        physics.phase_end_speed = random.uniform(62.0, MAX_CRUISE_KMH)
        return

    if phase == "cruise":
        physics.phase_total_s = random.uniform(*_CRUISE_DUR)
        physics.phase_remaining_s = physics.phase_total_s
        physics.phase_start_speed = physics.speed_kmh
        physics.phase_end_speed = physics.speed_kmh
        physics.cruise_wave_freq = random.uniform(0.04, 0.20)
        physics.cruise_wave_amp = random.uniform(1.0, 3.5)
        physics.cruise_wave_phase = random.uniform(0.0, 2.0 * math.pi)
        return

    if phase == "braking":
        physics.phase_total_s = random.uniform(*_BRAKE_DUR)
        physics.phase_remaining_s = physics.phase_total_s
        physics.phase_start_speed = physics.speed_kmh
        physics.phase_end_speed = 0.0
        return

    physics.phase_total_s = random.uniform(*_IDLE_DUR)
    physics.phase_remaining_s = physics.phase_total_s
    physics.phase_start_speed = 0.0
    physics.phase_end_speed = 0.0


def _tick_phase(dt_s: float) -> None:
    physics = _phys
    physics.phase_elapsed_s += dt_s
    physics.phase_remaining_s = max(0.0, physics.phase_remaining_s - dt_s)

    progress = 1.0 if physics.phase_total_s <= 0 else min(1.0, physics.phase_elapsed_s / physics.phase_total_s)

    if physics.phase == "idle":
        physics.speed_kmh = max(0.0, random.gauss(0.0, 0.05))
        if physics.phase_remaining_s <= 0.0:
            _start_phase("acceleration")
        return

    if physics.phase == "acceleration":
        physics.speed_kmh = max(
            0.0,
            physics.phase_start_speed
            + (physics.phase_end_speed - physics.phase_start_speed) * progress
            + random.gauss(0.0, 0.2),
        )
        if physics.phase_remaining_s <= 0.0:
            _start_phase("cruise")
        return

    if physics.phase == "cruise":
        wave = physics.cruise_wave_amp * math.sin(
            physics.cruise_wave_freq * physics.phase_elapsed_s + physics.cruise_wave_phase
        )
        physics.speed_kmh = _clamp(
            physics.phase_start_speed + wave + random.gauss(0.0, 0.12),
            0.0,
            MAX_CRUISE_KMH + 4.0,
        )
        if physics.phase_remaining_s <= 0.0:
            _start_phase("braking")
        return

    physics.speed_kmh = max(0.0, physics.phase_start_speed * (1.0 - progress) + random.gauss(0.0, 0.15))
    if physics.phase_remaining_s <= 0.0:
        _start_phase("idle")


def _step(dt_s: float) -> dict[str, float]:
    physics = _phys
    _tick_phase(dt_s)

    speed_mps = physics.speed_kmh / 3.6
    prev_mps = physics.prev_speed_kmh / 3.6
    physics.accel_mps2 = (speed_mps - prev_mps) / max(dt_s, 1e-6)
    physics.prev_speed_kmh = physics.speed_kmh
    physics.distance_km += speed_mps * dt_s / 1000.0

    grade = _clamp(
        0.45 + 0.25 * math.sin(2.0 * math.pi * physics.distance_km / physics.grade_period_km + physics.grade_offset),
        0.0,
        1.0,
    )

    speed_norm = _clamp(physics.speed_kmh / 100.0, 0.0, 1.2)
    accel_up = max(0.0, physics.accel_mps2)
    accel_norm = _clamp(accel_up / 0.42, 0.0, 1.5)
    braking_norm = _clamp(-physics.accel_mps2 / 0.55, 0.0, 1.4)
    load = _clamp(0.15 + 0.32 * speed_norm + 0.78 * accel_norm + 0.28 * grade, 0.0, 1.6)

    physics.fast_thermal_ewm = _ewm(physics.fast_thermal_ewm, load, _ALPHA_FAST)
    physics.slow_thermal_ewm = _ewm(physics.slow_thermal_ewm, load, _ALPHA_SLOW)
    physics.coolant_load_ewm = _ewm(physics.coolant_load_ewm, load, _ALPHA_COOL)

    if physics.speed_kmh < 1.0:
        rpm = 395.0 + random.gauss(0.0, 3.0)
    else:
        rpm = 380.0 + 440.0 * speed_norm + 260.0 * load + random.gauss(0.0, 5.0)
    rpm = _clamp(rpm, 360.0, 1080.0)
    rpm_norm = (rpm - 360.0) / 720.0

    fuel_rate = _clamp(
        16.0 + 210.0 * (0.18 * speed_norm + 0.82 * load) + random.gauss(0.0, 1.4),
        12.0,
        290.0,
    )
    physics.fuel_level_l = max(0.0, physics.fuel_level_l - fuel_rate * dt_s / 3600.0)
    fuel_pct = _clamp(physics.fuel_level_l / TANK_CAPACITY_L * 100.0, 0.0, 100.0)

    coolant = _clamp(
        AMBIENT_TEMP_C + 44.0 + 25.0 * physics.coolant_load_ewm + random.gauss(0.0, 0.16),
        AMBIENT_TEMP_C + 38.0,
        112.0,
    )
    oil_temp = _clamp(coolant + 7.0 + 5.0 * load + random.gauss(0.0, 0.3), 60.0, 160.0)
    exhaust = _clamp(150.0 + 300.0 * rpm_norm + 200.0 * load + random.gauss(0.0, 3.0), 120.0, 700.0)

    if braking_norm > 0.03:
        brake_cyl = _clamp(0.18 + 4.5 * braking_norm + random.gauss(0.0, 0.03), 0.0, 5.0)
    else:
        brake_cyl = max(0.0, abs(random.gauss(0.0, 0.015)))

    brake_pipe = _clamp(5.15 - 0.40 * brake_cyl + random.gauss(0.0, 0.02), 3.2, 5.3)
    brake_main = _clamp(8.2 - 0.8 * braking_norm + random.gauss(0.0, 0.05), 6.0, 10.0)
    oil_pressure = _clamp(2.4 + 2.2 * rpm_norm - 0.20 * physics.coolant_load_ewm + random.gauss(0.0, 0.04), 1.8, 5.6)

    traction_scale = 0.35 if braking_norm > 0.04 else 1.0
    traction_current = _clamp(
        (18.0 + 680.0 * (0.18 * speed_norm + 0.88 * accel_norm + 0.22 * grade)) * traction_scale
        + random.gauss(0.0, 8.0),
        8.0,
        1150.0,
    )
    traction_voltage = _clamp(2650.0 + 400.0 * rpm_norm - 60.0 * load + random.gauss(0.0, 8.0), 2400.0, 3000.0)
    battery_voltage = _clamp(108.0 - 4.5 * load + random.gauss(0.0, 0.10), 90.0, 120.0)

    return {
        "motion.speed": _clamp(physics.speed_kmh, 0.0, 200.0),
        "motion.acceleration": _clamp(physics.accel_mps2, -5.0, 5.0),
        "motion.distance": physics.distance_km,
        "fuel.level": fuel_pct,
        "fuel.consumption_rate": fuel_rate,
        "thermal.coolant_temp": coolant,
        "thermal.oil_temp": oil_temp,
        "thermal.exhaust_temp": exhaust,
        "pressure.brake_main": brake_main,
        "pressure.brake_pipe": brake_pipe,
        "pressure.oil": oil_pressure,
        "electrical.traction_voltage": traction_voltage,
        "electrical.traction_current": traction_current,
        "electrical.battery_voltage": battery_voltage,
    }


def _quality(value: float, metric: dict) -> str:
    critical_low = metric.get("criticalLow")
    critical_high = metric.get("criticalHigh")
    if (critical_low is not None and value <= critical_low) or (critical_high is not None and value >= critical_high):
        return "suspect"
    return "good"


def generate_raw_sample(timestamp_ms: int | None = None) -> tuple[int, dict[str, float]]:
    timestamp = now_ms() if timestamp_ms is None else timestamp_ms
    values = _step(RAW_TELEMETRY_INTERVAL_S)
    state.raw_samples.append((timestamp, values))
    return timestamp, values


def _aggregated_values(samples: list[tuple[int, dict[str, float]]]) -> dict[str, float]:
    if not samples:
        _, fallback_values = generate_raw_sample()
        samples = list(state.raw_samples)[-1:]

    values_by_metric: dict[str, list[float]] = {metric_id: [] for metric_id in _METRIC_MAP}
    last_values: dict[str, float] = {}
    for _, sample_values in samples:
        for metric_id, value in sample_values.items():
            values_by_metric[metric_id].append(value)
            last_values[metric_id] = value

    aggregated: dict[str, float] = {}
    for metric_id, metric_values in values_by_metric.items():
        if not metric_values:
            aggregated[metric_id] = state.current_values.get(metric_id, 0.0)
            continue
        if metric_id in _LAST_VALUE_METRICS:
            aggregated[metric_id] = last_values[metric_id]
        else:
            aggregated[metric_id] = sum(metric_values) / len(metric_values)
    return aggregated


def _frame_from_values(values: dict[str, float], timestamp_ms: int) -> TelemetryFrame:
    readings: list[MetricReading] = []
    for metric in METRIC_DEFINITIONS:
        metric_id = metric["metricId"]
        value = values[metric_id]
        state.current_values[metric_id] = value
        state.history_buffer[metric_id].append((timestamp_ms, value))
        readings.append(
            MetricReading(
                metric_id=metric_id,
                value=round(value, metric.get("precision", 2)),
                unit=metric["unit"],
                timestamp=timestamp_ms,
                quality=_quality(value, metric),
            )
        )
    frame = TelemetryFrame(
        locomotive_id=LOCOMOTIVE_ID,
        frame_id=state.next_frame_id(),
        timestamp=timestamp_ms,
        readings=readings,
    )
    state.current_frame = frame
    return frame


def aggregate_samples_to_frame(
    samples: list[tuple[int, dict[str, float]]],
    timestamp_ms: int | None = None,
) -> TelemetryFrame:
    effective_timestamp = timestamp_ms if timestamp_ms is not None else (samples[-1][0] if samples else now_ms())
    values = _aggregated_values(samples)
    return _frame_from_values(values, effective_timestamp)


def _recent_samples() -> list[tuple[int, dict[str, float]]]:
    if not state.raw_samples:
        generate_raw_sample()
    cutoff = (state.raw_samples[-1][0] if state.raw_samples else now_ms()) - int(TELEMETRY_INTERVAL_S * 1000)
    samples = [sample for sample in state.raw_samples if sample[0] > cutoff]
    return samples or list(state.raw_samples)[-1:]


def prime_raw_samples(sample_count: int | None = None) -> None:
    target_count = sample_count if sample_count is not None else max(1, int(round(TELEMETRY_INTERVAL_S / RAW_TELEMETRY_INTERVAL_S)))
    while len(state.raw_samples) < target_count:
        generate_raw_sample()


def generate_frame() -> TelemetryFrame:
    """
    Aggregate buffered raw samples into one dashboard-facing telemetry frame.
    """
    if not state.raw_samples:
        prime_raw_samples()
    return aggregate_samples_to_frame(_recent_samples())
