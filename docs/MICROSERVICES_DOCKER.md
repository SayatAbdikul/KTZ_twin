# Docker Microservices Stack

This stack simulates the current microservice split:

- `back_locomotive`: replays `telemetry.csv`, publishes raw Kafka events, streams frontend frames over WebSocket
- `back_dispatcher`: consumes raw Kafka telemetry, keeps latest locomotive state, streams dispatcher updates over WebSocket
- `front_locomotive`: browser UI for locomotive telemetry
- `front_dispatcher`: browser UI for dispatcher monitoring
- `kafka`: single-node Kafka broker for local development

## Files

- Compose file: `docker-compose.microservices.yml`
- Start script: `scripts/start_microservices.sh`

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

- `3001`: `back_locomotive`
- `3010`: `back_dispatcher`
- `5173`: `front_locomotive`
- `5174`: `front_dispatcher`
- `29092`: Kafka broker exposed to the host

## Data Source

The compose stack mounts:

- `synthetic_output_core/telemetry.csv`

If the file is missing, the start script generates it by running:

```bash
python3 generate_core_synthetic_telemetry.py
```

## Notes

- Frontends are built into static bundles and served by `nginx`.
- Browser WebSocket targets are set at image build time:
  - locomotive frontend -> `ws://localhost:3001/ws`
  - dispatcher frontend -> `ws://localhost:3010/ws`
- Backend-to-backend traffic uses Kafka on the internal Docker network as `kafka:9092`.
