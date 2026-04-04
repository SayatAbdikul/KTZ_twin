#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
import statistics
import time
from collections import Counter, deque
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import websockets


def now_ms() -> int:
    return int(time.time() * 1000)


def percentile(samples: list[float], p: float) -> float | None:
    if not samples:
        return None
    ordered = sorted(samples)
    index = min(len(ordered) - 1, max(0, math.ceil((p / 100.0) * len(ordered)) - 1))
    return ordered[index]


def format_pct(samples: deque[float], p: float) -> str:
    value = percentile(list(samples), p)
    return "-" if value is None else f"{value:.1f}"


def locomotive_ids(count: int, prefix: str) -> list[str]:
    return [f"{prefix}-{idx:04d}" for idx in range(1, count + 1)]


def build_targets(base_url: str, count: int, prefix: str) -> str:
    root = base_url.rstrip("/")
    return ",".join(f"{locomotive_id}={root}/{quote(locomotive_id)}" for locomotive_id in locomotive_ids(count, prefix))


def metric_reading(metric_id: str, value: float, unit: str, timestamp: int, quality: str = "good") -> dict[str, Any]:
    return {
        "metric_id": metric_id,
        "value": round(value, 3),
        "unit": unit,
        "timestamp": timestamp,
        "quality": quality,
    }


def event_envelope(event_type: str, locomotive_id: str, occurred_at: int) -> dict[str, Any]:
    return {
        "event_id": str(uuid4()),
        "event_type": event_type,
        "source": "stress-harness",
        "locomotive_id": locomotive_id,
        "occurred_at": occurred_at,
        "schema_version": "1.0",
    }


def telemetry_payload(
    locomotive_id: str,
    timestamp: int,
    tick: int,
    prev_speed_kmh: float,
    distance_km: float,
    fuel_level_pct: float,
) -> tuple[dict[str, Any], float, float, float]:
    offset = (sum(ord(char) for char in locomotive_id) % 360) / 57.3
    phase = tick / 13.0 + offset
    speed_kmh = max(0.0, min(95.0, 48.0 + 31.0 * math.sin(phase) + 12.0 * math.sin(phase / 4.0)))
    accel_mps2 = (speed_kmh - prev_speed_kmh) / 3.6
    distance_km += speed_kmh / 3600.0

    load = min(1.4, max(0.0, 0.20 + speed_kmh / 120.0 + max(accel_mps2, 0.0) * 0.8))
    brake_factor = min(1.0, max(0.0, -accel_mps2 / 0.7))
    fuel_rate_lph = max(18.0, 35.0 + speed_kmh * 1.65 + max(accel_mps2, 0.0) * 85.0)
    fuel_level_pct = max(0.0, fuel_level_pct - fuel_rate_lph / 180000.0)

    coolant_temp_c = min(112.0, 60.0 + load * 28.0 + random.uniform(-0.8, 0.8))
    oil_temp_c = min(145.0, coolant_temp_c + 6.0 + load * 7.0 + random.uniform(-1.0, 1.0))
    exhaust_temp_c = min(680.0, 180.0 + load * 320.0 + speed_kmh * 1.7 + random.uniform(-4.0, 4.0))
    brake_main_bar = max(6.2, 8.2 - brake_factor * 1.3 + random.uniform(-0.05, 0.05))
    brake_pipe_bar = max(3.8, 5.1 - brake_factor * 0.7 + random.uniform(-0.03, 0.03))
    oil_pressure_bar = max(1.9, 2.5 + speed_kmh / 70.0 - load * 0.4 + random.uniform(-0.05, 0.05))
    traction_voltage_v = max(2400.0, 2750.0 - load * 140.0 + random.uniform(-12.0, 12.0))
    traction_current_a = max(0.0, 240.0 + load * 430.0 + max(accel_mps2, 0.0) * 180.0 + random.uniform(-10.0, 10.0))
    battery_voltage_v = max(96.0, 108.0 - load * 3.5 + random.uniform(-0.3, 0.3))

    readings = [
        metric_reading("motion.speed", speed_kmh, "km/h", timestamp),
        metric_reading("motion.acceleration", accel_mps2, "m/s²", timestamp),
        metric_reading("motion.distance", distance_km, "km", timestamp),
        metric_reading("fuel.level", fuel_level_pct, "%", timestamp),
        metric_reading("fuel.consumption_rate", fuel_rate_lph, "L/h", timestamp),
        metric_reading("thermal.coolant_temp", coolant_temp_c, "°C", timestamp),
        metric_reading("thermal.oil_temp", oil_temp_c, "°C", timestamp),
        metric_reading("thermal.exhaust_temp", exhaust_temp_c, "°C", timestamp),
        metric_reading("pressure.brake_main", brake_main_bar, "bar", timestamp),
        metric_reading("pressure.brake_pipe", brake_pipe_bar, "bar", timestamp),
        metric_reading("pressure.oil", oil_pressure_bar, "bar", timestamp),
        metric_reading("electrical.traction_voltage", traction_voltage_v, "V", timestamp),
        metric_reading("electrical.traction_current", traction_current_a, "A", timestamp),
        metric_reading("electrical.battery_voltage", battery_voltage_v, "V", timestamp),
    ]
    payload = {
        "locomotive_id": locomotive_id,
        "frame_id": f"{locomotive_id}-frame-{tick}",
        "timestamp": timestamp,
        "sourceTimestamp": timestamp,
        "readings": readings,
    }
    return payload, speed_kmh, distance_km, fuel_level_pct


@dataclass
class MockServerStats:
    started_at: float = field(default_factory=time.monotonic)
    active_connections: int = 0
    peak_connections: int = 0
    connections_total: int = 0
    messages_total: int = 0
    messages_by_type: Counter[str] = field(default_factory=Counter)

    def note_connect(self) -> None:
        self.connections_total += 1
        self.active_connections += 1
        self.peak_connections = max(self.peak_connections, self.active_connections)

    def note_disconnect(self) -> None:
        self.active_connections = max(0, self.active_connections - 1)

    def note_message(self, msg_type: str) -> None:
        self.messages_total += 1
        self.messages_by_type[msg_type] += 1


@dataclass
class MockLocomotiveConfig:
    host: str
    port: int
    telemetry_interval_s: float
    message_interval_s: float
    operation_interval_s: float
    burst_every_s: float
    burst_duration_s: float
    burst_multiplier: float
    report_interval_s: float


class MockLocomotiveServer:
    def __init__(self, config: MockLocomotiveConfig) -> None:
        self.config = config
        self.stats = MockServerStats()

    def current_interval(self) -> float:
        interval = self.config.telemetry_interval_s
        if self.config.burst_every_s > 0 and self.config.burst_duration_s > 0 and self.config.burst_multiplier > 1:
            elapsed = time.monotonic() - self.stats.started_at
            if elapsed % self.config.burst_every_s < self.config.burst_duration_s:
                interval = interval / self.config.burst_multiplier
        return max(0.001, interval)

    async def report_forever(self) -> None:
        last_messages = 0
        last_ts = time.monotonic()
        while True:
            await asyncio.sleep(self.config.report_interval_s)
            now = time.monotonic()
            total = self.stats.messages_total
            interval_rate = (total - last_messages) / max(0.001, now - last_ts)
            last_messages = total
            last_ts = now
            print(
                "[mock-locomotives] "
                f"active={self.stats.active_connections} "
                f"peak={self.stats.peak_connections} "
                f"total_connections={self.stats.connections_total} "
                f"sent_total={self.stats.messages_total} "
                f"sent_rate={interval_rate:.1f}/s "
                f"types={dict(self.stats.messages_by_type)}"
            )

    async def drain_incoming(self, websocket: Any) -> None:
        try:
            async for _ in websocket:
                pass
        except Exception:
            return

    async def handler(self, websocket: Any) -> None:
        request = getattr(websocket, "request", None)
        path = getattr(request, "path", "") or getattr(websocket, "path", "") or "/"
        locomotive_id = path.rstrip("/").split("/")[-1] or "KTZ-0001"
        self.stats.note_connect()
        receiver = asyncio.create_task(self.drain_incoming(websocket))

        seq = 0
        tick = 0
        prev_speed = 0.0
        distance_km = 0.0
        fuel_level_pct = 92.0 - (sum(ord(char) for char in locomotive_id) % 20)
        next_message_at = time.monotonic() + self.config.message_interval_s if self.config.message_interval_s > 0 else None
        next_operation_at = time.monotonic() + self.config.operation_interval_s if self.config.operation_interval_s > 0 else None

        try:
            while True:
                timestamp = now_ms()
                payload, prev_speed, distance_km, fuel_level_pct = telemetry_payload(
                    locomotive_id=locomotive_id,
                    timestamp=timestamp,
                    tick=tick,
                    prev_speed_kmh=prev_speed,
                    distance_km=distance_km,
                    fuel_level_pct=fuel_level_pct,
                )
                seq += 1
                await websocket.send(
                    json.dumps(
                        {
                            "type": "telemetry.frame",
                            "payload": payload,
                            "timestamp": timestamp,
                            "sequenceId": seq,
                            "event": event_envelope("telemetry.frame", locomotive_id, timestamp),
                        }
                    )
                )
                self.stats.note_message("telemetry.frame")

                now_mono = time.monotonic()
                if next_message_at is not None and now_mono >= next_message_at:
                    seq += 1
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "message.new",
                                "payload": {
                                    "message_id": f"{locomotive_id}-msg-{tick}",
                                    "locomotive_id": locomotive_id,
                                    "body": "Synthetic dispatcher/crew traffic",
                                    "sender": "stress-harness",
                                    "sent_at": timestamp,
                                    "sourceTimestamp": timestamp,
                                },
                                "timestamp": timestamp,
                                "sequenceId": seq,
                                "event": event_envelope("message.new", locomotive_id, timestamp),
                            }
                        )
                    )
                    self.stats.note_message("message.new")
                    next_message_at = now_mono + self.config.message_interval_s

                if next_operation_at is not None and now_mono >= next_operation_at:
                    seq += 1
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "wagon.operation",
                                "payload": {
                                    "operationId": f"{locomotive_id}-op-{tick}",
                                    "locomotiveId": locomotive_id,
                                    "stationId": f"ST-{(tick % 937) + 1:04d}",
                                    "operationType": random.choice(["arrival", "departure", "shunting", "inspection"]),
                                    "sourceTimestamp": timestamp,
                                },
                                "timestamp": timestamp,
                                "sequenceId": seq,
                                "event": event_envelope("wagon.operation", locomotive_id, timestamp),
                            }
                        )
                    )
                    self.stats.note_message("wagon.operation")
                    next_operation_at = now_mono + self.config.operation_interval_s

                tick += 1
                await asyncio.sleep(self.current_interval())
        except Exception:
            return
        finally:
            receiver.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await receiver
            self.stats.note_disconnect()

    async def run(self) -> None:
        reporter = asyncio.create_task(self.report_forever())
        async with websockets.serve(
            self.handler,
            self.config.host,
            self.config.port,
            ping_interval=20,
            max_queue=None,
        ):
            print(
                f"[mock-locomotives] listening on ws://{self.config.host}:{self.config.port} "
                f"(path suffix is locomotive id)"
            )
            try:
                await asyncio.Future()
            finally:
                reporter.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await reporter


@dataclass
class SubscriberStats:
    started_at: float = field(default_factory=time.monotonic)
    connected_clients: int = 0
    peak_connected_clients: int = 0
    connection_attempts: int = 0
    connection_failures: int = 0
    messages_total: int = 0
    messages_by_type: Counter[str] = field(default_factory=Counter)
    parse_errors: int = 0
    dispatcher_lag_ms: deque[float] = field(default_factory=lambda: deque(maxlen=10000))
    origin_lag_ms: deque[float] = field(default_factory=lambda: deque(maxlen=10000))

    def note_connected(self) -> None:
        self.connected_clients += 1
        self.peak_connected_clients = max(self.peak_connected_clients, self.connected_clients)

    def note_disconnected(self) -> None:
        self.connected_clients = max(0, self.connected_clients - 1)

    def note_message(self, message: dict[str, Any]) -> None:
        self.messages_total += 1
        msg_type = str(message.get("type", "unknown"))
        self.messages_by_type[msg_type] += 1
        now = now_ms()

        try:
            timestamp = int(message.get("timestamp", 0))
        except (TypeError, ValueError):
            timestamp = 0
        if timestamp > 0:
            self.dispatcher_lag_ms.append(max(0.0, float(now - timestamp)))

        payload = message.get("payload")
        if isinstance(payload, dict):
            source_timestamp = payload.get("sourceTimestamp") or payload.get("source_timestamp")
            try:
                source_timestamp_int = int(source_timestamp)
            except (TypeError, ValueError):
                source_timestamp_int = 0
            if source_timestamp_int > 0:
                self.origin_lag_ms.append(max(0.0, float(now - source_timestamp_int)))


async def subscriber_reporter(stats: SubscriberStats, report_interval_s: float) -> None:
    last_messages = 0
    last_ts = time.monotonic()
    while True:
        await asyncio.sleep(report_interval_s)
        now = time.monotonic()
        total = stats.messages_total
        interval_rate = (total - last_messages) / max(0.001, now - last_ts)
        last_messages = total
        last_ts = now
        print(
            "[subscribers] "
            f"connected={stats.connected_clients} "
            f"peak={stats.peak_connected_clients} "
            f"attempts={stats.connection_attempts} "
            f"failures={stats.connection_failures} "
            f"recv_total={stats.messages_total} "
            f"recv_rate={interval_rate:.1f}/s "
            f"dispatcher_lag_ms(p50/p95/p99)="
            f"{format_pct(stats.dispatcher_lag_ms, 50)}/"
            f"{format_pct(stats.dispatcher_lag_ms, 95)}/"
            f"{format_pct(stats.dispatcher_lag_ms, 99)} "
            f"origin_lag_ms(p50/p95/p99)="
            f"{format_pct(stats.origin_lag_ms, 50)}/"
            f"{format_pct(stats.origin_lag_ms, 95)}/"
            f"{format_pct(stats.origin_lag_ms, 99)} "
            f"types={dict(stats.messages_by_type)}"
        )


async def subscriber_client(
    client_id: int,
    dispatcher_url: str,
    subscribe_mode: str,
    subscription_locomotive_id: str | None,
    stats: SubscriberStats,
    stop_at: float,
) -> None:
    while time.monotonic() < stop_at:
        stats.connection_attempts += 1
        try:
            async with websockets.connect(dispatcher_url, ping_interval=20, max_queue=None) as websocket:
                stats.note_connected()
                if subscribe_mode == "all":
                    payload = {"locomotiveId": "all"}
                elif subscription_locomotive_id is None:
                    payload = {}
                else:
                    payload = {"locomotiveId": subscription_locomotive_id}

                await websocket.send(json.dumps({"type": "subscribe", "payload": payload}))

                async for raw in websocket:
                    try:
                        message = json.loads(raw)
                    except json.JSONDecodeError:
                        stats.parse_errors += 1
                        continue
                    if isinstance(message, dict):
                        stats.note_message(message)
                    if time.monotonic() >= stop_at:
                        return
        except Exception:
            stats.connection_failures += 1
            await asyncio.sleep(1.0)
        finally:
            stats.note_disconnected()
    print(f"[subscribers] client={client_id} finished")


async def run_subscribers(args: argparse.Namespace) -> None:
    ids = locomotive_ids(args.locomotives, args.id_prefix)
    stats = SubscriberStats()
    stop_at = time.monotonic() + args.run_seconds
    reporter = asyncio.create_task(subscriber_reporter(stats, args.report_interval_s))
    tasks: list[asyncio.Task[None]] = []

    for client_index in range(args.clients):
        locomotive_id = None
        if args.subscribe == "single":
            locomotive_id = ids[client_index % len(ids)]
        tasks.append(
            asyncio.create_task(
                subscriber_client(
                    client_id=client_index,
                    dispatcher_url=args.dispatcher_url,
                    subscribe_mode=args.subscribe,
                    subscription_locomotive_id=locomotive_id,
                    stats=stats,
                    stop_at=stop_at,
                )
            )
        )
        if args.connect_rate_per_s > 0:
            await asyncio.sleep(1.0 / args.connect_rate_per_s)

    try:
        remaining = max(0.0, stop_at - time.monotonic())
        await asyncio.sleep(remaining)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        reporter.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await reporter

    elapsed = max(0.001, time.monotonic() - stats.started_at)
    dispatcher_lag_avg = f"{statistics.fmean(stats.dispatcher_lag_ms):.1f}" if stats.dispatcher_lag_ms else "-"
    origin_lag_avg = f"{statistics.fmean(stats.origin_lag_ms):.1f}" if stats.origin_lag_ms else "-"
    print(
        "[subscribers] final "
        f"elapsed={elapsed:.1f}s "
        f"recv_total={stats.messages_total} "
        f"avg_rate={stats.messages_total / elapsed:.1f}/s "
        f"failures={stats.connection_failures} "
        f"parse_errors={stats.parse_errors} "
        f"dispatcher_lag_avg_ms={dispatcher_lag_avg} "
        f"origin_lag_avg_ms={origin_lag_avg}"
    )
    print(
        "[subscribers] final "
        f"dispatcher_lag_ms(p50/p95/p99)="
        f"{format_pct(stats.dispatcher_lag_ms, 50)}/"
        f"{format_pct(stats.dispatcher_lag_ms, 95)}/"
        f"{format_pct(stats.dispatcher_lag_ms, 99)} "
        f"origin_lag_ms(p50/p95/p99)="
        f"{format_pct(stats.origin_lag_ms, 50)}/"
        f"{format_pct(stats.origin_lag_ms, 95)}/"
        f"{format_pct(stats.origin_lag_ms, 99)} "
        f"types={dict(stats.messages_by_type)}"
    )


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description="Stress harness for the websocket-based dispatcher service.")
    sub = cli.add_subparsers(dest="command", required=True)

    print_targets = sub.add_parser("print-targets", help="Print LOCOMOTIVE_TARGETS for many synthetic locomotives.")
    print_targets.add_argument("--locomotives", type=int, default=1700)
    print_targets.add_argument("--id-prefix", default="KTZ")
    print_targets.add_argument("--base-url", default="ws://127.0.0.1:8765/loco")

    mock = sub.add_parser("mock-locomotives", help="Run a websocket server that impersonates many locomotives.")
    mock.add_argument("--host", default="0.0.0.0")
    mock.add_argument("--port", type=int, default=8765)
    mock.add_argument("--telemetry-interval-s", type=float, default=1.0)
    mock.add_argument("--message-interval-s", type=float, default=0.0)
    mock.add_argument("--operation-interval-s", type=float, default=0.0)
    mock.add_argument("--burst-every-s", type=float, default=0.0)
    mock.add_argument("--burst-duration-s", type=float, default=0.0)
    mock.add_argument("--burst-multiplier", type=float, default=1.0)
    mock.add_argument("--report-interval-s", type=float, default=5.0)

    subscribers = sub.add_parser("subscribers", help="Open many dispatcher websocket clients and measure throughput.")
    subscribers.add_argument("--dispatcher-url", default="ws://127.0.0.1:3010/ws")
    subscribers.add_argument("--clients", type=int, default=10)
    subscribers.add_argument("--subscribe", choices=["all", "single"], default="all")
    subscribers.add_argument("--locomotives", type=int, default=1700)
    subscribers.add_argument("--id-prefix", default="KTZ")
    subscribers.add_argument("--run-seconds", type=float, default=60.0)
    subscribers.add_argument("--connect-rate-per-s", type=float, default=20.0)
    subscribers.add_argument("--report-interval-s", type=float, default=5.0)

    return cli


async def async_main(args: argparse.Namespace) -> None:
    if args.command == "print-targets":
        print(build_targets(args.base_url, args.locomotives, args.id_prefix))
        return

    if args.command == "mock-locomotives":
        server = MockLocomotiveServer(
            MockLocomotiveConfig(
                host=args.host,
                port=args.port,
                telemetry_interval_s=args.telemetry_interval_s,
                message_interval_s=args.message_interval_s,
                operation_interval_s=args.operation_interval_s,
                burst_every_s=args.burst_every_s,
                burst_duration_s=args.burst_duration_s,
                burst_multiplier=args.burst_multiplier,
                report_interval_s=args.report_interval_s,
            )
        )
        await server.run()
        return

    if args.command == "subscribers":
        await run_subscribers(args)
        return

    raise ValueError(f"Unsupported command: {args.command}")


def main() -> None:
    args = parser().parse_args()
    try:
        asyncio.run(async_main(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
