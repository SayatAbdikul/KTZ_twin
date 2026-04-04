from __future__ import annotations

from app.auth import AuthContext
from app.repository import get_known_locomotive_ids
from app.state import state


def build_locomotive_summaries(auth: AuthContext) -> list[dict[str, object | None]]:
    known_ids = set(state.locomotives.keys())
    known_ids.update(get_known_locomotive_ids())

    summaries: list[dict[str, object | None]] = []
    for locomotive_id in sorted(known_ids):
        if not auth.can_access_locomotive(locomotive_id):
            continue

        runtime = state.locomotives.get(locomotive_id)
        summaries.append(
            {
                "locomotiveId": locomotive_id,
                "wsUrl": runtime.target.ws_url if runtime is not None else f"kafka://{locomotive_id}",
                "connected": runtime.connected if runtime is not None else False,
                "lastSeenAt": runtime.last_seen_at if runtime is not None else None,
                "reconnectAttempt": runtime.reconnect_attempt if runtime is not None else 0,
                "hasTelemetry": (runtime.latest_telemetry is not None) if runtime is not None else True,
            }
        )

    return summaries
