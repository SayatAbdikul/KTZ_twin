"""
Health engine — derives subsystem scores from current telemetry values.

Algorithm:
1. Apply random drift (±0.5 per update, bias 0.48) to each score
2. Apply threshold penalties based on current metric values
   - warning range  → -5 penalty
   - critical range → -15 penalty
3. Clamp score to [0, 100]
4. Map score to status label
5. Count active (non-resolved) alerts per subsystem
6. Overall = average of all subsystem scores
"""

from __future__ import annotations

import random

from app.config import (
    SUBSYSTEMS,
    SUBSYSTEM_METRICS,
    METRIC_BY_ID,
    THRESHOLD_PENALTY,
)
from app.models import HealthIndex, SubsystemHealth, now_ms
from app.state import state


def _score_to_status(score: float) -> str:
    if score >= 80:
        return "normal"
    if score >= 60:
        return "degraded"
    if score >= 40:
        return "warning"
    return "critical"


def _threshold_penalty(metric_id: str, value: float) -> float:
    """Return penalty points for a metric value breaching a threshold."""
    metric = METRIC_BY_ID.get(metric_id)
    if not metric:
        return 0.0

    crit_low = metric.get("criticalLow")
    crit_high = metric.get("criticalHigh")
    warn_low = metric.get("warningLow")
    warn_high = metric.get("warningHigh")

    if (crit_low is not None and value <= crit_low) or (
        crit_high is not None and value >= crit_high
    ):
        return THRESHOLD_PENALTY["critical"]

    if (warn_low is not None and value <= warn_low) or (
        warn_high is not None and value >= warn_high
    ):
        return THRESHOLD_PENALTY["warning"]

    return 0.0


def _active_alert_count(subsystem_id: str) -> int:
    return sum(
        1 for a in state.alerts
        if a.source == subsystem_id and a.status != "resolved"
    )


def generate_health_index() -> HealthIndex:
    """
    Generate a HealthIndex by updating all subsystem scores and packaging them.
    Updates state.subsystem_scores and state.health_index.
    """
    now = now_ms()
    subsystems: list[SubsystemHealth] = []

    for sub in SUBSYSTEMS:
        sid = sub["subsystemId"]

        # 1. Random drift
        drift = (random.random() - 0.48) * 0.5
        score = state.subsystem_scores.get(sid, 90.0) + drift

        # 2. Threshold penalties from related metrics
        for metric_id in SUBSYSTEM_METRICS.get(sid, []):
            value = state.current_values.get(metric_id)
            if value is not None:
                score -= _threshold_penalty(metric_id, value)

        # 3. Clamp
        score = max(0.0, min(100.0, score))
        state.subsystem_scores[sid] = score

        subsystems.append(
            SubsystemHealth(
                subsystem_id=sid,
                label=sub["label"],
                health_score=round(score, 1),
                status=_score_to_status(score),  # type: ignore[arg-type]
                active_alert_count=_active_alert_count(sid),
                last_updated=now,
            )
        )

    overall = round(
        sum(s.health_score for s in subsystems) / len(subsystems), 1
    )

    health = HealthIndex(overall=overall, timestamp=now, subsystems=subsystems)
    state.health_index = health
    return health
