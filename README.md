# KTZ Digital Twin

KTZ Digital Twin is a hackathon project for locomotive telemetry visualization, operator awareness, dispatcher monitoring, and historical replay. The current implemented system uses a FastAPI-based locomotive simulator for live telemetry, a dispatcher service with Kafka and TimescaleDB for aggregation and replay, and two React frontends for operator and dispatcher workflows.

## What Is In This Repo

| Path | Purpose |
| --- | --- |
| `back_locomotive/` | Live locomotive backend: telemetry simulator, health generation, alerts, messages, export routes, and operator-facing REST/WS APIs |
| `back_dispatcher/` | Dispatcher backend: Kafka/WS ingest, TimescaleDB replay storage, replay APIs, dispatcher WS fan-out, and runtime health |
| `front_locomotive/` | Main operator UI: dashboard, telemetry, diagram, alerts, messages, replay, and export actions |
| `front_dispatcher/` | Dispatcher console for monitoring multiple locomotives and sending chat/directives |
| `docs/` | Supporting docs for Docker, seeding, health rules, stress testing, and design notes |
| `scripts/` | Helper scripts, including the Docker microservices launcher |
| `shared/` | Shared runtime assets such as `thresholds.json` mounted into both backends |
| `map_gis/` | Optional Leaflet-based map view for geospatial monitoring experiments |
| `generate_synthetic_telemetry.py` | Rich synthetic telemetry generator |
| `generate_core_synthetic_telemetry.py` | Reduced “core telemetry” generator used by the docs/demo flow |
| `architecture.md` | Current architecture deep-dive and runtime contract notes |
| `IMPLEMENTATION_PLAN.md` | Phase-by-phase delivery plan and hackathon gap analysis |

## Tech Stack

| Area | Technologies |
| --- | --- |
| Operator frontend | React 19, TypeScript, Vite, Zustand, TanStack Query, ECharts, Tailwind CSS |
| Dispatcher frontend | React 19, TypeScript, Vite, Zustand |
| Locomotive backend | FastAPI, Python 3.12, in-memory simulator, WebSocket broadcasting, Kafka producer |
| Dispatcher backend | FastAPI, Python 3.12, Kafka consumer, TimescaleDB/PostgreSQL, Alembic |
| Streaming and storage | Kafka, TimescaleDB |
| Packaging and runtime | Docker Compose, Nginx, `.env.microservices` |

## Current Runtime Architecture

The repo contains older target-architecture notes, but the current implemented stack is the Docker microservices setup below:

```text
front_locomotive --REST/WS--> back_locomotive --Kafka--> back_dispatcher --TimescaleDB
front_locomotive --Replay REST---------------> back_dispatcher
front_dispatcher --WS-----------------------> back_dispatcher
```

- `back_locomotive` is the live simulator and operator API surface.
- `back_dispatcher` ingests locomotive events from Kafka and/or outbound locomotive WS connections, computes dispatcher-side runtime state, and persists replay history in TimescaleDB.
- `front_locomotive` uses live REST/WS against the locomotive backend and replay HTTP against the dispatcher backend in the Docker stack.
- `front_dispatcher` connects to the dispatcher backend over WebSocket.

Deep-dive docs:
- [architecture.md](./architecture.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)
- [front_dispatcher/README.md](./front_dispatcher/README.md)
- [map_gis/README.md](./map_gis/README.md)

## Quick Start

### Recommended: Docker stack

From the repo root:

```bash
./scripts/start_microservices.sh up
```

Helpful commands:

```bash
./scripts/start_microservices.sh ps
./scripts/start_microservices.sh logs
./scripts/start_microservices.sh down
```

### Service URLs

The current documented defaults come from `.env.microservices` and `docker-compose.microservices.yml`:

| Service | URL / Port |
| --- | --- |
| Locomotive backend | `http://localhost:3001` |
| Dispatcher backend | `http://localhost:3010` |
| Operator frontend | `http://localhost:5183` |
| Dispatcher frontend | `http://localhost:5174` |
| Kafka | `localhost:9092` |
| TimescaleDB | `localhost:5433` |

### Auth

Most runtime endpoints are protected in the current stack:

- REST requests require `X-API-Key`
- WebSocket connections require `?apiKey=...`
- `/ping` remains public

Current demo key in `.env.microservices`:

```text
ktz-demo-key
```

### Local development

If you want to run pieces outside Docker, use the service-level docs instead of duplicating the full setup here:

- [front_locomotive/README.md](./front_locomotive/README.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)
- [front_dispatcher/README.md](./front_dispatcher/README.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)

Note: code-level fallback URLs do not always match the Docker stack defaults, so use the compose env values as the source of truth when running the full project.

## Operator and Replay API Summary

### Locomotive backend (`back_locomotive`)

Public health check:

- `GET /ping`

Protected operator routes:

| Route | Purpose |
| --- | --- |
| `GET /api/telemetry/current` | Current live telemetry frame |
| `GET /api/telemetry/metrics` | Effective metric definitions and thresholds |
| `GET /api/telemetry/history/{metric_id}` | Short in-memory history for one metric |
| `GET /api/health` | Current overall/subsystem health |
| `GET /api/alerts` | Alert feed |
| `POST /api/alerts/{alert_id}/acknowledge` | Acknowledge an alert |
| `GET /api/messages` | Dispatcher/operator message feed |
| `POST /api/messages/{message_id}/read` | Mark message as read |
| `POST /api/messages/{message_id}/acknowledge` | Acknowledge message |
| `GET /api/connection/status` | Locomotive connection/runtime status |
| `GET /api/config/thresholds` | Read shared threshold config |
| `PUT /api/config/thresholds` | Update shared threshold config |
| `GET /api/export/telemetry/csv` | Export raw live telemetry history as CSV |
| `GET /api/export/alerts/csv` | Export current alerts as CSV |
| `GET /api/replay/snapshot` | Legacy in-memory snapshot route |

Live operator WebSocket:

- `WS /ws?apiKey=...`

Main outbound message families:

- `telemetry.frame`
- `health.update`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`
- `connection.heartbeat`

### Dispatcher backend replay/API surface (`back_dispatcher`)

Public health check:

- `GET /ping`

Protected REST routes:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Dispatcher health, runtime stats, and backpressure visibility |
| `GET /api/locomotives` | Configured locomotive targets and connection state |
| `GET /api/locomotives/{locomotive_id}/latest-telemetry` | Latest ingested telemetry snapshot |
| `GET /api/locomotives/{locomotive_id}/chat` | Dispatcher chat history |
| `GET /api/locomotives/{locomotive_id}/telemetry/recent` | Recent persisted telemetry slice |
| `GET /api/locomotives/{locomotive_id}/replay/time-range` | Earliest/latest persisted replay timestamps |
| `GET /api/locomotives/{locomotive_id}/replay/range` | Historical replay series with resolution control |
| `GET /api/locomotives/{locomotive_id}/replay/snapshot` | Telemetry/health/alerts at a selected timestamp |

Dispatcher WebSocket:

- `WS /ws?apiKey=...`

Key dispatcher message families:

- `dispatcher.snapshot`
- `dispatcher.locomotive_status`
- `telemetry.frame`
- `health.update`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`

Main incoming client action:

- `dispatcher.chat`

## Frontend Surfaces

### Operator UI

The operator frontend in [front_locomotive](./front_locomotive) currently includes:

- Dashboard with health, contributing factors, alerts, live metrics, and export actions
- Telemetry page with smoothing, live trends, zoom presets, and CSV export
- Alerts page with CSV export
- Messages page
- Diagram page
- Replay page backed by dispatcher replay APIs and TimescaleDB data

### Dispatcher UI

The dispatcher frontend in [front_dispatcher](./front_dispatcher) focuses on:

- multi-locomotive monitoring
- connection and health visibility
- telemetry snapshots
- dispatcher chat

## Hackathon Evaluation Mapping

| Criteria | Current implemented coverage |
| --- | --- |
| Realtime visualization (35%) | Live telemetry streaming, health updates, smoothing, trend charts, subsystem views, alerts, messages |
| UI/UX (30%) | Multi-page operator UI, explainable health factors, replay UI, export actions, map prototype, interactive charts |
| Backend architecture (25%) | FastAPI APIs, configurable thresholds, API-key auth, Kafka ingest, TimescaleDB replay, Docker Compose stack |
| Demo quality (10%) | Root docs, architecture deep-dive, Docker startup flow, replay persistence, CSV export, print-friendly reporting |

## Related Docs

- [front_locomotive/README.md](./front_locomotive/README.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)
- [front_dispatcher/README.md](./front_dispatcher/README.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)
- [docs/HEALTH_INDEX_RULES.md](./docs/HEALTH_INDEX_RULES.md)
- [docs/STRESS_TESTING.md](./docs/STRESS_TESTING.md)
- [architecture.md](./architecture.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

## Screenshots

Screenshot set not committed yet.

Recommended additions for a follow-up docs pass:

- operator dashboard
- telemetry live trends
- replay page
- dispatcher console
- optional map view
