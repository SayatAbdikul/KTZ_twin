"""
Dispatcher message generator.

Cycles through templates matching front_locomotive/src/mocks/data/messageFixtures.ts.
"""

from __future__ import annotations

from app.models import DispatcherMessage, now_ms
from app.state import state


_MESSAGE_TEMPLATES = [
    {
        "priority": "normal",
        "type": "informational",
        "subject": "Обновлённое расписание",
        "body": "Ваше обновлённое расписание опубликовано. Ознакомьтесь с ним на следующей остановке.",
        "sender_name": "Диспетчер",
    },
    {
        "priority": "high",
        "type": "assessment",
        "subject": "Оценка эффективности",
        "body": (
            "Топливная эффективность на текущем участке на 8% ниже целевой. "
            "Рассмотрите корректировку управления тягой."
        ),
        "sender_name": "Операционный центр",
    },
    {
        "priority": "normal",
        "type": "recommendation",
        "subject": "Погодное предупреждение",
        "body": (
            "На участках KZ-15 - KZ-20 ожидается сильный дождь. "
            "Возможна пониженная видимость. Снизьте скорость соответственно."
        ),
        "sender_name": "Диспетчер",
    },
]


def generate_dispatcher_message() -> DispatcherMessage:
    """Generate a new dispatcher message (cycles through templates)."""
    template = _MESSAGE_TEMPLATES[state.message_counter % len(_MESSAGE_TEMPLATES)]
    return DispatcherMessage(
        message_id=state.next_message_id(),
        priority=template["priority"],   # type: ignore[arg-type]
        type=template["type"],           # type: ignore[arg-type]
        subject=template["subject"],
        body=template["body"],
        sender_name=template["sender_name"],
        sent_at=now_ms(),
    )
