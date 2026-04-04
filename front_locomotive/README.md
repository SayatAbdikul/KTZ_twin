# front_locomotive

Operator-facing React application for the KTZ Digital Twin project.

This app renders the live locomotive cockpit, replay workspace, alerts, telemetry trends, health explainability, and export actions. For the full project overview and Docker-first startup flow, start with the root [README](../README.md).

## What This App Covers

- dashboard with overall health, subsystem status, contributing factors, alerts, live metrics, and export actions
- telemetry page with smoothing, live trend zoom presets, and telemetry CSV export
- alerts page with alert CSV export
- messages/inbox view
- locomotive diagram page
- replay page backed by dispatcher replay APIs

## Runtime Configuration

Important build/runtime inputs:

- `VITE_WS_URL`
- `VITE_API_BASE_URL`
- `VITE_REPLAY_API_BASE_URL`
- `VITE_API_KEY`
- `VITE_ENABLE_MOCKS`

In the Docker stack, these values are injected from `.env.microservices` through `docker-compose.microservices.yml`. That Docker configuration is the source of truth for the full system.

## Local Run

Install dependencies:

```bash
npm ci
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Notes

- Live REST calls target the locomotive backend.
- Replay HTTP calls target the dispatcher backend.
- WebSocket/API-key wiring depends on the configured env values.
- Mock mode is available through `VITE_ENABLE_MOCKS=true`.

See also:

- [../README.md](../README.md)
- [../docs/MICROSERVICES_DOCKER.md](../docs/MICROSERVICES_DOCKER.md)
- [../architecture.md](../architecture.md)
