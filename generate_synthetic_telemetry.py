from __future__ import annotations

import argparse
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


RANDOM_SEED = 42
SAMPLE_RATE_HZ = 1000
TOTAL_ROWS_TARGET = 1_000_000
OUTPUT_DIR = Path("./synthetic_output")
DT_S = 1.0 / SAMPLE_RATE_HZ

COMMON_COLUMNS = [
    "timestamp",
    "t_ms",
    "locomotive_id",
    "locomotive_type",
    "latitude",
    "longitude",
    "speed_kmh",
    "acceleration_mps2",
    "heading_deg",
    "traction_current_a",
    "battery_voltage_v",
    "brake_pipe_pressure_bar",
    "brake_cylinder_pressure_bar",
    "traction_motor_temp_c",
    "bearing_temp_c",
    "fault_code",
    "comms_status",
]

KZ8A_COLUMNS = [
    "catenary_voltage_kv",
    "transformer_temp_c",
]

TE33A_COLUMNS = [
    "engine_rpm",
    "coolant_temp_c",
    "oil_pressure_bar",
    "fuel_level_l",
    "fuel_rate_lph",
]

OUTPUT_COLUMNS = COMMON_COLUMNS + KZ8A_COLUMNS + TE33A_COLUMNS
FLOAT_COLUMNS = [
    "latitude",
    "longitude",
    "speed_kmh",
    "acceleration_mps2",
    "heading_deg",
    "traction_current_a",
    "battery_voltage_v",
    "brake_pipe_pressure_bar",
    "brake_cylinder_pressure_bar",
    "traction_motor_temp_c",
    "bearing_temp_c",
    "catenary_voltage_kv",
    "transformer_temp_c",
    "engine_rpm",
    "coolant_temp_c",
    "oil_pressure_bar",
    "fuel_level_l",
    "fuel_rate_lph",
]

PHASE_IDLE = np.int8(0)
PHASE_STOP = np.int8(1)
PHASE_ACCEL = np.int8(2)
PHASE_CRUISE = np.int8(3)
PHASE_BRAKE = np.int8(4)
STOP_PHASES = (PHASE_IDLE, PHASE_STOP)

ALLOWED_FAULT_ATOMS = {
    "COMMS_DEGRADED",
    "COMMS_OFFLINE",
    "KZ8A_CAT_LOW",
    "KZ8A_XFMR_HOT",
    "TE33A_OIL_LOW",
    "TE33A_COOLANT_HOT",
}
ALLOWED_COMMS = {"online", "degraded", "offline"}


@dataclass(frozen=True)
class Route:
    name: str
    lat: np.ndarray
    lon: np.ndarray
    x: np.ndarray
    y: np.ndarray
    cum_km: np.ndarray
    length_km: float


@dataclass(frozen=True)
class LocomotiveSpec:
    locomotive_id: str
    locomotive_type: str
    route_name: str
    route_start_fraction: float
    start_time: np.datetime64
    ambient_temp_c: float


@dataclass(frozen=True)
class GeneratorConfig:
    total_rows_target: int = TOTAL_ROWS_TARGET
    sample_rate_hz: int = SAMPLE_RATE_HZ
    random_seed: int = RANDOM_SEED
    output_dir: Path = OUTPUT_DIR
    output_formats: tuple[str, ...] = ("csv", "jsonl", "parquet")

    @property
    def dt_s(self) -> float:
        return 1.0 / self.sample_rate_hz


@dataclass
class MotionProfile:
    phase: np.ndarray
    speed_kmh: np.ndarray
    acceleration_mps2: np.ndarray
    distance_km: np.ndarray
    grade_factor: np.ndarray


@dataclass
class CommonTelemetry:
    latitude: np.ndarray
    longitude: np.ndarray
    speed_kmh: np.ndarray
    acceleration_mps2: np.ndarray
    heading_deg: np.ndarray
    traction_current_a: np.ndarray
    battery_voltage_v: np.ndarray
    brake_pipe_pressure_bar: np.ndarray
    brake_cylinder_pressure_bar: np.ndarray
    traction_motor_temp_c: np.ndarray
    bearing_temp_c: np.ndarray
    fault_code: np.ndarray
    comms_status: np.ndarray
    load_signal: np.ndarray
    speed_norm: np.ndarray


@dataclass
class TypeSpecificTelemetry:
    catenary_voltage_kv: np.ndarray
    transformer_temp_c: np.ndarray
    engine_rpm: np.ndarray
    coolant_temp_c: np.ndarray
    oil_pressure_bar: np.ndarray
    fuel_level_l: np.ndarray
    fuel_rate_lph: np.ndarray
    initial_fuel_l: float | None = None


def distribute_rows(total_rows: int, count: int) -> list[int]:
    base = total_rows // count
    remainder = total_rows % count
    return [base + (1 if i < remainder else 0) for i in range(count)]


def filtered_noise(size: int, scale: float, span: int, rng: np.random.Generator) -> np.ndarray:
    raw = rng.normal(0.0, scale, size=size).astype(np.float32)
    return pd.Series(raw).ewm(span=max(2, span), adjust=False).mean().to_numpy(dtype=np.float32)


def causal_rolling_mean(values: np.ndarray, window: int) -> np.ndarray:
    return (
        pd.Series(values)
        .rolling(window=max(3, window), center=False, min_periods=1)
        .mean()
        .to_numpy(dtype=np.float32)
    )


def to_float32(values: np.ndarray | Iterable[float]) -> np.ndarray:
    return np.asarray(values, dtype=np.float32)


def build_route(name: str, points: list[tuple[float, float]]) -> Route:
    lat = np.array([p[0] for p in points], dtype=np.float64)
    lon = np.array([p[1] for p in points], dtype=np.float64)
    ref_lat = np.deg2rad(lat.mean())
    x = lon * 111.320 * np.cos(ref_lat)
    y = lat * 110.574
    segment_km = np.sqrt(np.diff(x) ** 2 + np.diff(y) ** 2)
    cum_km = np.concatenate([[0.0], np.cumsum(segment_km)])
    return Route(name=name, lat=lat, lon=lon, x=x, y=y, cum_km=cum_km, length_km=float(cum_km[-1]))


def create_routes() -> dict[str, Route]:
    return {
        "almaty_astana": build_route(
            "almaty_astana",
            [
                (43.2389, 76.8897),
                (43.8667, 77.0667),
                (46.8481, 74.9950),
                (49.8060, 73.0850),
                (51.1694, 71.4491),
            ],
        ),
        "shymkent_aktobe": build_route(
            "shymkent_aktobe",
            [
                (42.3417, 69.5901),
                (43.2973, 68.2518),
                (44.8488, 65.4823),
                (47.8330, 59.6000),
                (50.2839, 57.1670),
            ],
        ),
        "almaty_oskemen": build_route(
            "almaty_oskemen",
            [
                (43.2389, 76.8897),
                (45.0167, 78.3667),
                (47.9667, 80.4333),
                (50.4111, 80.2275),
                (49.9483, 82.6275),
            ],
        ),
    }


def create_locomotives() -> list[LocomotiveSpec]:
    return [
        LocomotiveSpec(
            locomotive_id="KZ8A-001",
            locomotive_type="KZ8A",
            route_name="almaty_astana",
            route_start_fraction=0.18,
            start_time=np.datetime64("2026-04-04T08:00:00.000"),
            ambient_temp_c=19.0,
        ),
        LocomotiveSpec(
            locomotive_id="TE33A-002",
            locomotive_type="TE33A",
            route_name="shymkent_aktobe",
            route_start_fraction=0.12,
            start_time=np.datetime64("2026-04-04T08:02:15.000"),
            ambient_temp_c=23.0,
        ),
        LocomotiveSpec(
            locomotive_id="KZ8A-003",
            locomotive_type="KZ8A",
            route_name="almaty_oskemen",
            route_start_fraction=0.24,
            start_time=np.datetime64("2026-04-04T08:04:30.000"),
            ambient_temp_c=17.5,
        ),
    ]


def generate_time_axis(start_time: np.datetime64, num_rows: int) -> tuple[np.ndarray, np.ndarray]:
    t_ms = np.arange(num_rows, dtype=np.int64)
    timestamps = start_time + t_ms.astype("timedelta64[ms]")
    return timestamps.astype("datetime64[ms]"), t_ms


def simulate_motion_profile(num_rows: int, locomotive_type: str, dt_s: float, rng: np.random.Generator) -> MotionProfile:
    target_speed = np.zeros(num_rows, dtype=np.float32)
    phase = np.empty(num_rows, dtype=np.int8)
    idx = 0
    current_speed = 0.0
    max_cruise = 105.0 if locomotive_type == "KZ8A" else 95.0

    while idx < num_rows:
        zero_phase = PHASE_IDLE if idx == 0 else PHASE_STOP
        zero_dur = int(rng.integers(4_000, 11_000 if idx == 0 else 13_000))
        end = min(num_rows, idx + zero_dur)
        phase[idx:end] = zero_phase
        idx = end
        if idx >= num_rows:
            break

        cruise_target = float(rng.uniform(62.0, max_cruise))
        accel_dur = int(rng.integers(14_000, 34_000))
        end = min(num_rows, idx + accel_dur)
        count = end - idx
        if count > 0:
            target_speed[idx:end] = np.linspace(current_speed, cruise_target, count, endpoint=False, dtype=np.float32)
            phase[idx:end] = PHASE_ACCEL
            current_speed = float(target_speed[end - 1]) if count > 1 else cruise_target
        idx = end
        if idx >= num_rows:
            break

        cruise_dur = int(rng.integers(28_000, 70_000))
        end = min(num_rows, idx + cruise_dur)
        count = end - idx
        if count > 0:
            t = np.linspace(0.0, rng.uniform(2.0 * np.pi, 6.0 * np.pi), count, endpoint=False, dtype=np.float32)
            cruise_wave = 2.0 * np.sin(t) + 0.8 * np.sin(0.37 * t + rng.uniform(0.0, np.pi))
            target_speed[idx:end] = np.clip(current_speed + cruise_wave, 0.0, max_cruise + 4.0).astype(np.float32)
            phase[idx:end] = PHASE_CRUISE
            current_speed = float(target_speed[end - 1])
        idx = end
        if idx >= num_rows:
            break

        brake_dur = int(rng.integers(10_000, 24_000))
        end = min(num_rows, idx + brake_dur)
        count = end - idx
        if count > 0:
            target_speed[idx:end] = np.linspace(current_speed, 0.0, count, endpoint=False, dtype=np.float32)
            phase[idx:end] = PHASE_BRAKE
        idx = end
        current_speed = 0.0

    speed_kmh = causal_rolling_mean(target_speed, window=1501)
    speed_kmh += filtered_noise(num_rows, scale=0.10, span=450, rng=rng)
    stationary_mask = np.isin(phase, STOP_PHASES)
    speed_kmh[stationary_mask] *= 0.05
    speed_kmh = causal_rolling_mean(np.clip(speed_kmh, 0.0, None), window=301)
    speed_kmh = np.clip(speed_kmh, 0.0, max_cruise + 5.0).astype(np.float32)

    speed_mps = speed_kmh / 3.6
    acceleration_mps2 = np.gradient(speed_mps, dt_s).astype(np.float32)
    distance_km = (np.cumsum(speed_mps, dtype=np.float64) * dt_s / 1000.0).astype(np.float32)

    grade_base = 0.45 + 0.25 * np.sin(distance_km / rng.uniform(2.8, 5.5) + rng.uniform(0.0, 2.0 * np.pi))
    grade_noise = filtered_noise(num_rows, scale=0.06, span=1800, rng=rng)
    grade_factor = np.clip(grade_base + grade_noise, 0.0, 1.0).astype(np.float32)

    return MotionProfile(
        phase=phase,
        speed_kmh=speed_kmh,
        acceleration_mps2=acceleration_mps2,
        distance_km=distance_km,
        grade_factor=grade_factor,
    )


def interpolate_route(route: Route, route_progress_km: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    progress = np.clip(route_progress_km.astype(np.float64), 0.0, route.length_km - 0.001)
    lat = np.interp(progress, route.cum_km, route.lat).astype(np.float32)
    lon = np.interp(progress, route.cum_km, route.lon).astype(np.float32)

    ahead = np.clip(progress + 0.05, 0.0, route.length_km)
    behind = np.clip(progress - 0.05, 0.0, route.length_km)
    x_ahead = np.interp(ahead, route.cum_km, route.x)
    y_ahead = np.interp(ahead, route.cum_km, route.y)
    x_behind = np.interp(behind, route.cum_km, route.x)
    y_behind = np.interp(behind, route.cum_km, route.y)
    heading = (np.degrees(np.arctan2(x_ahead - x_behind, y_ahead - y_behind)) + 360.0) % 360.0
    heading = causal_rolling_mean(np.rad2deg(np.unwrap(np.deg2rad(heading))).astype(np.float32), window=801) % 360.0
    return lat, lon, heading.astype(np.float32)


def simulate_common_telemetry(
    locomotive: LocomotiveSpec,
    route: Route,
    motion: MotionProfile,
    rng: np.random.Generator,
) -> CommonTelemetry:
    num_rows = len(motion.speed_kmh)
    route_progress_km = route.length_km * locomotive.route_start_fraction + motion.distance_km
    latitude, longitude, heading_deg = interpolate_route(route, route_progress_km)
    latitude += filtered_noise(num_rows, scale=0.00001, span=900, rng=rng)
    longitude += filtered_noise(num_rows, scale=0.00001, span=900, rng=rng)

    speed_kmh = motion.speed_kmh
    acceleration_mps2 = motion.acceleration_mps2
    speed_norm = np.clip(speed_kmh / (110.0 if locomotive.locomotive_type == "KZ8A" else 100.0), 0.0, 1.2)
    accel_up = np.clip(acceleration_mps2, 0.0, None)
    accel_norm = np.clip(accel_up / 0.42, 0.0, 1.5)
    braking_norm = np.clip(-acceleration_mps2 / 0.55, 0.0, 1.4)

    load_signal = np.clip(
        0.15 + 0.32 * speed_norm + 0.78 * accel_norm + 0.28 * motion.grade_factor,
        0.0,
        1.6,
    ).astype(np.float32)
    moving_mask = speed_kmh > 1.0

    traction_scale = 820.0 if locomotive.locomotive_type == "KZ8A" else 680.0
    traction_current_a = (
        18.0
        + 10.0 * moving_mask.astype(np.float32)
        + traction_scale * (0.18 * speed_norm + 0.88 * accel_norm + 0.22 * motion.grade_factor)
    )
    traction_current_a *= np.where(braking_norm > 0.04, 0.35, 1.0).astype(np.float32)
    traction_current_a += filtered_noise(num_rows, scale=8.0, span=220, rng=rng)
    traction_current_a = np.clip(traction_current_a, 8.0, 1150.0).astype(np.float32)

    fast_thermal = pd.Series(load_signal).ewm(span=18_000, adjust=False).mean().to_numpy(dtype=np.float32)
    slow_thermal = pd.Series(load_signal).ewm(span=52_000, adjust=False).mean().to_numpy(dtype=np.float32)
    ambient = locomotive.ambient_temp_c

    traction_motor_temp_c = ambient + 18.0 + 50.0 * fast_thermal + filtered_noise(num_rows, scale=0.25, span=700, rng=rng)
    bearing_temp_c = ambient + 10.0 + 24.0 * slow_thermal + filtered_noise(num_rows, scale=0.12, span=1400, rng=rng)
    battery_voltage_v = 74.4 - 0.75 * load_signal + filtered_noise(num_rows, scale=0.08, span=320, rng=rng)

    brake_cylinder_pressure_bar = np.where(
        braking_norm > 0.03,
        0.18 + 4.5 * braking_norm + filtered_noise(num_rows, scale=0.03, span=220, rng=rng),
        0.04 + np.abs(filtered_noise(num_rows, scale=0.015, span=180, rng=rng)),
    )
    brake_pipe_pressure_bar = 5.15 - 0.40 * brake_cylinder_pressure_bar + filtered_noise(
        num_rows, scale=0.02, span=220, rng=rng
    )

    comms_status = np.full(num_rows, "online", dtype=object)
    fault_code = np.full(num_rows, None, dtype=object)

    return CommonTelemetry(
        latitude=latitude.astype(np.float32),
        longitude=longitude.astype(np.float32),
        speed_kmh=speed_kmh.astype(np.float32),
        acceleration_mps2=acceleration_mps2.astype(np.float32),
        heading_deg=heading_deg.astype(np.float32),
        traction_current_a=traction_current_a.astype(np.float32),
        battery_voltage_v=np.clip(battery_voltage_v, 71.5, 75.8).astype(np.float32),
        brake_pipe_pressure_bar=np.clip(brake_pipe_pressure_bar, 3.2, 5.3).astype(np.float32),
        brake_cylinder_pressure_bar=np.clip(brake_cylinder_pressure_bar, 0.0, 5.0).astype(np.float32),
        traction_motor_temp_c=np.clip(traction_motor_temp_c, ambient + 10.0, 125.0).astype(np.float32),
        bearing_temp_c=np.clip(bearing_temp_c, ambient + 6.0, 95.0).astype(np.float32),
        fault_code=fault_code,
        comms_status=comms_status,
        load_signal=load_signal.astype(np.float32),
        speed_norm=speed_norm.astype(np.float32),
    )


def simulate_kz8a_fields(common: CommonTelemetry, locomotive: LocomotiveSpec, rng: np.random.Generator) -> TypeSpecificTelemetry:
    num_rows = len(common.speed_kmh)
    ambient = locomotive.ambient_temp_c
    load_thermal = pd.Series(common.load_signal).ewm(span=22_000, adjust=False).mean().to_numpy(dtype=np.float32)

    catenary_voltage_kv = 25.1 - 0.25 * common.load_signal + filtered_noise(num_rows, scale=0.09, span=280, rng=rng)
    transformer_temp_c = ambient + 22.0 + 58.0 * load_thermal + filtered_noise(num_rows, scale=0.18, span=700, rng=rng)

    nan_column = np.full(num_rows, np.nan, dtype=np.float32)
    return TypeSpecificTelemetry(
        catenary_voltage_kv=np.clip(catenary_voltage_kv, 23.5, 26.5).astype(np.float32),
        transformer_temp_c=np.clip(transformer_temp_c, ambient + 18.0, 135.0).astype(np.float32),
        engine_rpm=nan_column.copy(),
        coolant_temp_c=nan_column.copy(),
        oil_pressure_bar=nan_column.copy(),
        fuel_level_l=nan_column.copy(),
        fuel_rate_lph=nan_column.copy(),
    )


def simulate_te33a_fields(
    common: CommonTelemetry,
    locomotive: LocomotiveSpec,
    dt_s: float,
    rng: np.random.Generator,
) -> TypeSpecificTelemetry:
    num_rows = len(common.speed_kmh)
    ambient = locomotive.ambient_temp_c

    rpm_noise = filtered_noise(num_rows, scale=5.0, span=260, rng=rng)
    engine_rpm = 380.0 + 440.0 * common.speed_norm + 260.0 * common.load_signal + rpm_noise
    engine_rpm = np.where(common.speed_kmh < 1.0, 395.0 + filtered_noise(num_rows, 3.0, 160, rng), engine_rpm)
    engine_rpm = np.clip(engine_rpm, 360.0, 1080.0).astype(np.float32)

    fuel_rate_lph = 16.0 + 210.0 * (0.18 * common.speed_norm + 0.82 * common.load_signal) + filtered_noise(
        num_rows, scale=1.4, span=260, rng=rng
    )
    fuel_rate_lph = np.clip(fuel_rate_lph, 12.0, 290.0).astype(np.float32)

    initial_fuel_l = float(rng.uniform(4_800.0, 6_100.0))
    fuel_burn_l = np.cumsum(fuel_rate_lph.astype(np.float64) * dt_s / 3600.0)
    fuel_level_l = np.minimum.accumulate((initial_fuel_l - fuel_burn_l).astype(np.float32))

    coolant_load = pd.Series(common.load_signal).ewm(span=20_000, adjust=False).mean().to_numpy(dtype=np.float32)
    coolant_temp_c = ambient + 44.0 + 25.0 * coolant_load + filtered_noise(num_rows, scale=0.16, span=700, rng=rng)
    oil_pressure_bar = (
        2.4
        + 2.2 * np.clip((engine_rpm - 360.0) / 720.0, 0.0, 1.0)
        - 0.20 * coolant_load
        + filtered_noise(num_rows, scale=0.04, span=240, rng=rng)
    )

    nan_column = np.full(num_rows, np.nan, dtype=np.float32)
    return TypeSpecificTelemetry(
        catenary_voltage_kv=nan_column.copy(),
        transformer_temp_c=nan_column.copy(),
        engine_rpm=engine_rpm.astype(np.float32),
        coolant_temp_c=np.clip(coolant_temp_c, ambient + 38.0, 112.0).astype(np.float32),
        oil_pressure_bar=np.clip(oil_pressure_bar, 1.8, 5.6).astype(np.float32),
        fuel_level_l=fuel_level_l.astype(np.float32),
        fuel_rate_lph=fuel_rate_lph.astype(np.float32),
        initial_fuel_l=initial_fuel_l,
    )


def anomaly_profile(length: int) -> np.ndarray:
    x = np.linspace(0.0, np.pi, length, dtype=np.float32)
    return np.sin(x) ** 2


def merge_fault_codes(existing: object, new_code: str) -> str:
    if existing is None or (isinstance(existing, float) and np.isnan(existing)):
        return new_code
    if not isinstance(existing, str):
        return new_code
    tokens = existing.split("|")
    if new_code in tokens:
        return existing
    return f"{existing}|{new_code}"


def assign_fault(fault_code: np.ndarray, start: int, end: int, code: str) -> None:
    for idx in range(start, end):
        fault_code[idx] = merge_fault_codes(fault_code[idx], code)


def pick_window(
    num_rows: int,
    center_fraction: float,
    width_fraction: float,
    min_length: int,
    max_length: int,
    rng: np.random.Generator,
) -> tuple[int, int]:
    max_length = max(2, min(max_length, num_rows))
    min_length = max(2, min(min_length, max_length))
    if min_length == max_length:
        length = min_length
    else:
        length = int(rng.integers(min_length, max_length + 1))
    jitter = int(num_rows * width_fraction)
    center = int(num_rows * center_fraction + rng.integers(-jitter, jitter + 1))
    max_start = max(0, num_rows - length)
    start = max(0, min(max_start, center - length // 2))
    end = min(num_rows, start + length)
    return start, end


def freeze_columns(telemetry: dict[str, np.ndarray], start: int, end: int, columns: list[str]) -> None:
    if start <= 0 or end <= start:
        return
    for column in columns:
        values = telemetry[column]
        stale = values[start - 1].copy() if isinstance(values[start - 1], np.ndarray) else values[start - 1]
        values[start:end] = stale


def inject_comms_behavior(telemetry: dict[str, np.ndarray], start: int, end: int, status: str, rng: np.random.Generator) -> None:
    telemetry["comms_status"][start:end] = status
    if status == "degraded":
        assign_fault(telemetry["fault_code"], start, end, "COMMS_DEGRADED")
        mask = rng.random(end - start) < 0.35
        numeric_columns = [
            "latitude",
            "longitude",
            "speed_kmh",
            "heading_deg",
            "traction_current_a",
            "battery_voltage_v",
        ]
        for column in numeric_columns:
            values = telemetry[column]
            for offset, should_stale in enumerate(mask, start=start):
                if should_stale and offset > 0:
                    values[offset] = values[offset - 1]
    elif status == "offline":
        assign_fault(telemetry["fault_code"], start, end, "COMMS_OFFLINE")
        freeze_columns(
            telemetry,
            start,
            end,
            [
                "latitude",
                "longitude",
                "speed_kmh",
                "acceleration_mps2",
                "heading_deg",
                "traction_current_a",
                "battery_voltage_v",
                "brake_pipe_pressure_bar",
                "brake_cylinder_pressure_bar",
                "traction_motor_temp_c",
                "bearing_temp_c",
                "catenary_voltage_kv",
                "transformer_temp_c",
                "engine_rpm",
                "coolant_temp_c",
                "oil_pressure_bar",
                "fuel_level_l",
                "fuel_rate_lph",
            ],
        )


def inject_anomaly_windows(
    telemetry: dict[str, np.ndarray],
    locomotive: LocomotiveSpec,
    dt_s: float,
    rng: np.random.Generator,
) -> None:
    num_rows = len(telemetry["speed_kmh"])

    degraded_start, degraded_end = pick_window(num_rows, 0.22, 0.03, 3_000, 8_000, rng)
    inject_comms_behavior(telemetry, degraded_start, degraded_end, "degraded", rng)

    offline_start, offline_end = pick_window(num_rows, 0.82, 0.04, 1_500, 4_000, rng)
    inject_comms_behavior(telemetry, offline_start, offline_end, "offline", rng)

    if locomotive.locomotive_type == "KZ8A":
        start, end = pick_window(num_rows, 0.30, 0.04, 6_000, 12_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["catenary_voltage_kv"][start:end] -= (2.8 + rng.uniform(0.7, 1.6)) * profile
        telemetry["transformer_temp_c"][start:end] += (3.0 + rng.uniform(1.0, 2.5)) * profile
        assign_fault(telemetry["fault_code"], start, end, "KZ8A_CAT_LOW")

        start, end = pick_window(num_rows, 0.69, 0.05, 8_000, 16_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["transformer_temp_c"][start:end] += (12.0 + rng.uniform(5.0, 9.0)) * profile
        telemetry["traction_motor_temp_c"][start:end] += (3.0 + rng.uniform(1.0, 3.0)) * profile
        telemetry["traction_current_a"][start:end] += (30.0 + rng.uniform(10.0, 25.0)) * profile
        assign_fault(telemetry["fault_code"], start, end, "KZ8A_XFMR_HOT")

        telemetry["catenary_voltage_kv"] = np.clip(telemetry["catenary_voltage_kv"], 18.0, 26.5).astype(np.float32)
        telemetry["transformer_temp_c"] = np.clip(telemetry["transformer_temp_c"], 35.0, 145.0).astype(np.float32)
    else:
        start, end = pick_window(num_rows, 0.33, 0.05, 8_000, 15_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["oil_pressure_bar"][start:end] -= (1.2 + rng.uniform(0.6, 1.0)) * profile
        telemetry["fuel_rate_lph"][start:end] += (10.0 + rng.uniform(4.0, 10.0)) * profile
        telemetry["coolant_temp_c"][start:end] += (2.0 + rng.uniform(0.5, 2.0)) * profile
        telemetry["engine_rpm"][start:end] += (12.0 + rng.uniform(4.0, 14.0)) * profile
        assign_fault(telemetry["fault_code"], start, end, "TE33A_OIL_LOW")

        start, end = pick_window(num_rows, 0.73, 0.05, 9_000, 18_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["coolant_temp_c"][start:end] += (10.0 + rng.uniform(5.0, 8.0)) * profile
        telemetry["fuel_rate_lph"][start:end] += (14.0 + rng.uniform(4.0, 12.0)) * profile
        telemetry["engine_rpm"][start:end] += (25.0 + rng.uniform(5.0, 20.0)) * profile
        telemetry["oil_pressure_bar"][start:end] -= (0.2 + rng.uniform(0.05, 0.25)) * profile
        assign_fault(telemetry["fault_code"], start, end, "TE33A_COOLANT_HOT")

        if telemetry["fuel_level_l"].size > 0:
            initial_fuel_l = float(telemetry["fuel_level_l"][0] + telemetry["fuel_rate_lph"][0] * dt_s / 3600.0)
            telemetry["fuel_rate_lph"] = np.clip(telemetry["fuel_rate_lph"], 12.0, 320.0).astype(np.float32)
            fuel_burn_l = np.cumsum(telemetry["fuel_rate_lph"].astype(np.float64) * dt_s / 3600.0)
            telemetry["fuel_level_l"] = np.minimum.accumulate((initial_fuel_l - fuel_burn_l).astype(np.float32))
        telemetry["coolant_temp_c"] = np.clip(telemetry["coolant_temp_c"], 60.0, 118.0).astype(np.float32)
        telemetry["oil_pressure_bar"] = np.clip(telemetry["oil_pressure_bar"], 0.8, 5.6).astype(np.float32)
        telemetry["engine_rpm"] = np.clip(telemetry["engine_rpm"], 360.0, 1100.0).astype(np.float32)

    telemetry["battery_voltage_v"] = np.clip(telemetry["battery_voltage_v"], 71.0, 75.8).astype(np.float32)
    telemetry["brake_pipe_pressure_bar"] = np.clip(telemetry["brake_pipe_pressure_bar"], 3.2, 5.3).astype(np.float32)
    telemetry["brake_cylinder_pressure_bar"] = np.clip(telemetry["brake_cylinder_pressure_bar"], 0.0, 5.0).astype(np.float32)
    telemetry["traction_motor_temp_c"] = np.clip(telemetry["traction_motor_temp_c"], 20.0, 130.0).astype(np.float32)
    telemetry["bearing_temp_c"] = np.clip(telemetry["bearing_temp_c"], 15.0, 95.0).astype(np.float32)


def build_dataframe(telemetry: dict[str, np.ndarray]) -> pd.DataFrame:
    df = pd.DataFrame({column: telemetry[column] for column in OUTPUT_COLUMNS}, columns=OUTPUT_COLUMNS)
    for column in FLOAT_COLUMNS:
        df[column] = df[column].astype(np.float32)
    df["t_ms"] = df["t_ms"].astype(np.int64)
    df["locomotive_id"] = pd.Categorical(df["locomotive_id"])
    df["locomotive_type"] = pd.Categorical(df["locomotive_type"])
    df["comms_status"] = pd.Categorical(df["comms_status"], categories=sorted(ALLOWED_COMMS))
    df["fault_code"] = df["fault_code"].astype("string")
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=False)
    return df


def generate_locomotive_dataframe(
    locomotive: LocomotiveSpec,
    route: Route,
    num_rows: int,
    config: GeneratorConfig,
    seed: int,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    timestamps, t_ms = generate_time_axis(locomotive.start_time, num_rows)
    motion = simulate_motion_profile(num_rows, locomotive.locomotive_type, config.dt_s, rng)
    common = simulate_common_telemetry(locomotive, route, motion, rng)

    if locomotive.locomotive_type == "KZ8A":
        type_specific = simulate_kz8a_fields(common, locomotive, rng)
    elif locomotive.locomotive_type == "TE33A":
        type_specific = simulate_te33a_fields(common, locomotive, config.dt_s, rng)
    else:
        raise ValueError(f"Unsupported locomotive type: {locomotive.locomotive_type}")

    telemetry = {
        "timestamp": timestamps,
        "t_ms": t_ms,
        "locomotive_id": np.full(num_rows, locomotive.locomotive_id, dtype=object),
        "locomotive_type": np.full(num_rows, locomotive.locomotive_type, dtype=object),
        "latitude": common.latitude,
        "longitude": common.longitude,
        "speed_kmh": common.speed_kmh,
        "acceleration_mps2": common.acceleration_mps2,
        "heading_deg": common.heading_deg,
        "traction_current_a": common.traction_current_a,
        "battery_voltage_v": common.battery_voltage_v,
        "brake_pipe_pressure_bar": common.brake_pipe_pressure_bar,
        "brake_cylinder_pressure_bar": common.brake_cylinder_pressure_bar,
        "traction_motor_temp_c": common.traction_motor_temp_c,
        "bearing_temp_c": common.bearing_temp_c,
        "fault_code": common.fault_code,
        "comms_status": common.comms_status,
        "catenary_voltage_kv": type_specific.catenary_voltage_kv,
        "transformer_temp_c": type_specific.transformer_temp_c,
        "engine_rpm": type_specific.engine_rpm,
        "coolant_temp_c": type_specific.coolant_temp_c,
        "oil_pressure_bar": type_specific.oil_pressure_bar,
        "fuel_level_l": type_specific.fuel_level_l,
        "fuel_rate_lph": type_specific.fuel_rate_lph,
    }
    inject_anomaly_windows(telemetry, locomotive, config.dt_s, rng)
    return build_dataframe(telemetry)


def save_outputs(df: pd.DataFrame, output_dir: Path, output_formats: tuple[str, ...]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    format_set = {fmt.lower() for fmt in output_formats}

    if "csv" in format_set:
        df.to_csv(output_dir / "telemetry.csv", index=False)
    if "jsonl" in format_set:
        df.to_json(output_dir / "telemetry.jsonl", orient="records", lines=True, date_format="iso")
    if "parquet" in format_set:
        try:
            df.to_parquet(output_dir / "telemetry.parquet", index=False)
        except (ImportError, ModuleNotFoundError, ValueError) as exc:
            warnings.warn(f"Skipping parquet export: {exc}", stacklevel=2)


def validate_fault_codes(series: pd.Series) -> None:
    invalid_codes: set[str] = set()
    for value in series.dropna().astype(str):
        for atom in value.split("|"):
            if atom not in ALLOWED_FAULT_ATOMS:
                invalid_codes.add(atom)
    if invalid_codes:
        raise ValueError(f"Unexpected fault code atoms detected: {sorted(invalid_codes)}")


def validate_dataframe(df: pd.DataFrame) -> None:
    lat_ok = df["latitude"].between(40.0, 56.5)
    lon_ok = df["longitude"].between(46.0, 88.5)
    if not bool(lat_ok.all() and lon_ok.all()):
        raise ValueError("Generated GPS coordinates fell outside Kazakhstan bounds.")

    numeric_ranges: dict[str, tuple[float, float]] = {
        "speed_kmh": (0.0, 120.0),
        "heading_deg": (0.0, 360.0),
        "traction_current_a": (0.0, 1200.0),
        "battery_voltage_v": (70.0, 76.0),
        "brake_pipe_pressure_bar": (3.0, 5.4),
        "brake_cylinder_pressure_bar": (0.0, 5.1),
        "traction_motor_temp_c": (10.0, 135.0),
        "bearing_temp_c": (0.0, 100.0),
        "catenary_voltage_kv": (18.0, 27.0),
        "transformer_temp_c": (15.0, 150.0),
        "engine_rpm": (300.0, 1100.0),
        "coolant_temp_c": (50.0, 120.0),
        "oil_pressure_bar": (0.0, 6.0),
        "fuel_rate_lph": (0.0, 350.0),
        "fuel_level_l": (0.0, 7000.0),
    }
    for column, (low, high) in numeric_ranges.items():
        mask = df[column].dropna().between(low, high)
        if not bool(mask.all()):
            raise ValueError(f"Column {column} contains values outside [{low}, {high}].")

    if not df["comms_status"].isin(ALLOWED_COMMS).all():
        invalid = sorted(set(df["comms_status"].astype(str)) - ALLOWED_COMMS)
        raise ValueError(f"Unexpected comms states detected: {invalid}")

    validate_fault_codes(df["fault_code"])

    for locomotive_id, group in df.groupby("locomotive_id", sort=False, observed=True):
        t_ms = group["t_ms"].to_numpy(dtype=np.int64)
        if not np.all(np.diff(t_ms) == 1):
            raise ValueError(f"Non-monotonic or non-contiguous t_ms for {locomotive_id}.")
        if not group["timestamp"].is_monotonic_increasing:
            raise ValueError(f"Timestamps are not strictly increasing for {locomotive_id}.")

        loco_type = str(group["locomotive_type"].iloc[0])
        if loco_type == "TE33A":
            fuel = group["fuel_level_l"].dropna().to_numpy(dtype=np.float64)
            if fuel.size and np.any(np.diff(fuel) > 1e-6):
                raise ValueError(f"Fuel level increased for {locomotive_id}.")
            if not group["catenary_voltage_kv"].isna().all() or not group["transformer_temp_c"].isna().all():
                raise ValueError(f"Electric-only fields must be NaN for {locomotive_id}.")
        elif loco_type == "KZ8A":
            diesel_fields = ["engine_rpm", "coolant_temp_c", "oil_pressure_bar", "fuel_level_l", "fuel_rate_lph"]
            if not group[diesel_fields].isna().all().all():
                raise ValueError(f"Diesel-only fields must be NaN for {locomotive_id}.")
        else:
            raise ValueError(f"Unsupported locomotive type detected during validation: {loco_type}")

        offline_mask = group["comms_status"].astype(str).eq("offline").to_numpy()
        if offline_mask.any():
            speed = group["speed_kmh"].to_numpy(dtype=np.float32)
            if offline_mask.sum() > 1 and np.all(np.diff(speed[offline_mask]) != 0.0):
                raise ValueError(f"Offline window for {locomotive_id} did not create stale telemetry behavior.")


def print_summary(df: pd.DataFrame) -> None:
    rows_per_locomotive = df.groupby("locomotive_id", sort=False, observed=True).size().to_dict()
    locomotive_types = sorted(df["locomotive_type"].dropna().astype(str).unique().tolist())
    print(f"total rows: {len(df):,}")
    print(f"rows per locomotive: {rows_per_locomotive}")
    print(f"min timestamp: {df['timestamp'].min()}")
    print(f"max timestamp: {df['timestamp'].max()}")
    print(f"locomotive types present: {locomotive_types}")
    print(f"fault distribution: {df['fault_code'].fillna('NONE').value_counts().head(10).to_dict()}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate synthetic locomotive telemetry.")
    parser.add_argument("--rows", type=int, default=TOTAL_ROWS_TARGET, help="Total rows across all locomotives.")
    parser.add_argument("--sample-rate-hz", type=int, default=SAMPLE_RATE_HZ, help="Sample rate in Hz.")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="Base random seed.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Output directory.")
    parser.add_argument(
        "--formats",
        nargs="+",
        default=["csv", "jsonl", "parquet"],
        choices=["csv", "jsonl", "parquet"],
        help="Output formats to write.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = GeneratorConfig(
        total_rows_target=args.rows,
        sample_rate_hz=args.sample_rate_hz,
        random_seed=args.seed,
        output_dir=args.output_dir,
        output_formats=tuple(args.formats),
    )

    routes = create_routes()
    locomotives = create_locomotives()
    row_counts = distribute_rows(config.total_rows_target, len(locomotives))

    frames: list[pd.DataFrame] = []
    for index, (locomotive, row_count) in enumerate(zip(locomotives, row_counts), start=1):
        route = routes[locomotive.route_name]
        frame = generate_locomotive_dataframe(
            locomotive=locomotive,
            route=route,
            num_rows=row_count,
            config=config,
            seed=config.random_seed + index * 10_000,
        )
        frames.append(frame)

    telemetry_df = pd.concat(frames, ignore_index=True)
    validate_dataframe(telemetry_df)
    save_outputs(telemetry_df, config.output_dir, config.output_formats)
    print_summary(telemetry_df)


if __name__ == "__main__":
    main()
