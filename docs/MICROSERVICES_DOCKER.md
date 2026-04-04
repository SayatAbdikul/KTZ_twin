# Docker Microservices Stack

This stack simulates the current microservice split:

- `kafka`: message broker for service-to-service event streaming
- `timescaledb`: operational datastore for dispatcher commands, messages, and alert events
- `back_locomotive`: generates synthetic telemetry and streams frontend frames over WebSocket
- `back_dispatcher`: consumes the locomotive WebSocket stream, keeps latest locomotive state, streams dispatcher updates over WebSocket
- `front_locomotive`: browser UI for locomotive telemetry
- `front_dispatcher`: browser UI for dispatcher monitoring

## Files

- Compose file: `docker-compose.microservices.yml`
- Start script: `scripts/start_microservices.sh`
- Env file: `.env.microservices`

## Usage

Bring the full stack up:

```bash
./scripts/start_microservices.sh up
```

Tail logs:

```bash
./scripts/start_microservices.sh logs
```

Stop everything:

```bash
./scripts/start_microservices.sh down
```

## Exposed Ports

- `9092`: `kafka`
- `5432`: `timescaledb`
- `9092`: `kafka`
- `3001`: `back_locomotive`
- `3010`: `back_dispatcher`
- `5183`: `front_locomotive`
- `5174`: `front_dispatcher`

## Configuration

The start script passes `.env.microservices` to Docker Compose explicitly.

Update that file if you need to change:

- backend ports and CORS origins
- dispatcher target WebSocket URLs
- ingest mode (`INGEST_MODE=ws|kafka|hybrid`)
- Kafka connection and topic settings
- database credentials and `DATABASE_URL`
- telemetry retention settings (`TELEMETRY_RETENTION_HOURS`)
- frontend build-time API / WebSocket endpoints

## Dispatcher DB Slice

Dispatcher persists the following entities to TimescaleDB/PostgreSQL:

- dispatcher commands (`dispatcher_commands`)
- incoming locomotive messages (`incoming_messages`)
- alert lifecycle events (`alert_events`)
- short-term telemetry points (`telemetry_points`)

Telemetry retention is controlled via `TELEMETRY_RETENTION_HOURS` (recommended 24-72).

Recent telemetry API for dashboards:

- `GET /api/locomotives/{locomotive_id}/telemetry/recent?minutes=5`
- `GET /api/locomotives/{locomotive_id}/telemetry/recent?minutes=15&metricId=motion.speed`

The `minutes` query is bounded by `RECENT_TELEMETRY_MAX_MINUTES` (default 15).

Alembic baseline files are in `back_dispatcher/app/alembic`.

Run migrations locally from `back_dispatcher` (after installing requirements):

```bash
alembic -c app/alembic.ini upgrade head
```

## Notes

- Frontends are built into static bundles and served by `nginx`.
- Browser WebSocket targets are set at image build time:
  - locomotive frontend -> `ws://localhost:3001/ws`
  - dispatcher frontend -> `ws://localhost:3010/ws`
- Backend-to-backend traffic uses the Docker network alias `back_locomotive`.

## Event Contract v1

Backend WS envelopes now include optional `event` metadata for producer/consumer validation:

```json
{
  "event_id": "uuid",
  "event_type": "telemetry.frame",
  "source": "back_locomotive",
  "locomotive_id": "KTZ-2001",
  "occurred_at": 1710000000000,
  "schema_version": "1.0"
}
```

Dispatcher validates incoming locomotive stream envelopes in both WS and Kafka paths and rejects frames when:

- `event` is missing
- `schema_version` is not `1.0`
- `event_type` differs from transport `type`
- `locomotive_id` does not match the configured target stream
