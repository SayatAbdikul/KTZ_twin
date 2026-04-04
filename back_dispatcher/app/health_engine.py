from __future__ import annotations

from collections import deque
from typing import Any

from app.thresholds import get_health_status_thresholds, get_metric_threshold

WINDOW_1S_MS = 1_000
WINDOW_5S_MS = 5_000
WINDOW_30S_MS = 30_000
WINDOW_10M_MS = 600_000
MAX_DURATION_SAMPLE_GAP_MS = 2_000

SEVERITY_ORDER = {"critical": 3, "warning": 2, "info": 1}
SUBSYSTEM_LABELS = {
    "engine": "Engine",
    "brakes": "Brakes",
    "electrical": "Electrical",
    "fuel": "Fuel System",
    "cooling": "Cooling",
    "pneumatic": "Pneumatics",
}


def _metric_map(frame: dict[str, Any]) -> dict[str, float]:
    values: dict[str, float] = {}
    for reading in frame.get("readings", []):
        metric_id = str(reading.get("metric_id") or reading.get("metricId") or "")
        if not metric_id:
            continue
        try:
            values[metric_id] = float(reading.get("value", 0.0))
        except (TypeError, ValueError):
            continue
    return values


def _sample_from_frame(frame: dict[str, Any]) -> dict[str, float]:
    metrics = _metric_map(frame)
    timestamp = int(frame.get("timestamp", 0))
    speed = metrics.get("motion.speed", 0.0)
    accel = metrics.get("motion.acceleration")
    return {
        "timestamp": float(timestamp),
        "speed_kmh": speed,
        "accel_mps2": accel if accel is not None else 0.0,
        "traction_current_a": metrics.get("electrical.traction_current", 0.0),
        "traction_voltage_v": metrics.get("electrical.traction_voltage", 0.0),
        "brake_pipe_bar": metrics.get("pressure.brake_pipe", 0.0),
        "brake_main_bar": metrics.get("pressure.brake_main", 0.0),
        "oil_pressure_bar": metrics.get("pressure.oil", 0.0),
        "coolant_temp_c": metrics.get("thermal.coolant_temp", 0.0),
        "oil_temp_c": metrics.get("thermal.oil_temp", 0.0),
        "exhaust_temp_c": metrics.get("thermal.exhaust_temp", 0.0),
        "fuel_level_pct": metrics.get("fuel.level", 0.0),
        "fuel_rate_lph": metrics.get("fuel.consumption_rate", 0.0),
    }


def _window_samples(history: deque[dict[str, float]], now_ms: int, window_ms: int) -> list[dict[str, float]]:
    threshold = now_ms - window_ms
    result: list[dict[str, float]] = []
    for sample in reversed(history):
        if int(sample["timestamp"]) < threshold:
            break
        result.append(sample)
    result.reverse()
    return result


def _avg(samples: list[dict[str, float]], key: str, fallback: float = 0.0) -> float:
    if not samples:
        return fallback
    return sum(sample[key] for sample in samples) / len(samples)


def _duration_ms(samples: list[dict[str, float]], predicate) -> int:
    if not samples or not predicate(samples[-1]):
        return 0

    duration = min(WINDOW_1S_MS, MAX_DURATION_SAMPLE_GAP_MS)
    for index in range(len(samples) - 1, 0, -1):
        current = samples[index]
        previous = samples[index - 1]
        if not predicate(previous):
            break
        gap_ms = max(0, int(current["timestamp"] - previous["timestamp"]))
        duration += min(gap_ms, MAX_DURATION_SAMPLE_GAP_MS)
    return duration


def _speed_drop(history: deque[dict[str, float]], now_ms: int, window_ms: int) -> float:
    current = history[-1]["speed_kmh"]
    threshold = now_ms - window_ms
    past = history[0]["speed_kmh"]
    for sample in history:
        if int(sample["timestamp"]) >= threshold:
            past = sample["speed_kmh"]
            break
    return max(0.0, past - current)


def _value_at_or_before(history: deque[dict[str, float]], now_ms: int, window_ms: int, key: str, fallback: float) -> float:
    threshold = now_ms - window_ms
    candidate = fallback
    for sample in history:
        candidate = sample[key]
        if int(sample["timestamp"]) >= threshold:
            break
    return candidate


def _clamp(score: float) -> float:
    return max(0.0, min(100.0, score))


def _status_from_score(score: float) -> str:
    thresholds = get_health_status_thresholds()
    if score >= thresholds["normal"]:
        return "normal"
    if score >= thresholds["degraded"]:
        return "degraded"
    if score >= thresholds["warning"]:
        return "warning"
    return "critical"


def _make_alert(
    locomotive_id: str,
    key: str,
    severity: str,
    source: str,
    title: str,
    description: str,
    recommended_action: str,
    related_metric_ids: list[str],
    triggered_at: int,
) -> dict[str, Any]:
    return {
        "alert_id": f"{locomotive_id}:{key}",
        "locomotive_id": locomotive_id,
        "severity": severity,
        "status": "active",
        "source": source,
        "title": title,
        "description": description,
        "recommended_action": recommended_action,
        "triggered_at": triggered_at,
        "related_metric_ids": related_metric_ids,
    }


def evaluate_runtime(locomotive_id: str, frame: dict[str, Any], history: deque[dict[str, float]], active_alerts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    sample = _sample_from_frame(frame)
    history.append(sample)

    now_ms = int(sample["timestamp"])
    w1 = _window_samples(history, now_ms, WINDOW_1S_MS)
    w5 = _window_samples(history, now_ms, WINDOW_5S_MS)
    w30 = _window_samples(history, now_ms, WINDOW_30S_MS)
    w10m = _window_samples(history, now_ms, WINDOW_10M_MS)

    speed_1s = _avg(w1, "speed_kmh", sample["speed_kmh"])
    speed_5s = _avg(w5, "speed_kmh", sample["speed_kmh"])
    speed_30s = _avg(w30, "speed_kmh", sample["speed_kmh"])
    current_5s = _avg(w5, "traction_current_a", sample["traction_current_a"])
    brake_pipe_1s = _avg(w1, "brake_pipe_bar", sample["brake_pipe_bar"])
    brake_main_1s = _avg(w1, "brake_main_bar", sample["brake_main_bar"])
    coolant_30s = _avg(w30, "coolant_temp_c", sample["coolant_temp_c"])
    oil_temp_30s = _avg(w30, "oil_temp_c", sample["oil_temp_c"])
    exhaust_30s = _avg(w30, "exhaust_temp_c", sample["exhaust_temp_c"])
    oil_pressure_5s = _avg(w5, "oil_pressure_bar", sample["oil_pressure_bar"])
    fuel_rate_30s = _avg(w30, "fuel_rate_lph", sample["fuel_rate_lph"])
    fuel_level_30s = _avg(w30, "fuel_level_pct", sample["fuel_level_pct"])
    voltage_5s = _avg(w5, "traction_voltage_v", sample["traction_voltage_v"])

    speed_warning_high = get_metric_threshold("motion.speed", "warningHigh", 140.0) or 140.0
    fuel_warning_low = get_metric_threshold("fuel.level", "warningLow", 20.0) or 20.0
    fuel_critical_low = get_metric_threshold("fuel.level", "criticalLow", 10.0) or 10.0
    coolant_warning_high = get_metric_threshold("thermal.coolant_temp", "warningHigh", 95.0) or 95.0
    coolant_critical_high = get_metric_threshold("thermal.coolant_temp", "criticalHigh", 105.0) or 105.0
    oil_temp_warning_high = get_metric_threshold("thermal.oil_temp", "warningHigh", 110.0) or 110.0
    oil_temp_critical_high = get_metric_threshold("thermal.oil_temp", "criticalHigh", 130.0) or 130.0
    exhaust_warning_high = get_metric_threshold("thermal.exhaust_temp", "warningHigh", 550.0) or 550.0
    exhaust_critical_high = get_metric_threshold("thermal.exhaust_temp", "criticalHigh", 650.0) or 650.0
    oil_warning_low = get_metric_threshold("pressure.oil", "warningLow", 3.0) or 3.0
    oil_critical_low = get_metric_threshold("pressure.oil", "criticalLow", 2.0) or 2.0
    voltage_warning_low = get_metric_threshold("electrical.traction_voltage", "warningLow", 2600.0) or 2600.0
    voltage_critical_low = get_metric_threshold("electrical.traction_voltage", "criticalLow", 2400.0) or 2400.0
    current_warning_high = get_metric_threshold("electrical.traction_current", "warningHigh", 1600.0) or 1600.0
    current_critical_high = get_metric_threshold("electrical.traction_current", "criticalHigh", 1800.0) or 1800.0

    speed_drop_3s = _speed_drop(history, now_ms, 3_000)
    speed_3s_ago = _value_at_or_before(history, now_ms, 3_000, "speed_kmh", sample["speed_kmh"])
    brake_pipe_3s_ago = _value_at_or_before(history, now_ms, 3_000, "brake_pipe_bar", sample["brake_pipe_bar"])
    brake_main_3s_ago = _value_at_or_before(history, now_ms, 3_000, "brake_main_bar", sample["brake_main_bar"])

    accel_3s_est = (sample["speed_kmh"] - speed_3s_ago) / 3.0 / 3.6
    high_speed = speed_1s >= 60.0
    brake_command = brake_pipe_1s < 4.6 or brake_main_1s < 7.4
    hard_brake_command = brake_pipe_1s < 4.3 or brake_main_1s < 6.8
    not_braking = brake_pipe_1s > 4.8 and brake_main_1s > 7.8

    high_current_low_accel = current_5s > 650.0 and accel_3s_est < 0.05 and not_braking and speed_1s < 70.0
    weak_brake_response = hard_brake_command and speed_1s > 40.0 and speed_drop_3s < 5.0
    pneumatic_response_gap = (
        brake_pipe_3s_ago - brake_pipe_1s > 0.25
        and brake_main_3s_ago - brake_main_1s < 0.2
        and speed_1s > 40.0
    )
    high_current_duration_ms = _duration_ms(w30, lambda s: s["traction_current_a"] > 700.0)
    very_high_current_duration_ms = _duration_ms(w30, lambda s: s["traction_current_a"] > 900.0)
    high_current_low_accel_duration_ms = _duration_ms(
        w30,
        lambda s: (
            s["traction_current_a"] > 650.0
            and s["accel_mps2"] < 0.05
            and s["brake_pipe_bar"] > 4.8
            and s["brake_main_bar"] > 7.8
            and s["speed_kmh"] < 70.0
        ),
    )
    fuel_efficiency_penalty = 0.0
    if speed_30s < 20.0 and fuel_rate_30s > 80.0:
        fuel_efficiency_penalty = 10.0
    elif 20.0 <= speed_30s < 50.0 and fuel_rate_30s > 140.0:
        fuel_efficiency_penalty = 10.0
    elif speed_30s >= 50.0 and fuel_rate_30s > 220.0:
        fuel_efficiency_penalty = 10.0

    speed_factor = 0.5 if speed_1s < 10.0 else 1.0 if speed_1s <= 40.0 else 1.5

    braking_score = 100.0
    if brake_pipe_1s < 4.8 and speed_1s > 40.0:
        braking_score -= 10.0 * speed_factor
    if brake_pipe_1s < 4.5 and speed_1s > 40.0:
        braking_score -= 20.0 * speed_factor
    if hard_brake_command and speed_drop_3s < 5.0:
        braking_score -= 25.0 * speed_factor
    if weak_brake_response:
        braking_score -= 20.0 * speed_factor
    if brake_pipe_1s < 3.8:
        braking_score -= 20.0 * speed_factor
    if pneumatic_response_gap:
        braking_score -= 20.0 * speed_factor
    braking_score = _clamp(braking_score)

    thermal_score = 100.0
    if coolant_30s > coolant_warning_high:
        thermal_score -= 15.0
    if coolant_30s > coolant_critical_high:
        thermal_score -= 30.0
    if oil_temp_30s > oil_temp_warning_high:
        thermal_score -= 10.0
    if oil_temp_30s > oil_temp_critical_high:
        thermal_score -= 20.0
    if high_current_duration_ms >= 10_000 and oil_temp_30s > oil_temp_warning_high:
        thermal_score -= 20.0
    if very_high_current_duration_ms >= 10_000 and oil_temp_30s > max(oil_temp_warning_high, oil_temp_critical_high - 10.0):
        thermal_score -= 30.0
    if exhaust_30s > exhaust_warning_high:
        thermal_score -= 15.0
    thermal_score = _clamp(thermal_score)

    powertrain_score = 100.0
    if high_current_duration_ms >= 5_000:
        powertrain_score -= 10.0
    if very_high_current_duration_ms >= 5_000:
        powertrain_score -= 20.0
    if high_current_low_accel and high_current_low_accel_duration_ms >= 5_000:
        powertrain_score -= 20.0
    if high_current_low_accel and high_current_low_accel_duration_ms >= 10_000:
        powertrain_score -= 30.0
    if voltage_5s < voltage_warning_low:
        powertrain_score -= 15.0
    if voltage_5s < voltage_critical_low:
        powertrain_score -= 30.0
    if voltage_5s < voltage_warning_low and current_5s > 500.0:
        powertrain_score -= 10.0
    if oil_pressure_5s < oil_warning_low:
        powertrain_score -= 15.0 * speed_factor
    if oil_pressure_5s < oil_critical_low:
        powertrain_score -= 30.0 * speed_factor
    powertrain_score -= fuel_efficiency_penalty
    powertrain_score = _clamp(powertrain_score)

    fault_score = 100.0

    overall = round(
        _clamp(
            0.40 * braking_score
            + 0.25 * thermal_score
            + 0.20 * powertrain_score
            + 0.15 * fault_score
        )
    )

    active_candidates: dict[str, dict[str, Any]] = {}

    def add_alert(alert: dict[str, Any]) -> None:
        current = active_candidates.get(alert["alert_id"])
        if current is None or SEVERITY_ORDER[alert["severity"]] > SEVERITY_ORDER[current["severity"]]:
            active_candidates[alert["alert_id"]] = alert

    if speed_1s > 50.0 and hard_brake_command and brake_main_1s < 7.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "brake_response_weak",
                "critical",
                "brakes",
                "Brake response weak at speed",
                "Brake demand is high but braking pressure response and deceleration remain weak.",
                "Reduce speed immediately and inspect brake valves, cylinders, and pneumatic lines.",
                ["pressure.brake_pipe", "pressure.brake_main", "motion.speed"],
                now_ms,
            )
        )

    if speed_1s > 60.0 and hard_brake_command and speed_drop_3s < 5.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "no_decel_under_braking",
                "critical",
                "brakes",
                "No deceleration under hard braking",
                "Speed remains high despite sustained hard brake demand.",
                "Escalate to emergency braking procedure and inspect the brake system before continuing.",
                ["motion.speed", "pressure.brake_pipe", "pressure.brake_main"],
                now_ms,
            )
        )

    if speed_1s > 50.0 and brake_pipe_1s < 4.3 and brake_main_1s < 7.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "pneumatic_pressure_loss",
                "critical",
                "pneumatic",
                "Pneumatic pressure loss under braking",
                "Brake pipe pressure is low and the pneumatic reserve is not supporting the commanded stop.",
                "Check compressor output, leaks, and brake control valves immediately.",
                ["pressure.brake_pipe", "pressure.brake_main"],
                now_ms,
            )
        )

    if oil_pressure_5s < oil_critical_low and speed_1s > 20.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "oil_pressure_critical",
                "critical",
                "engine",
                "Oil pressure critically low",
                "Lubrication pressure is below the safe operating band while the locomotive is moving.",
                "Unload the engine and inspect lubrication pressure before continued operation.",
                ["pressure.oil", "motion.speed"],
                now_ms,
            )
        )

    if coolant_30s > coolant_critical_high or oil_temp_30s > oil_temp_critical_high or exhaust_30s > exhaust_critical_high:
        add_alert(
            _make_alert(
                locomotive_id,
                "thermal_overload_critical",
                "critical",
                "cooling",
                "Severe thermal overload",
                "Sustained operating temperatures are above the critical band.",
                "Reduce traction load and inspect the cooling circuit before resuming full power.",
                ["thermal.coolant_temp", "thermal.oil_temp", "thermal.exhaust_temp"],
                now_ms,
            )
        )

    if speed_1s > 40.0 and brake_command and brake_main_1s < 7.2:
        add_alert(
            _make_alert(
                locomotive_id,
                "brake_degradation",
                "warning",
                "brakes",
                "Brake degradation detected",
                "Brake demand is present but the pneumatic response is below the expected range.",
                "Inspect brake pressure response and prepare for a controlled speed reduction.",
                ["pressure.brake_pipe", "pressure.brake_main"],
                now_ms,
            )
        )

    if high_current_low_accel:
        add_alert(
            _make_alert(
                locomotive_id,
                "current_accel_mismatch",
                "warning",
                "electrical",
                "High current with weak acceleration",
                "Traction current is elevated but speed response is weak, indicating excessive resistance or poor adhesion.",
                "Check traction effort, wheel-rail conditions, and drivetrain resistance.",
                ["electrical.traction_current", "motion.speed", "motion.acceleration"],
                now_ms,
            )
        )

    if coolant_30s > coolant_warning_high:
        add_alert(
            _make_alert(
                locomotive_id,
                "coolant_hot",
                "warning",
                "cooling",
                "Coolant temperature rising",
                "Cooling temperature has crossed the warning threshold under sustained load.",
                "Reduce load and inspect cooling airflow and coolant circulation.",
                ["thermal.coolant_temp"],
                now_ms,
            )
        )

    if oil_pressure_5s < oil_warning_low:
        add_alert(
            _make_alert(
                locomotive_id,
                "oil_pressure_low",
                "warning",
                "engine",
                "Oil pressure low",
                "Oil pressure is below the expected operating band.",
                "Inspect lubrication pressure and avoid sustained high-load operation.",
                ["pressure.oil"],
                now_ms,
            )
        )

    if voltage_5s < voltage_warning_low and current_5s > 400.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "voltage_dip_under_load",
                "warning",
                "electrical",
                "Voltage dip under load",
                "Traction voltage is sagging while current remains elevated.",
                "Reduce traction demand and inspect the electrical supply path.",
                ["electrical.traction_voltage", "electrical.traction_current"],
                now_ms,
            )
        )

    if brake_pipe_1s < 4.8 and speed_1s > 20.0:
        add_alert(
            _make_alert(
                locomotive_id,
                "pneumatic_watch",
                "info",
                "pneumatic",
                "Pneumatic pressure trending low",
                "Brake pipe pressure is below nominal and should be watched.",
                "Monitor pneumatic pressure stability and prepare maintenance inspection if the trend continues.",
                ["pressure.brake_pipe"],
                now_ms,
            )
        )

    if current_5s > current_warning_high:
        add_alert(
            _make_alert(
                locomotive_id,
                "traction_current_watch",
                "info",
                "electrical",
                "Traction current elevated",
                "Traction current has remained above the watch threshold.",
                "Watch for additional load, adhesion, or voltage anomalies.",
                ["electrical.traction_current"],
                now_ms,
            )
        )

    if fuel_level_30s < fuel_warning_low:
        add_alert(
            _make_alert(
                locomotive_id,
                "fuel_low_watch",
                "info",
                "fuel",
                "Fuel reserve low",
                "Fuel reserve has fallen below the watch threshold.",
                "Plan a refueling stop and avoid unnecessary high-load operation.",
                ["fuel.level"],
                now_ms,
            )
        )

    next_alerts = active_candidates
    alert_events: list[dict[str, Any]] = []

    for alert_id, alert in next_alerts.items():
        previous = active_alerts.get(alert_id)
        if previous is None:
            alert_events.append({"type": "alert.new", "payload": alert})
        elif any(previous.get(key) != alert.get(key) for key in ("severity", "title", "description", "recommended_action", "source")):
            updated = {**previous, **alert}
            alert_events.append({"type": "alert.update", "payload": updated})

    for alert_id, previous in active_alerts.items():
        if alert_id not in next_alerts:
            alert_events.append(
                {
                    "type": "alert.resolved",
                    "payload": {
                        "alert_id": previous["alert_id"],
                        "locomotive_id": locomotive_id,
                        "resolved_at": now_ms,
                    },
                }
            )

    subsystem_alert_counts = {key: 0 for key in SUBSYSTEM_LABELS}
    for alert in next_alerts.values():
        subsystem_alert_counts[str(alert["source"])] = subsystem_alert_counts.get(str(alert["source"]), 0) + 1

    fuel_score = 100.0
    if fuel_level_30s < fuel_warning_low:
        fuel_score -= 15.0
    if fuel_level_30s < fuel_critical_low:
        fuel_score -= 25.0
    fuel_score -= fuel_efficiency_penalty
    fuel_score = _clamp(fuel_score)

    engine_score = _clamp(0.55 * powertrain_score + 0.45 * thermal_score)
    cooling_score = _clamp(0.80 * thermal_score + 0.20 * powertrain_score)
    electrical_score = _clamp(0.70 * powertrain_score + 0.30 * thermal_score)
    pneumatic_score = _clamp(0.80 * braking_score + 0.20 * (100.0 if brake_main_1s >= 7.0 else 70.0))

    health_index = {
        "locomotive_id": locomotive_id,
        "overall": overall,
        "status": _status_from_score(overall),
        "timestamp": now_ms,
        "subsystems": [
            {
                "subsystem_id": "engine",
                "label": SUBSYSTEM_LABELS["engine"],
                "health_score": round(engine_score, 1),
                "status": _status_from_score(engine_score),
                "active_alert_count": subsystem_alert_counts["engine"],
                "last_updated": now_ms,
            },
            {
                "subsystem_id": "brakes",
                "label": SUBSYSTEM_LABELS["brakes"],
                "health_score": round(braking_score, 1),
                "status": _status_from_score(braking_score),
                "active_alert_count": subsystem_alert_counts["brakes"],
                "last_updated": now_ms,
            },
            {
                "subsystem_id": "electrical",
                "label": SUBSYSTEM_LABELS["electrical"],
                "health_score": round(electrical_score, 1),
                "status": _status_from_score(electrical_score),
                "active_alert_count": subsystem_alert_counts["electrical"],
                "last_updated": now_ms,
            },
            {
                "subsystem_id": "fuel",
                "label": SUBSYSTEM_LABELS["fuel"],
                "health_score": round(fuel_score, 1),
                "status": _status_from_score(fuel_score),
                "active_alert_count": subsystem_alert_counts["fuel"],
                "last_updated": now_ms,
            },
            {
                "subsystem_id": "cooling",
                "label": SUBSYSTEM_LABELS["cooling"],
                "health_score": round(cooling_score, 1),
                "status": _status_from_score(cooling_score),
                "active_alert_count": subsystem_alert_counts["cooling"],
                "last_updated": now_ms,
            },
            {
                "subsystem_id": "pneumatic",
                "label": SUBSYSTEM_LABELS["pneumatic"],
                "health_score": round(pneumatic_score, 1),
                "status": _status_from_score(pneumatic_score),
                "active_alert_count": subsystem_alert_counts["pneumatic"],
                "last_updated": now_ms,
            },
        ],
    }

    return {
        "metrics": _metric_map(frame),
        "health_index": health_index,
        "alerts": next_alerts,
        "events": alert_events,
    }
