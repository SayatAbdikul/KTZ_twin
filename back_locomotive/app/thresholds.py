from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock
from typing import Any

from app.config import HEALTH_STATUS_THRESHOLDS, METRIC_DEFINITIONS, THRESHOLD_PENALTY

THRESHOLD_KEYS = ("warningLow", "warningHigh", "criticalLow", "criticalHigh")
THRESHOLDS_FILE = os.getenv("THRESHOLDS_FILE", "")


class ThresholdValidationError(ValueError):
    pass


def _build_default_threshold_config() -> dict[str, Any]:
    metrics: dict[str, dict[str, float | None]] = {}
    for definition in METRIC_DEFINITIONS:
        metric_thresholds = {
            key: definition[key]
            for key in THRESHOLD_KEYS
            if key in definition
        }
        if metric_thresholds:
            metrics[str(definition["metricId"])] = metric_thresholds

    return {
        "metrics": metrics,
        "penalties": {
            "warning": float(THRESHOLD_PENALTY["warning"]),
            "critical": float(THRESHOLD_PENALTY["critical"]),
        },
        "healthStatus": {
            "normal": float(HEALTH_STATUS_THRESHOLDS["normal"]),
            "degraded": float(HEALTH_STATUS_THRESHOLDS["degraded"]),
            "warning": float(HEALTH_STATUS_THRESHOLDS["warning"]),
        },
    }


DEFAULT_THRESHOLD_CONFIG = _build_default_threshold_config()
STATIC_METRIC_BY_ID = {str(metric["metricId"]): metric for metric in METRIC_DEFINITIONS}


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
            if metric_id not in STATIC_METRIC_BY_ID:
                raise ThresholdValidationError(f"Неизвестный metricId '{metric_id}'.")
            if not isinstance(raw_thresholds, dict):
                raise ThresholdValidationError(f"Патч порогов для '{metric_id}' должен быть объектом.")

            target = dict(merged["metrics"].get(metric_id, {}))
            for key, value in raw_thresholds.items():
                if key not in THRESHOLD_KEYS:
                    raise ThresholdValidationError(f"Неподдерживаемый ключ порога '{key}' для '{metric_id}'.")
                target[key] = _coerce_number(value, allow_none=True)
            merged["metrics"][metric_id] = target

    penalties_patch = patch.get("penalties")
    if penalties_patch is not None:
        if not isinstance(penalties_patch, dict):
            raise ThresholdValidationError("'penalties' должен быть объектом.")
        for key, value in penalties_patch.items():
            if key not in ("warning", "critical"):
                raise ThresholdValidationError(f"Неподдерживаемый ключ штрафа '{key}'.")
            merged["penalties"][key] = _coerce_number(value)

    status_patch = patch.get("healthStatus")
    if status_patch is not None:
        if not isinstance(status_patch, dict):
            raise ThresholdValidationError("'healthStatus' должен быть объектом.")
        for key, value in status_patch.items():
            if key not in ("normal", "degraded", "warning"):
                raise ThresholdValidationError(f"Неподдерживаемый ключ статуса состояния '{key}'.")
            merged["healthStatus"][key] = _coerce_number(value)

    return merged


def _validate_metric_thresholds(metric_id: str, thresholds: dict[str, float | None]) -> None:
    metric = STATIC_METRIC_BY_ID[metric_id]
    lower_bound = float(metric["min"])
    upper_bound = float(metric["max"])

    for key, value in thresholds.items():
        if key not in THRESHOLD_KEYS:
            raise ThresholdValidationError(f"Неподдерживаемый ключ порога '{key}' для '{metric_id}'.")
        if value is None:
            continue
        if value < lower_bound or value > upper_bound:
            raise ThresholdValidationError(
                f"{metric_id}.{key} должен быть в диапазоне от {lower_bound:g} до {upper_bound:g}."
            )

    warning_low = thresholds.get("warningLow")
    critical_low = thresholds.get("criticalLow")
    warning_high = thresholds.get("warningHigh")
    critical_high = thresholds.get("criticalHigh")

    if critical_low is not None and warning_low is not None and critical_low >= warning_low:
        raise ThresholdValidationError(f"{metric_id}: criticalLow должен быть меньше warningLow.")
    if warning_high is not None and critical_high is not None and warning_high >= critical_high:
        raise ThresholdValidationError(f"{metric_id}: warningHigh должен быть меньше criticalHigh.")
    if warning_low is not None and warning_high is not None and warning_low >= warning_high:
        raise ThresholdValidationError(f"{metric_id}: warningLow должен быть меньше warningHigh.")
    if critical_low is not None and critical_high is not None and critical_low >= critical_high:
        raise ThresholdValidationError(f"{metric_id}: criticalLow должен быть меньше criticalHigh.")


def _validate_threshold_config(config: dict[str, Any]) -> dict[str, Any]:
    metrics = config.get("metrics")
    penalties = config.get("penalties")
    health_status = config.get("healthStatus")

    if not isinstance(metrics, dict):
        raise ThresholdValidationError("'metrics' должен быть объектом.")
    if not isinstance(penalties, dict):
        raise ThresholdValidationError("'penalties' должен быть объектом.")
    if not isinstance(health_status, dict):
        raise ThresholdValidationError("'healthStatus' должен быть объектом.")

    normalized_metrics: dict[str, dict[str, float | None]] = {}
    for metric_id, metric_thresholds in metrics.items():
        if metric_id not in STATIC_METRIC_BY_ID:
            raise ThresholdValidationError(f"Неизвестный metricId '{metric_id}'.")
        if not isinstance(metric_thresholds, dict):
            raise ThresholdValidationError(f"Описание порогов для '{metric_id}' должно быть объектом.")

        normalized_metric_thresholds = {
            key: _coerce_number(metric_thresholds.get(key), allow_none=True)
            for key in metric_thresholds
        }
        _validate_metric_thresholds(metric_id, normalized_metric_thresholds)
        normalized_metrics[metric_id] = normalized_metric_thresholds

    warning_penalty = _coerce_number(penalties.get("warning"))
    critical_penalty = _coerce_number(penalties.get("critical"))
    if warning_penalty is None or critical_penalty is None:
        raise ThresholdValidationError("Требуются оба штрафа: warning и critical.")
    if warning_penalty < 0 or critical_penalty < 0:
        raise ThresholdValidationError("Значения штрафов не могут быть отрицательными.")
    if critical_penalty < warning_penalty:
        raise ThresholdValidationError("Штраф critical должен быть больше либо равен штрафу warning.")

    normal_cutoff = _coerce_number(health_status.get("normal"))
    degraded_cutoff = _coerce_number(health_status.get("degraded"))
    warning_cutoff = _coerce_number(health_status.get("warning"))
    if normal_cutoff is None or degraded_cutoff is None or warning_cutoff is None:
        raise ThresholdValidationError("Пороги состояния должны включать значения normal, degraded и warning.")
    if not (0 <= warning_cutoff < degraded_cutoff < normal_cutoff <= 100):
        raise ThresholdValidationError(
            "Пороги состояния должны удовлетворять условию 0 <= warning < degraded < normal <= 100."
        )

    return {
        "metrics": normalized_metrics,
        "penalties": {
            "warning": warning_penalty,
            "critical": critical_penalty,
        },
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
        self._config = _validate_threshold_config(deepcopy(DEFAULT_THRESHOLD_CONFIG))
        self._reload(force=True)

    def _reload(self, *, force: bool = False) -> None:
        with self._lock:
            if self._path is None or not self._path.exists():
                self._mtime_ns = None
                self._config = _validate_threshold_config(deepcopy(DEFAULT_THRESHOLD_CONFIG))
                return

            stat = self._path.stat()
            if not force and self._mtime_ns == stat.st_mtime_ns:
                return

            raw = json.loads(self._path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ThresholdValidationError("Файл порогов должен содержать JSON-объект.")
            merged = _merge_threshold_config(DEFAULT_THRESHOLD_CONFIG, raw)
            self._config = _validate_threshold_config(merged)
            self._mtime_ns = stat.st_mtime_ns

    def get_config(self) -> dict[str, Any]:
        self._reload()
        return deepcopy(self._config)

    def get_metric_definitions(self) -> list[dict[str, Any]]:
        config = self.get_config()
        definitions = deepcopy(METRIC_DEFINITIONS)
        for definition in definitions:
            overrides = config["metrics"].get(str(definition["metricId"]), {})
            for key in THRESHOLD_KEYS:
                if key in overrides:
                    definition[key] = overrides[key]
        return definitions

    def get_metric_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(definition["metricId"]): definition
            for definition in self.get_metric_definitions()
        }

    def get_penalties(self) -> dict[str, float]:
        config = self.get_config()
        return {
            "warning": float(config["penalties"]["warning"]),
            "critical": float(config["penalties"]["critical"]),
        }

    def get_health_status_thresholds(self) -> dict[str, float]:
        config = self.get_config()
        return {
            "normal": float(config["healthStatus"]["normal"]),
            "degraded": float(config["healthStatus"]["degraded"]),
            "warning": float(config["healthStatus"]["warning"]),
        }

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(patch, dict):
            raise ThresholdValidationError("Тело обновления порогов должно быть JSON-объектом.")

        with self._lock:
            merged = _merge_threshold_config(self.get_config(), patch)
            validated = _validate_threshold_config(merged)

            if self._path is not None:
                self._path.parent.mkdir(parents=True, exist_ok=True)
                with NamedTemporaryFile(
                    "w",
                    encoding="utf-8",
                    dir=self._path.parent,
                    delete=False,
                ) as handle:
                    json.dump(validated, handle, indent=2, sort_keys=True)
                    handle.write("\n")
                    temp_path = Path(handle.name)
                temp_path.replace(self._path)
                self._mtime_ns = self._path.stat().st_mtime_ns

            self._config = validated
            return deepcopy(validated)


threshold_store = ThresholdConfigStore(THRESHOLDS_FILE)


def get_threshold_config() -> dict[str, Any]:
    return threshold_store.get_config()


def update_threshold_config(patch: dict[str, Any]) -> dict[str, Any]:
    return threshold_store.update(patch)


def get_effective_metric_definitions() -> list[dict[str, Any]]:
    return threshold_store.get_metric_definitions()


def get_effective_metric_by_id() -> dict[str, dict[str, Any]]:
    return threshold_store.get_metric_by_id()


def get_threshold_penalties() -> dict[str, float]:
    return threshold_store.get_penalties()


def get_health_status_thresholds() -> dict[str, float]:
    return threshold_store.get_health_status_thresholds()
