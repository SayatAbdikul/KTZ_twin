from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


RANDOM_SEED = 42
NUM_LOCOMOTIVES = 3
SAMPLE_RATE_HZ = 1000
TOTAL_ROWS_TARGET = 1_000_000
OUTPUT_DIR = Path("./synthetic_output_core")
DT_S = 1.0 / SAMPLE_RATE_HZ

COMMON_COLUMNS = [
    "timestamp",
    "t_ms",
    "locomotive_id",
    "locomotive_type",
    "speed_kmh",
    "adhesion_coeff",
    "traction_current_a",
    "brake_pipe_pressure_bar",
    "brake_cylinder_pressure_bar",
    "traction_motor_temp_c",
    "bearing_temp_c",
    "fault_code",
]

KZ8A_COLUMNS = [
    "catenary_voltage_kv",
    "transformer_temp_c",
]

TE33A_COLUMNS = [
    "fuel_level_l",
    "fuel_rate_lph",
    "oil_pressure_bar",
    "coolant_temp_c",
]

OUTPUT_COLUMNS = COMMON_COLUMNS + KZ8A_COLUMNS + TE33A_COLUMNS


def distribute_rows(total_rows: int, count: int) -> list[int]:
    base = total_rows // count
    remainder = total_rows % count
    return [base + (1 if i < remainder else 0) for i in range(count)]


def filtered_noise(size: int, scale: float, span: int, rng: np.random.Generator) -> np.ndarray:
    raw = rng.normal(0.0, scale, size=size)
    return pd.Series(raw).ewm(span=max(2, span), adjust=False).mean().to_numpy(dtype=np.float32)


def rolling_mean(values: np.ndarray, window: int) -> np.ndarray:
    return (
        pd.Series(values)
        .rolling(window=max(3, window), center=True, min_periods=1)
        .mean()
        .to_numpy(dtype=np.float32)
    )


def create_locomotives() -> list[dict[str, object]]:
    return [
        {
            "locomotive_id": "KZ8A-001",
            "locomotive_type": "KZ8A",
            "start_time": np.datetime64("2026-04-04T08:00:00.000"),
            "ambient_temp_c": 18.0,
        },
        {
            "locomotive_id": "TE33A-002",
            "locomotive_type": "TE33A",
            "start_time": np.datetime64("2026-04-04T08:02:15.000"),
            "ambient_temp_c": 23.0,
        },
        {
            "locomotive_id": "KZ8A-003",
            "locomotive_type": "KZ8A",
            "start_time": np.datetime64("2026-04-04T08:04:30.000"),
            "ambient_temp_c": 16.5,
        },
    ]


def generate_time_axis(start_time: np.datetime64, num_rows: int) -> tuple[np.ndarray, np.ndarray]:
    t_ms = np.arange(num_rows, dtype=np.int64)
    timestamps = start_time + t_ms.astype("timedelta64[ms]")
    return timestamps.astype(str), t_ms


def simulate_motion_profile(
    num_rows: int, locomotive_type: str, rng: np.random.Generator
) -> dict[str, np.ndarray]:
    target_speed = np.zeros(num_rows, dtype=np.float32)
    phase = np.empty(num_rows, dtype=object)
    idx = 0
    current_speed = 0.0
    max_cruise = 102.0 if locomotive_type == "KZ8A" else 94.0

    while idx < num_rows:
        phase_name = "idle" if idx == 0 else "stop"
        phase_len = int(rng.integers(4_000, 11_000 if idx == 0 else 14_000))
        end = min(num_rows, idx + phase_len)
        target_speed[idx:end] = 0.0
        phase[idx:end] = phase_name
        idx = end
        if idx >= num_rows:
            break

        cruise_target = float(rng.uniform(55.0, max_cruise))
        accel_len = int(rng.integers(12_000, 32_000))
        end = min(num_rows, idx + accel_len)
        target_speed[idx:end] = np.linspace(current_speed, cruise_target, end - idx, endpoint=False)
        phase[idx:end] = "accel"
        idx = end
        current_speed = cruise_target
        if idx >= num_rows:
            break

        cruise_len = int(rng.integers(24_000, 68_000))
        end = min(num_rows, idx + cruise_len)
        t = np.linspace(0.0, rng.uniform(2.0 * np.pi, 6.0 * np.pi), end - idx, endpoint=False)
        wave = 1.8 * np.sin(t) + 0.9 * np.sin(0.31 * t + rng.uniform(0.0, np.pi))
        target_speed[idx:end] = np.clip(current_speed + wave, 0.0, max_cruise + 3.0)
        phase[idx:end] = "cruise"
        if end > idx:
            current_speed = float(target_speed[end - 1])
        idx = end
        if idx >= num_rows:
            break

        brake_len = int(rng.integers(9_000, 22_000))
        end = min(num_rows, idx + brake_len)
        target_speed[idx:end] = np.linspace(current_speed, 0.0, end - idx, endpoint=False)
        phase[idx:end] = "brake"
        idx = end
        current_speed = 0.0

    speed_kmh = rolling_mean(target_speed, window=1501)
    speed_kmh += filtered_noise(num_rows, scale=0.10, span=450, rng=rng)
    stationary_mask = (phase == "idle") | (phase == "stop")
    speed_kmh[stationary_mask] *= 0.05
    speed_kmh = rolling_mean(np.clip(speed_kmh, 0.0, None), window=301)
    speed_kmh = np.clip(speed_kmh, 0.0, max_cruise + 5.0).astype(np.float32)

    speed_mps = speed_kmh / 3.6
    acceleration_mps2 = np.gradient(speed_mps, DT_S).astype(np.float32)
    accel_up = np.clip(acceleration_mps2, 0.0, None).astype(np.float32)
    braking_demand = np.clip(-acceleration_mps2 / 0.55, 0.0, 1.3).astype(np.float32)
    speed_norm = np.clip(speed_kmh / (105.0 if locomotive_type == "KZ8A" else 95.0), 0.0, 1.2).astype(np.float32)

    return {
        "phase": phase,
        "speed_kmh": speed_kmh,
        "acceleration_mps2": acceleration_mps2,
        "accel_up": accel_up,
        "braking_demand": braking_demand,
        "speed_norm": speed_norm,
    }


def simulate_common_telemetry(
    locomotive: dict[str, object],
    motion: dict[str, np.ndarray],
    rng: np.random.Generator,
) -> dict[str, np.ndarray]:
    num_rows = len(motion["speed_kmh"])
    ambient = float(locomotive["ambient_temp_c"])
    speed_kmh = motion["speed_kmh"]
    speed_norm = motion["speed_norm"]
    accel_norm = np.clip(motion["accel_up"] / 0.42, 0.0, 1.4).astype(np.float32)
    braking_demand = motion["braking_demand"]

    load_signal = np.clip(0.12 + 0.30 * speed_norm + 0.88 * accel_norm, 0.0, 1.45).astype(np.float32)
    moving_mask = speed_kmh > 1.0
    adhesion_base = 0.31 - 0.05 * speed_norm + filtered_noise(num_rows, scale=0.010, span=5_000, rng=rng)
    adhesion_coeff = np.clip(adhesion_base, 0.18, 0.38).astype(np.float32)

    traction_scale = 820.0 if locomotive["locomotive_type"] == "KZ8A" else 700.0
    traction_current_a = (
        15.0
        + 12.0 * moving_mask.astype(np.float32)
        + traction_scale * (0.16 * speed_norm + 0.90 * accel_norm)
    )
    traction_current_a *= np.clip(0.80 + 0.70 * adhesion_coeff, 0.85, 1.10).astype(np.float32)
    traction_current_a *= np.where(braking_demand > 0.05, 0.28, 1.0).astype(np.float32)
    traction_current_a += filtered_noise(num_rows, scale=7.0, span=220, rng=rng)
    traction_current_a = np.clip(traction_current_a, 6.0, 1150.0).astype(np.float32)

    brake_cylinder_pressure_bar = np.where(
        braking_demand > 0.03,
        0.20 + 4.4 * braking_demand + filtered_noise(num_rows, scale=0.03, span=220, rng=rng),
        0.05 + np.abs(filtered_noise(num_rows, scale=0.015, span=180, rng=rng)),
    )
    brake_pipe_pressure_bar = 5.15 - 0.40 * brake_cylinder_pressure_bar + filtered_noise(
        num_rows, scale=0.02, span=220, rng=rng
    )
    weak_adhesion_mask = (adhesion_coeff < 0.22) & (braking_demand > 0.18) & (speed_kmh > 25.0)
    brake_cylinder_pressure_bar = np.where(
        weak_adhesion_mask,
        brake_cylinder_pressure_bar * (0.78 + 0.12 * np.clip(adhesion_coeff / 0.22, 0.0, 1.0)),
        brake_cylinder_pressure_bar,
    )
    brake_pipe_pressure_bar = np.where(
        weak_adhesion_mask,
        brake_pipe_pressure_bar + 0.12 * (1.0 - np.clip(adhesion_coeff / 0.22, 0.0, 1.0)),
        brake_pipe_pressure_bar,
    )

    fast_thermal = pd.Series(load_signal).ewm(span=18_000, adjust=False).mean().to_numpy(dtype=np.float32)
    slow_thermal = pd.Series(load_signal).ewm(span=52_000, adjust=False).mean().to_numpy(dtype=np.float32)
    traction_motor_temp_c = ambient + 18.0 + 48.0 * fast_thermal + filtered_noise(num_rows, scale=0.22, span=700, rng=rng)
    bearing_temp_c = ambient + 9.0 + 22.0 * slow_thermal + filtered_noise(num_rows, scale=0.10, span=1400, rng=rng)

    fault_code = np.full(num_rows, None, dtype=object)

    return {
        "speed_kmh": speed_kmh.astype(np.float32),
        "adhesion_coeff": adhesion_coeff.astype(np.float32),
        "traction_current_a": traction_current_a.astype(np.float32),
        "brake_pipe_pressure_bar": np.clip(brake_pipe_pressure_bar, 3.2, 5.3).astype(np.float32),
        "brake_cylinder_pressure_bar": np.clip(brake_cylinder_pressure_bar, 0.0, 5.0).astype(np.float32),
        "traction_motor_temp_c": np.clip(traction_motor_temp_c, ambient + 10.0, 130.0).astype(np.float32),
        "bearing_temp_c": np.clip(bearing_temp_c, ambient + 6.0, 95.0).astype(np.float32),
        "fault_code": fault_code,
        "_load_signal": load_signal.astype(np.float32),
        "_braking_demand": braking_demand.astype(np.float32),
        "_speed_norm": speed_norm.astype(np.float32),
    }


def simulate_kz8a_fields(
    common: dict[str, np.ndarray], locomotive: dict[str, object], rng: np.random.Generator
) -> dict[str, np.ndarray]:
    num_rows = len(common["speed_kmh"])
    ambient = float(locomotive["ambient_temp_c"])
    load_signal = common["_load_signal"]
    load_thermal = pd.Series(load_signal).ewm(span=22_000, adjust=False).mean().to_numpy(dtype=np.float32)

    catenary_voltage_kv = 25.0 - 0.22 * load_signal + filtered_noise(num_rows, scale=0.08, span=280, rng=rng)
    transformer_temp_c = ambient + 22.0 + 60.0 * load_thermal + filtered_noise(num_rows, scale=0.18, span=700, rng=rng)

    return {
        "catenary_voltage_kv": np.clip(catenary_voltage_kv, 23.5, 26.5).astype(np.float32),
        "transformer_temp_c": np.clip(transformer_temp_c, ambient + 18.0, 145.0).astype(np.float32),
        "fuel_level_l": np.full(num_rows, np.nan, dtype=np.float32),
        "fuel_rate_lph": np.full(num_rows, np.nan, dtype=np.float32),
        "oil_pressure_bar": np.full(num_rows, np.nan, dtype=np.float32),
        "coolant_temp_c": np.full(num_rows, np.nan, dtype=np.float32),
    }


def simulate_te33a_fields(
    common: dict[str, np.ndarray], locomotive: dict[str, object], rng: np.random.Generator
) -> dict[str, np.ndarray]:
    num_rows = len(common["speed_kmh"])
    ambient = float(locomotive["ambient_temp_c"])
    load_signal = common["_load_signal"]
    speed_norm = common["_speed_norm"]

    fuel_rate_lph = 16.0 + 215.0 * (0.22 * speed_norm + 0.78 * load_signal) + filtered_noise(
        num_rows, scale=1.4, span=260, rng=rng
    )
    fuel_rate_lph = np.clip(fuel_rate_lph, 12.0, 300.0).astype(np.float32)

    initial_fuel_l = float(rng.uniform(4_800.0, 6_100.0))
    fuel_burn_l = np.cumsum(fuel_rate_lph.astype(np.float64) * DT_S / 3600.0)
    fuel_level_l = np.minimum.accumulate((initial_fuel_l - fuel_burn_l).astype(np.float32))

    coolant_load = pd.Series(load_signal).ewm(span=20_000, adjust=False).mean().to_numpy(dtype=np.float32)
    coolant_temp_c = ambient + 44.0 + 24.0 * coolant_load + filtered_noise(num_rows, scale=0.16, span=700, rng=rng)
    oil_pressure_bar = (
        2.6
        + 1.6 * np.clip(0.20 + 0.80 * speed_norm, 0.0, 1.0)
        - 0.18 * coolant_load
        + filtered_noise(num_rows, scale=0.04, span=240, rng=rng)
    )

    return {
        "catenary_voltage_kv": np.full(num_rows, np.nan, dtype=np.float32),
        "transformer_temp_c": np.full(num_rows, np.nan, dtype=np.float32),
        "fuel_level_l": fuel_level_l.astype(np.float32),
        "fuel_rate_lph": fuel_rate_lph.astype(np.float32),
        "oil_pressure_bar": np.clip(oil_pressure_bar, 1.8, 5.5).astype(np.float32),
        "coolant_temp_c": np.clip(coolant_temp_c, ambient + 38.0, 118.0).astype(np.float32),
        "_initial_fuel_l": np.array([initial_fuel_l], dtype=np.float32),
    }


def anomaly_profile(length: int) -> np.ndarray:
    x = np.linspace(0.0, np.pi, length, dtype=np.float32)
    return np.sin(x) ** 2


def assign_fault(fault_code: np.ndarray, start: int, end: int, code: str, overwrite: bool = True) -> None:
    if overwrite:
        fault_code[start:end] = code
        return
    segment = fault_code[start:end]
    mask = np.array([value is None for value in segment])
    segment[mask] = code


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
    center = int(
        num_rows * center_fraction
        + rng.integers(-int(num_rows * width_fraction), int(num_rows * width_fraction) + 1)
    )
    max_start = max(0, num_rows - length)
    start = max(0, min(max_start, center - length // 2))
    end = min(num_rows, start + length)
    return start, end


def pick_brake_fault_window(
    speed_kmh: np.ndarray, braking_demand: np.ndarray, rng: np.random.Generator
) -> tuple[int, int] | None:
    candidates = np.flatnonzero((speed_kmh > 45.0) & (braking_demand > 0.30))
    if len(candidates) == 0:
        return None
    center = int(candidates[len(candidates) // 2])
    length = int(rng.integers(4_000, 8_000))
    start = max(0, center - length // 2)
    end = min(len(speed_kmh), start + length)
    return start, end


def inject_anomaly_windows(
    telemetry: dict[str, np.ndarray], locomotive: dict[str, object], rng: np.random.Generator
) -> None:
    num_rows = len(telemetry["speed_kmh"])

    start, end = pick_window(num_rows, 0.52, 0.08, 8_000, 16_000, rng)
    profile = anomaly_profile(end - start)
    telemetry["adhesion_coeff"][start:end] -= (0.07 + rng.uniform(0.02, 0.05)) * profile

    weak_brake_window = pick_brake_fault_window(
        telemetry["speed_kmh"], telemetry["_braking_demand"], rng
    )
    if weak_brake_window is not None:
        start, end = weak_brake_window
        profile = anomaly_profile(end - start)
        telemetry["brake_cylinder_pressure_bar"][start:end] *= (0.35 + 0.20 * (1.0 - profile))
        telemetry["brake_pipe_pressure_bar"][start:end] += (0.45 + rng.uniform(0.08, 0.22)) * profile
        assign_fault(telemetry["fault_code"], start, end, "BRAKE_RESPONSE_WEAK")

    if locomotive["locomotive_type"] == "KZ8A":
        start, end = pick_window(num_rows, 0.32, 0.05, 6_000, 12_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["catenary_voltage_kv"][start:end] -= (2.4 + rng.uniform(0.6, 1.3)) * profile
        assign_fault(telemetry["fault_code"], start, end, "KZ8A_VOLTAGE_DIP", overwrite=False)

        start, end = pick_window(num_rows, 0.72, 0.05, 8_000, 16_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["transformer_temp_c"][start:end] += (12.0 + rng.uniform(4.0, 8.0)) * profile
        telemetry["traction_motor_temp_c"][start:end] += (2.0 + rng.uniform(1.0, 3.0)) * profile
        assign_fault(telemetry["fault_code"], start, end, "KZ8A_TRANSFORMER_HOT", overwrite=False)

        telemetry["catenary_voltage_kv"] = np.clip(telemetry["catenary_voltage_kv"], 18.0, 26.5).astype(np.float32)
        telemetry["transformer_temp_c"] = np.clip(telemetry["transformer_temp_c"], 35.0, 150.0).astype(np.float32)
    else:
        start, end = pick_window(num_rows, 0.34, 0.05, 7_000, 14_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["oil_pressure_bar"][start:end] -= (1.3 + rng.uniform(0.5, 0.9)) * profile
        telemetry["coolant_temp_c"][start:end] += (2.0 + rng.uniform(0.5, 1.5)) * profile
        assign_fault(telemetry["fault_code"], start, end, "TE33A_OIL_LOW", overwrite=False)

        start, end = pick_window(num_rows, 0.74, 0.05, 9_000, 18_000, rng)
        profile = anomaly_profile(end - start)
        telemetry["coolant_temp_c"][start:end] += (10.0 + rng.uniform(4.0, 8.0)) * profile
        telemetry["fuel_rate_lph"][start:end] += (14.0 + rng.uniform(4.0, 10.0)) * profile
        assign_fault(telemetry["fault_code"], start, end, "TE33A_COOLANT_HOT", overwrite=False)

        initial_fuel_l = float(telemetry["_initial_fuel_l"][0])
        telemetry["fuel_rate_lph"] = np.clip(telemetry["fuel_rate_lph"], 12.0, 320.0).astype(np.float32)
        fuel_burn_l = np.cumsum(telemetry["fuel_rate_lph"].astype(np.float64) * DT_S / 3600.0)
        telemetry["fuel_level_l"] = np.minimum.accumulate((initial_fuel_l - fuel_burn_l).astype(np.float32))
        telemetry["oil_pressure_bar"] = np.clip(telemetry["oil_pressure_bar"], 0.8, 5.5).astype(np.float32)
        telemetry["coolant_temp_c"] = np.clip(telemetry["coolant_temp_c"], 60.0, 120.0).astype(np.float32)

    telemetry["adhesion_coeff"] = np.clip(telemetry["adhesion_coeff"], 0.10, 0.40).astype(np.float32)
    telemetry["brake_pipe_pressure_bar"] = np.clip(telemetry["brake_pipe_pressure_bar"], 3.0, 5.3).astype(np.float32)
    telemetry["brake_cylinder_pressure_bar"] = np.clip(telemetry["brake_cylinder_pressure_bar"], 0.0, 5.0).astype(np.float32)
    telemetry["traction_motor_temp_c"] = np.clip(telemetry["traction_motor_temp_c"], 20.0, 130.0).astype(np.float32)
    telemetry["bearing_temp_c"] = np.clip(telemetry["bearing_temp_c"], 15.0, 95.0).astype(np.float32)


def generate_locomotive_dataframe(
    locomotive: dict[str, object], num_rows: int, seed: int
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    timestamps, t_ms = generate_time_axis(locomotive["start_time"], num_rows)
    motion = simulate_motion_profile(num_rows, str(locomotive["locomotive_type"]), rng)
    common = simulate_common_telemetry(locomotive, motion, rng)

    if locomotive["locomotive_type"] == "KZ8A":
        type_specific = simulate_kz8a_fields(common, locomotive, rng)
    else:
        type_specific = simulate_te33a_fields(common, locomotive, rng)

    telemetry = {
        "timestamp": timestamps,
        "t_ms": t_ms,
        "locomotive_id": np.full(num_rows, locomotive["locomotive_id"], dtype=object),
        "locomotive_type": np.full(num_rows, locomotive["locomotive_type"], dtype=object),
        **common,
        **type_specific,
    }
    inject_anomaly_windows(telemetry, locomotive, rng)

    data = {column: telemetry[column] for column in OUTPUT_COLUMNS}
    return pd.DataFrame(data, columns=OUTPUT_COLUMNS)


def save_outputs(df: pd.DataFrame, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_dir / "telemetry.csv", index=False)
    df.to_json(output_dir / "telemetry.jsonl", orient="records", lines=True)
    try:
        df.to_parquet(output_dir / "telemetry.parquet", index=False)
    except (ImportError, ModuleNotFoundError, ValueError):
        pass


def validate_dataframe(df: pd.DataFrame) -> None:
    for locomotive_id, group in df.groupby("locomotive_id", sort=False):
        t_ms = group["t_ms"].to_numpy()
        if not np.all(np.diff(t_ms) == 1):
            raise ValueError(f"Non-monotonic or non-contiguous t_ms for {locomotive_id}.")
        if not group["timestamp"].is_monotonic_increasing:
            raise ValueError(f"Timestamps are not strictly increasing for {locomotive_id}.")
        if not (group["speed_kmh"] >= 0.0).all():
            raise ValueError(f"Negative speed for {locomotive_id}.")

        loco_type = group["locomotive_type"].iloc[0]
        if loco_type == "TE33A":
            fuel = group["fuel_level_l"].to_numpy(dtype=np.float64)
            if np.any(np.diff(fuel) > 1e-9):
                raise ValueError(f"Fuel level increased for {locomotive_id}.")


def print_summary(df: pd.DataFrame) -> None:
    rows_per_locomotive = df.groupby("locomotive_id", sort=False).size().to_dict()
    locomotive_types = sorted(df["locomotive_type"].dropna().unique().tolist())
    print(f"total rows: {len(df):,}")
    print(f"rows per locomotive: {rows_per_locomotive}")
    print(f"min timestamp: {df['timestamp'].min()}")
    print(f"max timestamp: {df['timestamp'].max()}")
    print(f"locomotive types present: {locomotive_types}")


def main() -> None:
    if NUM_LOCOMOTIVES != 3:
        raise ValueError("This generator is configured for exactly 3 locomotives.")

    locomotives = create_locomotives()
    row_counts = distribute_rows(TOTAL_ROWS_TARGET, len(locomotives))

    frames = []
    for index, (locomotive, row_count) in enumerate(zip(locomotives, row_counts), start=1):
        frames.append(
            generate_locomotive_dataframe(
                locomotive=locomotive,
                num_rows=row_count,
                seed=RANDOM_SEED + index * 10_000,
            )
        )

    telemetry_df = pd.concat(frames, ignore_index=True)
    validate_dataframe(telemetry_df)
    save_outputs(telemetry_df, OUTPUT_DIR)
    print_summary(telemetry_df)


if __name__ == "__main__":
    main()
