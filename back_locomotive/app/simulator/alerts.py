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
        "title": "Высокая температура охлаждающей жидкости двигателя",
        "description": "Температура охлаждающей жидкости превысила критический порог 105°C.",
        "recommended_action": (
            "Снизьте тягу и контролируйте температуру. "
            "Подготовьтесь к экстренной остановке, если температура продолжит расти."
        ),
        "related_metric_ids": ["thermal.coolant_temp"],
    },
    {
        "severity": "warning",
        "source": "brakes",
        "title": "Низкое давление в тормозной магистрали",
        "description": "Давление в тормозной магистрали опустилось ниже предупредительного порога.",
        "recommended_action": "Проверьте тормозную магистраль на утечки. Сообщите в обслуживание на следующей остановке.",
        "related_metric_ids": ["pressure.brake_pipe"],
    },
    {
        "severity": "warning",
        "source": "fuel",
        "title": "Уровень топлива ниже 20%",
        "description": "Остаток топлива составляет 18,3%. Запланируйте дозаправку.",
        "recommended_action": (
            "Свяжитесь с диспетчером, чтобы согласовать дозаправку. "
            "Следуйте до ближайшей запланированной точки заправки."
        ),
        "related_metric_ids": ["fuel.level"],
    },
    {
        "severity": "info",
        "source": "electrical",
        "title": "Колебание тягового напряжения",
        "description": "В тяговой системе зафиксировано незначительное колебание напряжения. Значение остаётся в допустимых пределах.",
        "recommended_action": None,
        "related_metric_ids": ["electrical.traction_voltage"],
    },
    {
        "severity": "critical",
        "source": "pneumatic",
        "title": "Критическое давление в главном резервуаре",
        "description": "Давление в главном тормозном резервуаре критически низкое: 4,8 бар.",
        "recommended_action": (
            "Требуются немедленные действия. Примените экстренное торможение и остановите поезд."
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
