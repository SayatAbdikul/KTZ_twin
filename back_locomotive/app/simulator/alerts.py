"""
Alert engine — random alert generation.

Matches front_locomotive/src/mocks/data/alertFixtures.ts templates exactly.
The broadcaster runs generate_random_alert() on a timer (every 20-40s, 50% chance).
"""

from __future__ import annotations

import random
from typing import Any

from app.models import Alert, now_ms
from app.state import state


# ---------------------------------------------------------------------------
# Alert templates — ported from alertFixtures.ts
# ---------------------------------------------------------------------------

_ALERT_TEMPLATES: list[dict[str, Any]] = [
    {
        "severity": "critical",
        "source": "engine",
        "title": "Engine Coolant Temperature High",
        "description": "Coolant temperature exceeded critical threshold of 105°C.",
        "recommended_action": (
            "Reduce throttle and monitor temperature. "
            "Prepare for emergency stop if temperature continues rising."
        ),
        "related_metric_ids": ["thermal.coolant_temp"],
    },
    {
        "severity": "warning",
        "source": "brakes",
        "title": "Brake Pipe Pressure Low",
        "description": "Brake pipe pressure has dropped below warning threshold.",
        "recommended_action": "Inspect brake pipe for leaks. Notify maintenance at next stop.",
        "related_metric_ids": ["pressure.brake_pipe"],
    },
    {
        "severity": "warning",
        "source": "fuel",
        "title": "Fuel Level Below 20%",
        "description": "Remaining fuel is at 18.3%. Plan for refueling stop.",
        "recommended_action": (
            "Contact dispatch to schedule refueling. "
            "Continue to next designated fuel point."
        ),
        "related_metric_ids": ["fuel.level"],
    },
    {
        "severity": "info",
        "source": "electrical",
        "title": "Traction Voltage Fluctuation",
        "description": "Minor voltage fluctuation detected in traction system. Within acceptable range.",
        "recommended_action": None,
        "related_metric_ids": ["electrical.traction_voltage"],
    },
    {
        "severity": "critical",
        "source": "pneumatic",
        "title": "Main Reservoir Pressure Critical",
        "description": "Main brake reservoir pressure is critically low at 4.8 bar.",
        "recommended_action": (
            "Immediate action required. Apply emergency brake and stop train."
        ),
        "related_metric_ids": ["pressure.brake_main"],
    },
]


def generate_random_alert() -> Alert:
    """Pick a random alert template and create a new Alert."""
    template = random.choice(_ALERT_TEMPLATES)
    return Alert(
        alert_id=state.next_alert_id(),
        severity=template["severity"],
        status="active",
        source=template["source"],
        title=template["title"],
        description=template["description"],
        recommended_action=template.get("recommended_action"),
        triggered_at=now_ms(),
        related_metric_ids=template["related_metric_ids"],
    )
