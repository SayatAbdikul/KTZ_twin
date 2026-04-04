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
        "subject": "Updated Schedule",
        "body": "Your updated schedule has been posted. Please review at next station stop.",
        "sender_name": "Dispatcher",
    },
    {
        "priority": "high",
        "type": "assessment",
        "subject": "Performance Assessment",
        "body": (
            "Fuel efficiency for current segment is 8% below target. "
            "Consider adjusting throttle management."
        ),
        "sender_name": "Operations Centre",
    },
    {
        "priority": "normal",
        "type": "recommendation",
        "subject": "Weather Advisory",
        "body": (
            "Heavy rain forecast for sections KZ-15 to KZ-20. "
            "Reduced visibility expected. Reduce speed accordingly."
        ),
        "sender_name": "Dispatcher",
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
