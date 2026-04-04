"""
Telemetry simulator — physics-based incremental engine (TE33A diesel).

Algorithm ported from generate_synthetic_telemetry.py and adapted for
1Hz streaming instead of batch numpy generation.

Key adaptations from the original 1kHz simulation:
  - EWM spans divided by 1000  (e.g. span=18_000 → span=18, α≈0.105)
  - Phase durations divided by 1000  (e.g. 14_000–34_000 ms → 14–34 s)
  - Distance incremented per-step as speed_mps * 1s
  - Gaussian noise added directly (no EWM noise smoothing needed at 1Hz)

Metric ID → physics variable mapping:
  motion.speed             speed_kmh
  motion.acceleration      accel_mps2  (Δv per second)
  motion.distance          distance_km (cumulative)
  fuel.level               fuel_level_l / TANK_CAPACITY_L * 100  [%]
  fuel.consumption_rate    fuel_rate_lph                          [L/h]
  thermal.coolant_temp     ambient + 44 + 25 * coolant_load_ewm   [°C]
  thermal.oil_temp         coolant_temp + 7 + 5 * load            [°C]
  thermal.exhaust_temp     150 + 300 * rpm_norm + 200 * load      [°C]
  pressure.brake_main      8.2 - 0.8 * braking_norm               [bar]
  pressure.brake_pipe      5.15 - 0.40 * brake_cylinder           [bar]
  pressure.oil             2.4 + 2.2 * rpm_norm - 0.20 * coolant_ewm [bar]
  electrical.traction_voltage  2650 + 400 * rpm_norm - 60 * load  [V]
  electrical.traction_current  680-scale formula from load signal  [A]
  electrical.battery_voltage   108 - 4.5 * load                   [V]
"""

from __future__ import annotations

import math
import random

from app.config import METRIC_DEFINITIONS, LOCOMOTIVE_ID
from app.models import MetricReading, TelemetryFrame, now_ms
from app.state import state

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AMBIENT_TEMP_C = 20.0       # Kazakhstan spring ambient
TANK_CAPACITY_L = 5_000.0   # TE33A fuel tank capacity

MAX_CRUISE_KMH = 95.0       # TE33A top speed

# Phase durations at 1Hz (original 1kHz values divided by 1000)
_IDLE_DUR   = (4,  11)   # seconds
_ACCEL_DUR  = (14, 34)
_CRUISE_DUR = (28, 70)
_BRAKE_DUR  = (10, 24)

# EWM alpha values (span = original_1kHz_span / 1000)
#   fast_thermal: span=18  → α = 2/(18+1)  ≈ 0.105
#   slow_thermal: span=52  → α = 2/(52+1)  ≈ 0.038
#   coolant_load: span=20  → α = 2/(20+1)  ≈ 0.095
_ALPHA_FAST = 2.0 / (18 + 1)
_ALPHA_SLOW = 2.0 / (52 + 1)
_ALPHA_COOL = 2.0 / (20 + 1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def _ewm(prev: float, x: float, alpha: float) -> float:
    """One incremental EWM step: new = alpha*x + (1-alpha)*prev."""
    return alpha * x + (1.0 - alpha) * prev


# ---------------------------------------------------------------------------
# Physics state (module-level singleton, initialised at cruise 80 km/h)
# ---------------------------------------------------------------------------

class _Physics:
    __slots__ = (
        "phase", "phase_remaining", "phase_total",
        "phase_start_speed", "phase_end_speed",
        "cruise_wave_freq", "cruise_wave_amp", "cruise_wave_phase",
        "speed_kmh", "prev_speed_kmh", "accel_mps2", "distance_km",
        "grade_period_km", "grade_offset",
        "fast_thermal_ewm", "slow_thermal_ewm", "coolant_load_ewm",
        "fuel_level_l",
    )

    def __init__(self) -> None:
        # Start mid-cruise at 80 km/h
        self.phase = "cruise"
        self.phase_remaining = random.randint(*_CRUISE_DUR) // 2
        self.phase_total = self.phase_remaining
        self.phase_start_speed = 80.0
        self.phase_end_speed = 80.0
        self.cruise_wave_freq = 0.07
        self.cruise_wave_amp = 2.0
        self.cruise_wave_phase = 0.0

        self.speed_kmh = 80.0
        self.prev_speed_kmh = 80.0
        self.accel_mps2 = 0.0
        self.distance_km = 1250.5

        # Grade varies sinusoidally with distance
        self.grade_period_km = random.uniform(2.8, 5.5)
        self.grade_offset = random.uniform(0.0, 2.0 * math.pi)

        # EWM thermal states — initialised at a reasonable cruise equilibrium
        # load ≈ 0.53 at 80 km/h flat cruise; match starting coolant ~76°C
        self.fast_thermal_ewm = 0.50
        self.slow_thermal_ewm = 0.45
        self.coolant_load_ewm = 0.50

        # Fuel: 72.4% of tank
        self.fuel_level_l = 0.724 * TANK_CAPACITY_L


_phys = _Physics()


# ---------------------------------------------------------------------------
# Phase machine
# ---------------------------------------------------------------------------

def _tick_phase() -> None:
    """Advance phase by one second, update speed_kmh."""
    p = _phys
    p.phase_remaining -= 1
    step_in = p.phase_total - p.phase_remaining  # 1 on first step, phase_total on last

    if p.phase == "idle":
        p.speed_kmh = max(0.0, random.gauss(0.0, 0.05))
        if p.phase_remaining <= 0:
            total = random.randint(*_ACCEL_DUR)
            p.phase = "acceleration"
            p.phase_total = total
            p.phase_remaining = total
            p.phase_start_speed = 0.0
            p.phase_end_speed = random.uniform(62.0, MAX_CRUISE_KMH)

    elif p.phase == "acceleration":
        frac = step_in / p.phase_total
        p.speed_kmh = max(0.0, p.phase_start_speed + (p.phase_end_speed - p.phase_start_speed) * frac + random.gauss(0, 0.3))
        if p.phase_remaining <= 0:
            total = random.randint(*_CRUISE_DUR)
            p.phase = "cruise"
            p.phase_total = total
            p.phase_remaining = total
            p.phase_start_speed = p.speed_kmh
            p.cruise_wave_freq = random.uniform(0.04, 0.20)
            p.cruise_wave_amp = random.uniform(1.0, 3.5)
            p.cruise_wave_phase = random.uniform(0.0, 2.0 * math.pi)

    elif p.phase == "cruise":
        wave = p.cruise_wave_amp * math.sin(p.cruise_wave_freq * step_in + p.cruise_wave_phase)
        p.speed_kmh = _clamp(p.phase_start_speed + wave + random.gauss(0, 0.15), 0.0, MAX_CRUISE_KMH + 4.0)
        if p.phase_remaining <= 0:
            total = random.randint(*_BRAKE_DUR)
            p.phase = "braking"
            p.phase_total = total
            p.phase_remaining = total
            p.phase_start_speed = p.speed_kmh
            p.phase_end_speed = 0.0

    elif p.phase == "braking":
        frac = step_in / p.phase_total
        p.speed_kmh = max(0.0, p.phase_start_speed * (1.0 - frac) + random.gauss(0, 0.2))
        if p.phase_remaining <= 0:
            total = random.randint(*_IDLE_DUR)
            p.phase = "idle"
            p.phase_total = total
            p.phase_remaining = total


# ---------------------------------------------------------------------------
# Physics step
# ---------------------------------------------------------------------------

def _step() -> dict[str, float]:
    """Advance simulation one second and return all 14 metric values."""
    p = _phys

    # ── Motion ──────────────────────────────────────────────────────────────
    _tick_phase()

    speed_mps = p.speed_kmh / 3.6
    prev_mps = p.prev_speed_kmh / 3.6
    p.accel_mps2 = speed_mps - prev_mps          # Δv in 1 s  ≡ instantaneous a
    p.prev_speed_kmh = p.speed_kmh
    p.distance_km += speed_mps / 1000.0          # km gained this second

    # ── Grade ───────────────────────────────────────────────────────────────
    grade = _clamp(
        0.45 + 0.25 * math.sin(2.0 * math.pi * p.distance_km / p.grade_period_km + p.grade_offset),
        0.0, 1.0,
    )

    # ── Normalised signals ──────────────────────────────────────────────────
    speed_norm  = _clamp(p.speed_kmh / 100.0,       0.0, 1.2)
    accel_up    = max(0.0, p.accel_mps2)
    accel_norm  = _clamp(accel_up / 0.42,            0.0, 1.5)
    braking_norm = _clamp(-p.accel_mps2 / 0.55,     0.0, 1.4)

    # ── Load signal (core physics driver) ───────────────────────────────────
    load = _clamp(0.15 + 0.32 * speed_norm + 0.78 * accel_norm + 0.28 * grade, 0.0, 1.6)

    # ── EWM thermal update ──────────────────────────────────────────────────
    p.fast_thermal_ewm = _ewm(p.fast_thermal_ewm, load, _ALPHA_FAST)
    p.slow_thermal_ewm = _ewm(p.slow_thermal_ewm, load, _ALPHA_SLOW)
    p.coolant_load_ewm = _ewm(p.coolant_load_ewm, load, _ALPHA_COOL)

    # ── Engine RPM (TE33A diesel) ────────────────────────────────────────────
    if p.speed_kmh < 1.0:
        rpm = 395.0 + random.gauss(0.0, 3.0)
    else:
        rpm = 380.0 + 440.0 * speed_norm + 260.0 * load + random.gauss(0.0, 5.0)
    rpm = _clamp(rpm, 360.0, 1080.0)
    rpm_norm = (rpm - 360.0) / 720.0  # already in [0, 1] given clamp above

    # ── Fuel ────────────────────────────────────────────────────────────────
    fuel_rate = _clamp(
        16.0 + 210.0 * (0.18 * speed_norm + 0.82 * load) + random.gauss(0.0, 1.4),
        12.0, 290.0,
    )
    p.fuel_level_l = max(0.0, p.fuel_level_l - fuel_rate / 3600.0)
    fuel_pct = _clamp(p.fuel_level_l / TANK_CAPACITY_L * 100.0, 0.0, 100.0)

    # ── Temperatures ────────────────────────────────────────────────────────
    coolant = _clamp(
        AMBIENT_TEMP_C + 44.0 + 25.0 * p.coolant_load_ewm + random.gauss(0.0, 0.16),
        AMBIENT_TEMP_C + 38.0, 112.0,
    )
    oil_temp = _clamp(
        coolant + 7.0 + 5.0 * load + random.gauss(0.0, 0.3),
        60.0, 160.0,
    )
    exhaust = _clamp(
        150.0 + 300.0 * rpm_norm + 200.0 * load + random.gauss(0.0, 3.0),
        120.0, 700.0,
    )

    # ── Brake pressures ─────────────────────────────────────────────────────
    if braking_norm > 0.03:
        brake_cyl = _clamp(0.18 + 4.5 * braking_norm + random.gauss(0.0, 0.03), 0.0, 5.0)
    else:
        brake_cyl = max(0.0, abs(random.gauss(0.0, 0.015)))

    brake_pipe = _clamp(5.15 - 0.40 * brake_cyl + random.gauss(0.0, 0.02), 3.2, 5.3)
    brake_main = _clamp(8.2 - 0.8 * braking_norm + random.gauss(0.0, 0.05), 6.0, 10.0)

    # ── Oil pressure ────────────────────────────────────────────────────────
    oil_pressure = _clamp(
        2.4 + 2.2 * rpm_norm - 0.20 * p.coolant_load_ewm + random.gauss(0.0, 0.04),
        1.8, 5.6,
    )

    # ── Electrical ──────────────────────────────────────────────────────────
    traction_scale = 0.35 if braking_norm > 0.04 else 1.0
    traction_current = _clamp(
        (18.0 + 680.0 * (0.18 * speed_norm + 0.88 * accel_norm + 0.22 * grade))
        * traction_scale
        + random.gauss(0.0, 8.0),
        8.0, 1150.0,
    )
    # Diesel alternator: voltage rises with RPM, dips under heavy load
    traction_voltage = _clamp(
        2650.0 + 400.0 * rpm_norm - 60.0 * load + random.gauss(0.0, 8.0),
        2400.0, 3000.0,
    )
    battery_voltage = _clamp(
        108.0 - 4.5 * load + random.gauss(0.0, 0.10),
        90.0, 120.0,
    )

    return {
        "motion.speed":                _clamp(p.speed_kmh, 0.0, 200.0),
        "motion.acceleration":         _clamp(p.accel_mps2, -5.0, 5.0),
        "motion.distance":             p.distance_km,
        "fuel.level":                  fuel_pct,
        "fuel.consumption_rate":       fuel_rate,
        "thermal.coolant_temp":        coolant,
        "thermal.oil_temp":            oil_temp,
        "thermal.exhaust_temp":        exhaust,
        "pressure.brake_main":         brake_main,
        "pressure.brake_pipe":         brake_pipe,
        "pressure.oil":                oil_pressure,
        "electrical.traction_voltage": traction_voltage,
        "electrical.traction_current": traction_current,
        "electrical.battery_voltage":  battery_voltage,
    }


# ---------------------------------------------------------------------------
# Quality helper
# ---------------------------------------------------------------------------

def _quality(value: float, metric: dict) -> str:
    crit_low  = metric.get("criticalLow")
    crit_high = metric.get("criticalHigh")
    if (crit_low  is not None and value <= crit_low) or \
       (crit_high is not None and value >= crit_high):
        return "suspect"
    return "good"


# ---------------------------------------------------------------------------
# Public API — called by broadcaster and lifespan startup
# ---------------------------------------------------------------------------

_METRIC_MAP: dict[str, dict] = {m["metricId"]: m for m in METRIC_DEFINITIONS}


def generate_frame() -> TelemetryFrame:
    """
    Advance physics one second and return a TelemetryFrame with 14 readings.
    Updates state.current_values and appends to state.history_buffer.
    """
    ts = now_ms()
    values = _step()
    readings: list[MetricReading] = []

    # Iterate in METRIC_DEFINITIONS order so readings are consistently ordered
    for metric in METRIC_DEFINITIONS:
        mid = metric["metricId"]
        value = values[mid]
        state.current_values[mid] = value
        state.history_buffer[mid].append((ts, value))
        readings.append(
            MetricReading(
                metric_id=mid,
                value=round(value, metric.get("precision", 2)),
                unit=metric["unit"],
                timestamp=ts,
                quality=_quality(value, metric),
            )
        )

    frame = TelemetryFrame(
        locomotive_id=LOCOMOTIVE_ID,
        frame_id=state.next_frame_id(),
        timestamp=ts,
        readings=readings,
    )
    state.current_frame = frame
    return frame
