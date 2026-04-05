from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any

THRESHOLDS_FILE = os.getenv("THRESHOLDS_FILE", "")
THRESHOLD_KEYS = ("warningLow", "warningHigh", "criticalLow", "criticalHigh")

STATIC_METRICS: dict[str, dict[str, float | None]] = {
    "motion.speed": {"min": 0.0, "max": 200.0, "warningHigh": 140.0, "criticalHigh": 160.0},
    "motion.acceleration": {"min": -5.0, "max": 5.0},
    "motion.distance": {"min": 0.0, "max": 999999.0},
    "fuel.level": {"min": 0.0, "max": 100.0, "warningLow": 20.0, "criticalLow": 10.0},
    "fuel.consumption_rate": {"min": 0.0, "max": 500.0, "warningHigh": 400.0},
    "thermal.coolant_temp": {"min": 0.0, "max": 150.0, "warningLow": 10.0, "warningHigh": 95.0, "criticalHigh": 105.0},
    "thermal.oil_temp": {"min": 0.0, "max": 160.0, "warningHigh": 110.0, "criticalHigh": 130.0},
    "thermal.exhaust_temp": {"min": 0.0, "max": 700.0, "warningHigh": 550.0, "criticalHigh": 650.0},
    "pressure.brake_main": {"min": 0.0, "max": 10.0, "warningLow": 7.0, "criticalLow": 5.0},
    "pressure.brake_pipe": {"min": 0.0, "max": 6.0, "warningLow": 4.5, "criticalLow": 4.0},
    "pressure.oil": {"min": 0.0, "max": 8.0, "warningLow": 3.0, "criticalLow": 2.0},
    "electrical.traction_voltage": {
        "min": 0.0,
        "max": 3000.0,
        "warningLow": 2600.0,
        "criticalLow": 2400.0,
        "warningHigh": 2900.0,
        "criticalHigh": 3000.0,
    },
    "electrical.traction_current": {"min": 0.0, "max": 2000.0, "warningHigh": 1600.0, "criticalHigh": 1800.0},
    "electrical.battery_voltage": {"min": 0.0, "max": 120.0, "warningLow": 100.0, "criticalLow": 90.0},
}

DEFAULT_THRESHOLD_CONFIG = {
    "metrics": {
        metric_id: {
            key: value
            for key, value in metric.items()
            if key in THRESHOLD_KEYS
        }
        for metric_id, metric in STATIC_METRICS.items()
        if any(key in metric for key in THRESHOLD_KEYS)
    },
    "penalties": {"warning": 5.0, "critical": 15.0},
    "healthStatus": {"normal": 80.0, "degraded": 60.0, "warning": 40.0},
}


class ThresholdValidationError(ValueError):
    pass


def _coerce_number(value: Any, *, allow_none: bool = False) -> float | None:
    if value is None and allow_none:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raise ThresholdValidationError("Пороговые значения должны быть числовыми.")


def _merge_threshold_config(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)

    metrics_patch = patch.get("metrics")
    if metrics_patch is not None:
        if not isinstance(metrics_patch, dict):
            raise ThresholdValidationError("'metrics' должен быть объектом.")
        for metric_id, raw_thresholds in metrics_patch.items():
            if metric_id not in STATIC_METRICS:
                raise ThresholdValidationError(f"Неизвестный metricId '{metric_id}'.")
            if not isinstance(raw_thresholds, dict):
                raise ThresholdValidationError(f"Патч порогов для '{metric_id}' должен быть объектом.")
            target = dict(merged["metrics"].get(metric_id, {}))
            for key, value in raw_thresholds.items():
                if key not in THRESHOLD_KEYS:
                    raise ThresholdValidationError(f"Неподдерживаемый ключ порога '{key}' для '{metric_id}'.")
                target[key] = _coerce_number(value, allow_none=True)
            merged["metrics"][metric_id] = target

    for root_key, allowed_keys in (("penalties", ("warning", "critical")), ("healthStatus", ("normal", "degraded", "warning"))):
        root_patch = patch.get(root_key)
        if root_patch is None:
            continue
        if not isinstance(root_patch, dict):
            raise ThresholdValidationError(f"'{root_key}' должен быть объектом.")
        for key, value in root_patch.items():
            if key not in allowed_keys:
                raise ThresholdValidationError(f"Неподдерживаемый ключ '{key}' в '{root_key}'.")
            merged[root_key][key] = _coerce_number(value)

    return merged


def _validate_config(config: dict[str, Any]) -> dict[str, Any]:
    metrics = config.get("metrics")
    penalties = config.get("penalties")
    health_status = config.get("healthStatus")

    if not isinstance(metrics, dict) or not isinstance(penalties, dict) or not isinstance(health_status, dict):
        raise ThresholdValidationError("Конфигурация порогов должна содержать объекты metrics, penalties и healthStatus.")

    normalized_metrics: dict[str, dict[str, float | None]] = {}
    for metric_id, raw_thresholds in metrics.items():
        if metric_id not in STATIC_METRICS:
            raise ThresholdValidationError(f"Неизвестный metricId '{metric_id}'.")
        if not isinstance(raw_thresholds, dict):
            raise ThresholdValidationError(f"Описание порогов для '{metric_id}' должно быть объектом.")

        normalized = {
            key: _coerce_number(value, allow_none=True)
            for key, value in raw_thresholds.items()
        }
        metric = STATIC_METRICS[metric_id]
        metric_min = float(metric["min"] or 0.0)
        metric_max = float(metric["max"] or 0.0)
        for key, value in normalized.items():
            if key not in THRESHOLD_KEYS:
                raise ThresholdValidationError(f"Неподдерживаемый ключ порога '{key}' для '{metric_id}'.")
            if value is not None and (value < metric_min or value > metric_max):
                raise ThresholdValidationError(
                    f"{metric_id}.{key} должен быть в диапазоне от {metric_min:g} до {metric_max:g}."
                )
        if normalized.get("criticalLow") is not None and normalized.get("warningLow") is not None and normalized["criticalLow"] >= normalized["warningLow"]:
            raise ThresholdValidationError(f"{metric_id}: criticalLow должен быть меньше warningLow.")
        if normalized.get("warningHigh") is not None and normalized.get("criticalHigh") is not None and normalized["warningHigh"] >= normalized["criticalHigh"]:
            raise ThresholdValidationError(f"{metric_id}: warningHigh должен быть меньше criticalHigh.")
        if normalized.get("warningLow") is not None and normalized.get("warningHigh") is not None and normalized["warningLow"] >= normalized["warningHigh"]:
            raise ThresholdValidationError(f"{metric_id}: warningLow должен быть меньше warningHigh.")
        normalized_metrics[metric_id] = normalized

    warning_penalty = _coerce_number(penalties.get("warning"))
    critical_penalty = _coerce_number(penalties.get("critical"))
    if warning_penalty is None or critical_penalty is None:
        raise ThresholdValidationError("Требуются оба штрафа: warning и critical.")
    if warning_penalty < 0 or critical_penalty < 0 or critical_penalty < warning_penalty:
        raise ThresholdValidationError("Значения штрафов не могут быть отрицательными, а critical должен быть не меньше warning.")

    normal_cutoff = _coerce_number(health_status.get("normal"))
    degraded_cutoff = _coerce_number(health_status.get("degraded"))
    warning_cutoff = _coerce_number(health_status.get("warning"))
    if normal_cutoff is None or degraded_cutoff is None or warning_cutoff is None:
        raise ThresholdValidationError("Требуются пороги состояния.")
    if not (0 <= warning_cutoff < degraded_cutoff < normal_cutoff <= 100):
        raise ThresholdValidationError("Пороги состояния должны удовлетворять условию 0 <= warning < degraded < normal <= 100.")

    return {
        "metrics": normalized_metrics,
        "penalties": {"warning": warning_penalty, "critical": critical_penalty},
        "healthStatus": {
            "normal": normal_cutoff,
            "degraded": degraded_cutoff,
            "warning": warning_cutoff,
        },
    }


class ThresholdConfigStore:
    def __init__(self, path: str | None) -> None:
        self._path = Path(path).expanduser() if path else None
        self._lock = RLock()
        self._mtime_ns: int | None = None
        self._config = _validate_config(deepcopy(DEFAULT_THRESHOLD_CONFIG))
        self._reload(force=True)

    def _reload(self, *, force: bool = False) -> None:
        with self._lock:
            if self._path is None or not self._path.exists():
                self._config = _validate_config(deepcopy(DEFAULT_THRESHOLD_CONFIG))
                self._mtime_ns = None
                return

            stat = self._path.stat()
            if not force and self._mtime_ns == stat.st_mtime_ns:
                return

            raw = json.loads(self._path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ThresholdValidationError("Файл порогов должен содержать JSON-объект.")
            merged = _merge_threshold_config(DEFAULT_THRESHOLD_CONFIG, raw)
            self._config = _validate_config(merged)
            self._mtime_ns = stat.st_mtime_ns

    def get_config(self) -> dict[str, Any]:
        self._reload()
        return deepcopy(self._config)


threshold_store = ThresholdConfigStore(THRESHOLDS_FILE)


def get_metric_threshold(metric_id: str, key: str, fallback: float | None = None) -> float | None:
    config = threshold_store.get_config()
    metric_thresholds = config["metrics"].get(metric_id)
    if metric_thresholds is None or key not in metric_thresholds:
        return fallback
    value = metric_thresholds[key]
    return fallback if value is None else float(value)


def get_penalty_points() -> dict[str, float]:
    config = threshold_store.get_config()
    return {
        "warning": float(config["penalties"]["warning"]),
        "critical": float(config["penalties"]["critical"]),
    }


def get_health_status_thresholds() -> dict[str, float]:
    config = threshold_store.get_config()
    return {
        "normal": float(config["healthStatus"]["normal"]),
        "degraded": float(config["healthStatus"]["degraded"]),
        "warning": float(config["healthStatus"]["warning"]),
    }
