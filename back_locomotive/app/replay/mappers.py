from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import METRIC_BY_ID, TE33A_TANK_CAPACITY_L
from app.models import MetricReading, TelemetryFrame


def parse_timestamp_ms(value: str) -> int:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _float_or_none(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    return float(text)


def _int_or_zero(value: str | None) -> int:
    if value is None:
        return 0
    text = value.strip()
    if not text:
        return 0
    return int(text)


def normalize_csv_row(row: dict[str, str]) -> dict[str, Any]:
    timestamp = row["timestamp"].strip()
    return {
        "timestamp": timestamp,
        "timestamp_ms": parse_timestamp_ms(timestamp),
        "t_ms": _int_or_zero(row.get("t_ms")),
        "locomotive_id": row["locomotive_id"].strip(),
        "locomotive_type": row["locomotive_type"].strip(),
        "speed_kmh": _float_or_none(row.get("speed_kmh")) or 0.0,
        "acceleration_mps2": _float_or_none(row.get("acceleration_mps2")),
        "adhesion_coeff": _float_or_none(row.get("adhesion_coeff")),
        "traction_current_a": _float_or_none(row.get("traction_current_a")) or 0.0,
        "battery_voltage_v": _float_or_none(row.get("battery_voltage_v")),
        "brake_pipe_pressure_bar": _float_or_none(row.get("brake_pipe_pressure_bar")) or 0.0,
        "brake_cylinder_pressure_bar": _float_or_none(row.get("brake_cylinder_pressure_bar")),
        "traction_motor_temp_c": _float_or_none(row.get("traction_motor_temp_c")) or 0.0,
        "bearing_temp_c": _float_or_none(row.get("bearing_temp_c")) or 0.0,
        "fault_code": (row.get("fault_code") or "").strip() or None,
        "catenary_voltage_kv": _float_or_none(row.get("catenary_voltage_kv")),
        "transformer_temp_c": _float_or_none(row.get("transformer_temp_c")),
        "fuel_level_l": _float_or_none(row.get("fuel_level_l")),
        "fuel_rate_lph": _float_or_none(row.get("fuel_rate_lph")),
        "oil_pressure_bar": _float_or_none(row.get("oil_pressure_bar")),
        "coolant_temp_c": _float_or_none(row.get("coolant_temp_c")),
    }


def raw_event_payload(row: dict[str, Any], emitted_at_ms: int) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "event_type": "telemetry.raw",
        "emitted_at_ms": emitted_at_ms,
        "locomotive_id": row["locomotive_id"],
        "locomotive_type": row["locomotive_type"],
        "telemetry": dict(row),
    }


def frontend_metric_values(row: dict[str, Any]) -> list[tuple[str, float]]:
    values: list[tuple[str, float]] = [
        ("motion.speed", row["speed_kmh"]),
        ("electrical.traction_current", row["traction_current_a"]),
        ("pressure.brake_pipe", row["brake_pipe_pressure_bar"]),
        ("thermal.traction_motor_temp", row["traction_motor_temp_c"]),
        ("thermal.bearing_temp", row["bearing_temp_c"]),
    ]

    if row.get("adhesion_coeff") is not None:
        values.append(("motion.adhesion", row["adhesion_coeff"]))
    if row.get("brake_cylinder_pressure_bar") is not None:
        values.append(("pressure.brake_cylinder", row["brake_cylinder_pressure_bar"]))
    if row.get("battery_voltage_v") is not None:
        values.append(("electrical.battery_voltage", row["battery_voltage_v"]))
    if row.get("catenary_voltage_kv") is not None:
        values.append(("electrical.catenary_voltage", row["catenary_voltage_kv"]))
    if row.get("transformer_temp_c") is not None:
        values.append(("thermal.transformer_temp", row["transformer_temp_c"]))
    if row.get("fuel_level_l") is not None:
        fuel_level_l = row["fuel_level_l"]
        values.append(("fuel.level_l", fuel_level_l))
        values.append(("fuel.level", max(0.0, min(100.0, fuel_level_l / TE33A_TANK_CAPACITY_L * 100.0))))
    if row.get("fuel_rate_lph") is not None:
        values.append(("fuel.consumption_rate", row["fuel_rate_lph"]))
    if row.get("oil_pressure_bar") is not None:
        values.append(("pressure.oil", row["oil_pressure_bar"]))
    if row.get("coolant_temp_c") is not None:
        values.append(("thermal.coolant_temp", row["coolant_temp_c"]))
    return values


def metric_quality(metric_id: str, value: float, fault_code: str | None) -> str:
    if fault_code:
        return "suspect"
    metric = METRIC_BY_ID.get(metric_id)
    if metric is None:
        return "good"
    critical_low = metric.get("criticalLow")
    critical_high = metric.get("criticalHigh")
    warning_low = metric.get("warningLow")
    warning_high = metric.get("warningHigh")
    if (critical_low is not None and value <= critical_low) or (
        critical_high is not None and value >= critical_high
    ):
        return "bad"
    if (warning_low is not None and value <= warning_low) or (
        warning_high is not None and value >= warning_high
    ):
        return "suspect"
    return "good"


def frontend_frame(row: dict[str, Any], frame_id: str) -> TelemetryFrame:
    timestamp = row["timestamp_ms"]
    readings: list[MetricReading] = []
    for metric_id, value in frontend_metric_values(row):
        metric = METRIC_BY_ID[metric_id]
        readings.append(
            MetricReading(
                metric_id=metric_id,
                value=round(value, metric["precision"]),
                unit=metric["unit"],
                timestamp=timestamp,
                quality=metric_quality(metric_id, value, row.get("fault_code")),
            )
        )

    return TelemetryFrame(
        locomotive_id=row["locomotive_id"],
        frame_id=frame_id,
        timestamp=timestamp,
        readings=readings,
    )
