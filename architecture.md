# KTZ Twin Architecture

This document describes the system as it exists in the current codebase.

It covers:

- service responsibilities
- runtime topology
- HTTP contracts
- WebSocket contracts
- telemetry and health contracts
- known mismatches between the current implementation and the intended target architecture

## 1. System Overview

Current services:

1. `back_locomotive`
2. `back_dispatcher`
3. `front_locomotive`
4. `front_dispatcher`

Current implemented topology:

```text
front_locomotive  --WS-->  back_dispatcher  --WS-->  back_locomotive
front_dispatcher  --WS-->  back_dispatcher

front_locomotive  --HTTP--> back_locomotive   (legacy / partial)
```

Important: the codebase still contains two different architectural ideas:

- the intended target architecture:
  - raw telemetry seeded to CSV
  - locomotive replay service
  - dispatcher computes health and alerts from raw telemetry rules
- the currently implemented runtime:
  - `back_locomotive` is still an in-memory simulator
  - `back_dispatcher` connects to locomotive services over WebSocket
  - Kafka is not implemented in the current source tree

So this document separates "current implementation" from "target contracts".

## 2. Service Responsibilities

### 2.1 `back_locomotive`

Path: [back_locomotive](/home/martian/Documents/swe/KTZ_twin/back_locomotive)

Current responsibility:

- simulate locomotive telemetry in memory
- generate health updates in memory
- generate random alerts and messages
- expose REST endpoints
- broadcast telemetry, health, alerts, messages, and heartbeat over WebSocket

It is not currently:

- replaying `telemetry.csv`
- publishing Kafka events
- emitting the reduced raw telemetry schema from `generate_core_synthetic_telemetry.py`

### 2.2 `back_dispatcher`

Path: [back_dispatcher](/home/martian/Documents/swe/KTZ_twin/back_dispatcher)

Current responsibility:

- open one outbound WebSocket client per configured locomotive target
- ingest `telemetry.frame` and `message.new` from each locomotive backend
- derive rule-based `health.update` and alert events from incoming telemetry
- keep per-locomotive in-memory state
- expose dispatcher WebSocket for frontends
- expose small HTTP inspection endpoints

### 2.3 `front_locomotive`

Path: [front_locomotive](/home/martian/Documents/swe/KTZ_twin/front_locomotive)

Current responsibility:

- connect to a single websocket endpoint
- subscribe to one configured locomotive
- render:
  - live telemetry cards
  - subsystem health
  - locomotive diagram
  - alerts
  - dispatcher messages

Current defaults:

- `WS_URL`: `ws://localhost:3010/ws`
- `API_BASE_URL`: `http://localhost:3001`
- `LOCOMOTIVE_ID`: `KTZ-2001`

This means the locomotive UI currently expects dispatcher to be the live WS source.

### 2.4 `front_dispatcher`

Path: [front_dispatcher](/home/martian/Documents/swe/KTZ_twin/front_dispatcher)

Current responsibility:

- connect to dispatcher websocket
- render multi-locomotive telemetry list
- show dispatcher chat stream

Important current inconsistency:

- default `WS_URL` in [front_dispatcher/src/config.ts](/home/martian/Documents/swe/KTZ_twin/front_dispatcher/src/config.ts) is `ws://localhost:3001/ws`
- that points to `back_locomotive`, not `back_dispatcher`
- this only works correctly if build-time env overrides it

## 3. Current Runtime Topology

### 3.1 Back Dispatcher Startup

Entrypoint: [back_dispatcher/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/main.py)

Startup flow:

1. parse `LOCOMOTIVE_TARGETS`
2. create one `LocomotiveRuntime` per target
3. spawn `connect_locomotive_forever(...)` task per target
4. accept frontend websocket clients on `/ws`

### 3.2 Back Locomotive Startup

Entrypoint: [back_locomotive/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/main.py)

Startup flow:

1. generate initial telemetry frame
2. generate initial health index
3. start background tasks:
   - telemetry every 1s
   - health every 5s
   - heartbeat every 10s
   - random alert generation
   - random message generation

## 4. Standard WebSocket Envelope

Used by both backends:

```json
{
  "type": "telemetry.frame",
  "payload": {},
  "timestamp": 1710000000000,
  "sequenceId": 42
}
```

Fields:

- `type`: message type string
- `payload`: message body
- `timestamp`: server send time in epoch ms
- `sequenceId`: monotonic per-process sequence counter

### 4.1 Event Contract v1 (Producer/Consumer)

For service-to-service streaming (and now also attached to WS envelopes for compatibility),
the event metadata contract is:

```json
{
  "event_id": "f4f2e5d2-c0cb-4f8f-a9e8-5ccf3d2b2d8b",
  "event_type": "telemetry.frame",
  "source": "back_locomotive",
  "locomotive_id": "KTZ-2001",
  "occurred_at": 1710000000000,
  "schema_version": "1.0"
}
```

Required fields:

- `event_id`: UUID identifier for deduplication and tracing
- `event_type`: logical event type (must match transport envelope `type`)
- `source`: producer service name
- `locomotive_id`: entity key used for ordering and routing
- `occurred_at`: event production time in epoch ms
- `schema_version`: contract version, currently `1.0`

Validation rules implemented:

- producer always emits `event` metadata with `schema_version=1.0`
- consumer rejects frames without `event`
- consumer rejects unsupported `schema_version`
- consumer rejects `event_type` mismatch with transport `type`
- consumer rejects `locomotive_id` mismatch for the current target stream

## 5. `back_locomotive` Contracts

### 5.1 HTTP Routes

Defined in:

- [back_locomotive/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/main.py)
- route modules under [back_locomotive/app/routes](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/routes)

Current HTTP routes:

- `GET /ping`
- `GET /api/telemetry/current`
- `GET /api/telemetry/metrics`
- `GET /api/telemetry/history/{metric_id}`
- `GET /api/health`
- `GET /api/alerts`
- `POST /api/alerts/{alert_id}/acknowledge`
- `GET /api/messages`
- `POST /api/messages/{message_id}/read`
- `POST /api/messages/{message_id}/acknowledge`
- `GET /api/connection/status`
- `GET /api/replay/snapshot`

These are still simulator-era routes.

### 5.2 WebSocket Route

Route:

- `WS /ws`

Defined in:

- [back_locomotive/app/ws/handler.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/ws/handler.py)
- [back_locomotive/app/ws/broadcaster.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/ws/broadcaster.py)

Incoming client messages accepted:

- `subscribe`
- `heartbeat.ack`

Outgoing message types:

- `connection.status`
- `telemetry.frame`
- `health.update`
- `connection.heartbeat`
- `alert.new`
- `message.new`

Important behavior:

- no per-client filtering
- all clients receive all live events
- `connection.status` payload currently contains only:

```json
{
  "dispatcherStatus": "connected"
}
```

### 5.3 Telemetry Contract From `back_locomotive`

Current emitted telemetry is UI-oriented, not raw-seeding-oriented.

Current payload shape:

```json
{
  "locomotiveId": "KTZ-2001",
  "frameId": "frame-123",
  "timestamp": 1710000000000,
  "readings": [
    {
      "metricId": "motion.speed",
      "value": 80,
      "unit": "km/h",
      "timestamp": 1710000000000,
      "quality": "good"
    }
  ]
}
```

Key metric IDs currently produced:

- `motion.speed`
- `motion.acceleration`
- `motion.distance`
- `fuel.level`
- `fuel.consumption_rate`
- `thermal.coolant_temp`
- `thermal.oil_temp`
- `thermal.exhaust_temp`
- `pressure.brake_main`
- `pressure.brake_pipe`
- `pressure.oil`
- `electrical.traction_voltage`
- `electrical.traction_current`
- `electrical.battery_voltage`

This is defined by the simulator in [back_locomotive/app/simulator/telemetry.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/simulator/telemetry.py).

## 6. `back_dispatcher` Contracts

### 6.1 HTTP Routes

Defined in:

- [back_dispatcher/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/main.py)
- [back_dispatcher/app/routes/health.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/routes/health.py)
- [back_dispatcher/app/routes/locomotives.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/routes/locomotives.py)

Routes:

- `GET /ping`
- `GET /api/health`
- `GET /api/locomotives`
- `GET /api/locomotives/{locomotive_id}/latest-telemetry`
- `GET /api/locomotives/{locomotive_id}/chat`

Meaning:

- `/ping`: liveness
- `/api/health`: dispatcher service health, not locomotive health
- `/api/locomotives`: configured locomotive targets and status
- `/latest-telemetry`: latest cached `telemetry.frame` payload
- `/chat`: in-memory chat history for one locomotive

### 6.2 Dispatcher WebSocket Route

Route:

- `WS /ws`

Defined in:

- [back_dispatcher/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/main.py)
- [back_dispatcher/app/ws_server.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/ws_server.py)

Incoming client messages:

#### `subscribe`

Examples:

```json
{ "type": "subscribe", "payload": { "channels": ["telemetry"] } }
```

```json
{ "type": "subscribe", "payload": { "locomotiveId": "KTZ-2001" } }
```

Behavior:

- no `locomotiveId` means unfiltered / all
- `"*"` or `"all"` means all locomotives
- specific `locomotiveId` means only that locomotive

#### `dispatcher.chat`

Example:

```json
{
  "type": "dispatcher.chat",
  "payload": {
    "locomotiveId": "KTZ-2001",
    "body": "Reduce speed to 60 km/h",
    "timestamp": 1710000000000
  }
}
```

Behavior:

- dispatcher stores the message in in-memory chat history
- dispatcher tries to forward it to the configured locomotive websocket
- a `message.new` event is broadcast afterward

### 6.3 Outgoing Dispatcher WS Message Types

Current outgoing types:

- `dispatcher.snapshot`
- `dispatcher.locomotive_status`
- `telemetry.frame`
- `health.update`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`
- `locomotive.event`

#### `dispatcher.snapshot`

Sent immediately on client connect.

Payload:

```json
{
  "locomotives": [
    {
      "locomotiveId": "KTZ-2001",
      "wsUrl": "ws://localhost:3001/ws",
      "connected": true,
      "lastSeenAt": 1710000000000,
      "reconnectAttempt": 0
    }
  ]
}
```

#### `dispatcher.locomotive_status`

Broadcast when a locomotive websocket connects or disconnects.

Payload fields:

- `locomotiveId`
- `connected`
- `wsUrl`
- `lastSeenAt`
- optional `reconnectAttempt`
- optional `error`

#### `telemetry.frame`

Dispatcher forwards the `telemetry.frame` payload it received from the locomotive backend.

Dispatcher does not re-map the payload shape yet.

#### `health.update`

Dispatcher computes this locally from incoming telemetry using [back_dispatcher/app/health_engine.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/health_engine.py).

Payload shape:

```json
{
  "locomotive_id": "KTZ-2001",
  "overall": 74,
  "timestamp": 1710000000000,
  "subsystems": [
    {
      "subsystem_id": "brakes",
      "label": "Brakes",
      "health_score": 52.0,
      "status": "warning",
      "active_alert_count": 1,
      "last_updated": 1710000000000
    }
  ]
}
```

Subsystem IDs currently used by the locomotive UI:

- `engine`
- `brakes`
- `electrical`
- `fuel`
- `cooling`
- `pneumatic`

#### `alert.new` / `alert.update`

Payload shape:

```json
{
  "alert_id": "KTZ-2001:brake_response_weak",
  "locomotive_id": "KTZ-2001",
  "severity": "critical",
  "status": "active",
  "source": "brakes",
  "title": "Brake response weak at speed",
  "description": "Brake demand is high but braking pressure response and deceleration remain weak.",
  "recommended_action": "Reduce speed immediately and inspect brake valves, cylinders, and pneumatic lines.",
  "triggered_at": 1710000000000,
  "related_metric_ids": ["pressure.brake_pipe", "pressure.brake_main", "motion.speed"]
}
```

Alert `source` should align with locomotive UI subsystem IDs where possible:

- `engine`
- `brakes`
- `electrical`
- `fuel`
- `cooling`
- `pneumatic`

#### `alert.resolved`

Payload shape:

```json
{
  "alert_id": "KTZ-2001:brake_response_weak",
  "locomotive_id": "KTZ-2001",
  "resolved_at": 1710000005000
}
```

#### `message.new`

Payload shape currently varies by origin.

Dispatcher-originated message payload:

```json
{
  "message_id": "dispatcher-1710000000000",
  "locomotive_id": "KTZ-2001",
  "body": "Reduce speed to 60 km/h",
  "sender": "dispatcher",
  "sent_at": 1710000000000,
  "delivered": true
}
```

Locomotive-originated payload is passed through from `back_locomotive`.

### 6.4 Rule Engine Contract

Rule engine file:

- [back_dispatcher/app/health_engine.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/health_engine.py)

What it currently does:

- takes incoming `telemetry.frame`
- converts `readings[]` into a metric map
- stores rolling history in memory
- computes health scores and alert lifecycle

Important limitation:

- current implementation evaluates against the old simulator metric IDs
- it does not yet consume the reduced raw telemetry schema from `generate_core_synthetic_telemetry.py`

## 7. Frontend Contracts

### 7.1 `front_locomotive`

Current websocket message types consumed:

- `telemetry.frame`
- `health.update`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`
- `connection.heartbeat`
- `connection.status`

Defined in [front_locomotive/src/types/websocket.ts](/home/martian/Documents/swe/KTZ_twin/front_locomotive/src/types/websocket.ts).

Important UI behavior:

- the dashboard and diagram use `health.update` subsystem IDs to color subsystem zones
- the detail panel filters alerts by `alert.source === zone.subsystemId`
- the locomotive UI now filters incoming events by `APP_CONFIG.LOCOMOTIVE_ID`

### 7.2 `front_dispatcher`

Current websocket usage:

- subscribes to dispatcher websocket
- currently uses only:
  - `telemetry.frame`
  - `message.new`

It does not currently consume:

- `health.update`
- `alert.*`
- `dispatcher.locomotive_status`

## 8. Telemetry Contracts

### 8.1 Current Live Telemetry Contract

Current live runtime telemetry contract is the simulator metric frame from `back_locomotive`.

This is the contract actively flowing through:

```text
back_locomotive simulator -> telemetry.frame -> back_dispatcher -> frontends
```

### 8.2 Intended Raw Telemetry Contract

The intended raw telemetry contract is documented in:

- [docs/CORE_TELEMETRY_SEEDING_DOCS.md](/home/martian/Documents/swe/KTZ_twin/docs/CORE_TELEMETRY_SEEDING_DOCS.md)
- [docs/HEALTH_INDEX_RULES.md](/home/martian/Documents/swe/KTZ_twin/docs/HEALTH_INDEX_RULES.md)

Reduced raw fields:

- `timestamp`
- `t_ms`
- `locomotive_id`
- `locomotive_type`
- `speed_kmh`
- `adhesion_coeff`
- `traction_current_a`
- `brake_pipe_pressure_bar`
- `brake_cylinder_pressure_bar`
- `traction_motor_temp_c`
- `bearing_temp_c`
- `fault_code`
- `catenary_voltage_kv`
- `transformer_temp_c`
- `fuel_level_l`
- `fuel_rate_lph`
- `oil_pressure_bar`
- `coolant_temp_c`

This contract is not currently emitted by `back_locomotive`.

## 9. Docker / Compose Contracts

Current compose file:

- [docker-compose.microservices.yml](/home/martian/Documents/swe/KTZ_twin/docker-compose.microservices.yml)

Current file behavior:

- starts four services:
  - `back_locomotive`
  - `back_dispatcher`
  - `front_locomotive`
  - `front_dispatcher`
- no Kafka service is present in the current compose file
- dispatcher depends on locomotive
- both frontends depend on their respective backends

Important current mismatch:

- docs elsewhere describe a Kafka-based topology
- current compose is still websocket-only

## 10. Current Inconsistencies

These are the main inconsistencies you need to keep in mind while working in this repo.

### 10.1 Raw seeding docs vs runtime implementation

Docs say:

- raw telemetry comes from `generate_core_synthetic_telemetry.py`
- dispatcher should compute health from raw signals

Code currently does:

- `back_locomotive` simulates old metric-frame telemetry
- dispatcher computes health from those simulator metrics

### 10.2 Intended replay service vs current simulator

Target idea:

- locomotive backend should replay CSV

Current implementation:

- locomotive backend is still a simulator with random alerts/messages

### 10.3 Kafka architecture vs current code

Target idea:

- backend-to-backend via Kafka

Current implementation:

- dispatcher uses outbound websocket clients to locomotive services

### 10.4 Frontend default URLs

- `front_locomotive` defaults to dispatcher websocket, which is correct for the current health/alert flow
- `front_dispatcher` defaults to `ws://localhost:3001/ws`, which is wrong unless overridden at build time

## 11. Recommended Contract Direction

The clean target architecture should be:

```text
telemetry.csv replay -> back_locomotive -> raw event transport -> back_dispatcher -> health/alerts -> frontends
```

Recommended contract split:

1. raw backend contract
   - reduced raw telemetry schema from `CORE_TELEMETRY_SEEDING_DOCS.md`

2. frontend live contract
   - `telemetry.frame`
   - `health.update`
   - `alert.*`
   - `message.new`

3. explicit mapping layer
   - raw telemetry -> UI metric IDs
   - raw telemetry -> rule engine features

That avoids coupling frontend display contracts directly to raw data storage contracts.

## 12. File Index

Most important files for understanding the system:

- [back_locomotive/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/main.py)
- [back_locomotive/app/simulator/telemetry.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/simulator/telemetry.py)
- [back_locomotive/app/ws/broadcaster.py](/home/martian/Documents/swe/KTZ_twin/back_locomotive/app/ws/broadcaster.py)
- [back_dispatcher/app/main.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/main.py)
- [back_dispatcher/app/locomotive_client.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/locomotive_client.py)
- [back_dispatcher/app/health_engine.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/health_engine.py)
- [back_dispatcher/app/ws_server.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/ws_server.py)
- [front_locomotive/src/services/websocket/wsClient.ts](/home/martian/Documents/swe/KTZ_twin/front_locomotive/src/services/websocket/wsClient.ts)
- [front_locomotive/src/services/websocket/wsMessageRouter.ts](/home/martian/Documents/swe/KTZ_twin/front_locomotive/src/services/websocket/wsMessageRouter.ts)
- [front_dispatcher/src/services/wsClient.ts](/home/martian/Documents/swe/KTZ_twin/front_dispatcher/src/services/wsClient.ts)
- [docs/CORE_TELEMETRY_SEEDING_DOCS.md](/home/martian/Documents/swe/KTZ_twin/docs/CORE_TELEMETRY_SEEDING_DOCS.md)
- [docs/HEALTH_INDEX_RULES.md](/home/martian/Documents/swe/KTZ_twin/docs/HEALTH_INDEX_RULES.md)
