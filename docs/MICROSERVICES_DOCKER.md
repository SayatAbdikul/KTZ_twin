# Docker Microservices Stack

This stack simulates the current microservice split:

- `kafka`: message broker for service-to-service event streaming
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
- Kafka topic partitioning for expected locomotive / train streams
- frontend build-time API / WebSocket endpoints

Current Kafka partitioning rule:

- topic key: `locomotive_id`
- default topic partitions: `100`

This keeps one locomotive stream ordered within one partition while distributing about `1700` expected train streams across at most `100` partitions, or roughly `17` streams per partition on average.

Important: Kafka can increase topic partitions but cannot shrink them. If you already created the topic with more than `100` partitions, changing env config alone will not reduce it; recreate the topic or use a new topic name.

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
