# Docker Microservices Stack

This stack simulates the current microservice split:

- `kafka`: message broker for locomotive event streaming
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
- `3001`: `back_locomotive`
- `3010`: `back_dispatcher`
- `5183`: `front_locomotive`
- `5174`: `front_dispatcher`

## Configuration

The start script passes `.env.microservices` to Docker Compose explicitly.

Update that file if you need to change:

- backend ports and CORS origins
- dispatcher target WebSocket URLs
- dispatcher ingest mode (`INGEST_MODE=ws|kafka|hybrid`)
- Kafka connection and topic settings
- frontend build-time API / WebSocket endpoints

## Notes

- Frontends are built into static bundles and served by `nginx`.
- Browser WebSocket targets are set at image build time:
  - locomotive frontend -> `ws://localhost:3001/ws`
  - dispatcher frontend -> `ws://localhost:3010/ws`
- Backend-to-backend traffic uses the Docker network alias `back_locomotive`.
