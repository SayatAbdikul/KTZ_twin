from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


TE33A_TANK_CAPACITY_L = 6000.0


def _parse_timestamp_ms(value: str) -> int:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def normalize_raw_telemetry(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    timestamp_ms = normalized.get("timestamp_ms")
    if timestamp_ms is None and normalized.get("timestamp"):
        timestamp_ms = _parse_timestamp_ms(str(normalized["timestamp"]))
    normalized["timestamp_ms"] = int(timestamp_ms)
    return normalized


def _metric(metric_id: str, value: float, unit: str, timestamp: int) -> dict[str, Any]:
    return {
        "metric_id": metric_id,
        "value": value,
        "unit": unit,
        "timestamp": timestamp,
        "quality": "suspect" if metric_id == "fault.code" else "good",
    }


def frontend_frame_from_raw(row: dict[str, Any], frame_id: str) -> dict[str, Any]:
    timestamp = int(row["timestamp_ms"])
    readings: list[dict[str, Any]] = [
        _metric("motion.speed", float(row.get("speed_kmh") or 0.0), "km/h", timestamp),
        _metric("electrical.traction_current", float(row.get("traction_current_a") or 0.0), "A", timestamp),
        _metric("pressure.brake_pipe", float(row.get("brake_pipe_pressure_bar") or 0.0), "bar", timestamp),
        _metric("thermal.traction_motor_temp", float(row.get("traction_motor_temp_c") or 0.0), "°C", timestamp),
        _metric("thermal.bearing_temp", float(row.get("bearing_temp_c") or 0.0), "°C", timestamp),
    ]

    if row.get("fuel_level_l") is not None:
        fuel_level_l = float(row["fuel_level_l"])
        readings.append(_metric("fuel.level", max(0.0, min(100.0, fuel_level_l / TE33A_TANK_CAPACITY_L * 100.0)), "%", timestamp))
        readings.append(_metric("fuel.level_l", fuel_level_l, "L", timestamp))
    if row.get("fuel_rate_lph") is not None:
        readings.append(_metric("fuel.consumption_rate", float(row["fuel_rate_lph"]), "L/h", timestamp))
    if row.get("coolant_temp_c") is not None:
        readings.append(_metric("thermal.coolant_temp", float(row["coolant_temp_c"]), "°C", timestamp))
    if row.get("adhesion_coeff") is not None:
        readings.append(_metric("motion.adhesion", float(row["adhesion_coeff"]), "", timestamp))
    if row.get("catenary_voltage_kv") is not None:
        readings.append(_metric("electrical.catenary_voltage", float(row["catenary_voltage_kv"]), "kV", timestamp))
    if row.get("brake_cylinder_pressure_bar") is not None:
        readings.append(_metric("pressure.brake_cylinder", float(row["brake_cylinder_pressure_bar"]), "bar", timestamp))
    if row.get("oil_pressure_bar") is not None:
        readings.append(_metric("pressure.oil", float(row["oil_pressure_bar"]), "bar", timestamp))
    if row.get("transformer_temp_c") is not None:
        readings.append(_metric("thermal.transformer_temp", float(row["transformer_temp_c"]), "°C", timestamp))

    return {
        "locomotive_id": str(row.get("locomotive_id", "unknown")),
        "frame_id": frame_id,
        "timestamp": timestamp,
        "readings": readings,
    }
